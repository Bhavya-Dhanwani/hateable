import { redis, redisSubscriber } from './redis.service.js';
import { deletePod, deleteService } from './k8s.service.js';
import Project from '../models/project.model.js';
import env from '../config/env.config.js';

/**
 * Idle preview reaper.
 *
 * Every proxied request for a preview refreshes a short-lived Redis key. When a
 * preview stops receiving traffic the key expires, Redis emits a keyspace
 * `expired` event, and the subscriber below deletes the backing pod and service.
 *
 * Requires `notify-keyspace-events` to include `Ex` on the Redis server.
 */

/** Key whose expiry means "this preview has been idle for too long". */
const ACTIVITY_KEY_PREFIX = 'preview:active:';
/** Short-lived lock so only one replica reaps a given preview. */
const REAP_LOCK_PREFIX = 'preview:reaping:';
/** Fan-out channel of activity pings, one message per tracked request. */
const ACTIVITY_CHANNEL = 'preview:activity';
/** Fan-out channel announcing a preview whose pod and service were deleted. */
const REAPED_CHANNEL = 'preview:reaped';

/** Key whose expiry means "this deployment had no visitor for DEPLOY_IDLE_TTL_MS". */
const DEPLOY_ACTIVITY_KEY_PREFIX = 'deploy:active:';
/** Short-lived lock so only one replica puts a given deployment to sleep. */
const DEPLOY_REAP_LOCK_PREFIX = 'deploy:reaping:';

/** How long a preview may go without traffic before it is torn down. */
const IDLE_TTL_MS = Number(process.env.PREVIEW_IDLE_TTL_MS || 10 * 60 * 1000);

const reapedHandlers: Array<(uniqueId: string) => void> = [];

/**
 * Registers a local listener for `preview:reaped` messages, letting each replica
 * clean up in-process state (such as cached proxies) for a deleted preview.
 *
 * @param handler Called with the unique id of the reaped preview.
 */
export function onPreviewReaped(handler: (uniqueId: string) => void) {
  reapedHandlers.push(handler);
}

/**
 * Refreshes the idle timer for a preview. The key's expiry is what later
 * triggers the Redis keyspace event that reaps the pod and service.
 *
 * Failures are logged rather than thrown so a Redis outage never breaks proxying.
 *
 * @param uniqueId Preview id taken from the request subdomain.
 */
export async function recordActivity(uniqueId: string) {
  try {
    await redis
      .multi()
      .set(`${ACTIVITY_KEY_PREFIX}${uniqueId}`, Date.now().toString(), 'PX', IDLE_TTL_MS)
      .publish(ACTIVITY_CHANNEL, uniqueId)
      .exec();
  } catch (error) {
    console.error(`[idle-reaper] failed to record activity for ${uniqueId}:`, error);
  }
}

/**
 * Drops the activity key without triggering a teardown, for previews that are
 * deleted through some other path.
 *
 * @param uniqueId Preview id to stop tracking.
 */
export async function stopTracking(uniqueId: string) {
  await redis.del(`${ACTIVITY_KEY_PREFIX}${uniqueId}`);
}

/**
 * Slides the 15 minute idle window of a deployment that is awake.
 *
 * `XX` only refreshes an existing key, so the reply doubles as the "is it awake?"
 * check: `false` means the deployment is asleep and must be woken by the caller.
 *
 * @param slug Deployment subdomain taken from the request host.
 */
export async function touchDeployment(slug: string) {
  const reply = await redis.set(
    `${DEPLOY_ACTIVITY_KEY_PREFIX}${slug}`,
    Date.now().toString(),
    'PX',
    env.DEPLOY_IDLE_TTL_MS,
    'XX'
  );
  return reply === 'OK';
}

/**
 * Starts the idle window of a sleeping deployment. `NX` makes this a claim: when
 * many visitors hit a sleeping site at once, exactly one of them wakes it up.
 *
 * @param slug Deployment subdomain to wake.
 * @returns `true` for the caller that should start the pod.
 */
export async function claimDeploymentWake(slug: string) {
  const reply = await redis.set(
    `${DEPLOY_ACTIVITY_KEY_PREFIX}${slug}`,
    Date.now().toString(),
    'PX',
    env.DEPLOY_IDLE_TTL_MS,
    'NX'
  );
  return reply === 'OK';
}

/**
 * Milliseconds left before an idle deployment is put to sleep, `0` when it is asleep.
 *
 * @param slug Deployment subdomain.
 */
export async function getDeploymentIdleRemaining(slug: string) {
  return Math.max(0, await redis.pttl(`${DEPLOY_ACTIVITY_KEY_PREFIX}${slug}`));
}

/**
 * Drops the idle window without triggering a teardown, for deployments that were
 * removed by the user or that failed to start.
 *
 * @param slug Deployment subdomain to stop tracking.
 */
export async function stopTrackingDeployment(slug: string) {
  await redis.del(`${DEPLOY_ACTIVITY_KEY_PREFIX}${slug}`);
}

/**
 * Puts an idle deployment to sleep by deleting its pod and service. The Deployment
 * document and its S3 snapshot stay, so the next visitor can wake it up again.
 *
 * @param slug Deployment subdomain extracted from the expired key.
 */
async function sleepDeployment(slug: string) {
  // Only one replica should act on the expiry event.
  const acquired = await redis.set(`${DEPLOY_REAP_LOCK_PREFIX}${slug}`, '1', 'EX', 60, 'NX');

  if (!acquired) {
    return;
  }

  try {
    // A visitor may have woken it again between the expiry and this event.
    if (await redis.exists(`${DEPLOY_ACTIVITY_KEY_PREFIX}${slug}`)) {
      return;
    }

    console.log(`[idle-reaper] deployment ${slug} is idle, putting it to sleep`);

    await deleteService(`deploy-service-${slug}`);
    await deletePod(`deploy-pod-${slug}`);
  } catch (error) {
    console.error(`[idle-reaper] failed to put ${slug} to sleep:`, error);
  } finally {
    await redis.del(`${DEPLOY_REAP_LOCK_PREFIX}${slug}`);
  }
}

/**
 * Deletes the service and pod of an idle preview and announces the teardown.
 *
 * The expiry event reaches every subscribed replica, so a `SET NX` lock ensures
 * exactly one of them performs the deletion. The lock is released on failure so
 * a later expiry can retry.
 *
 * @param uniqueId Preview id extracted from the expired key.
 */
async function reap(uniqueId: string) {
  // Only one replica should act on the expiry event.
  const acquired = await redis.set(`${REAP_LOCK_PREFIX}${uniqueId}`, '1', 'EX', 60, 'NX');

  if (!acquired) {
    return;
  }

  console.log(`[idle-reaper] preview ${uniqueId} is idle, tearing down`);

  try {
    await deleteService(`nextjs-service-${uniqueId}`);
    await deletePod(`nextjs-pod-${uniqueId}`);
    await Project.findByIdAndUpdate(uniqueId, { status: 'stopped' });
    await redis.publish(REAPED_CHANNEL, uniqueId);
  } catch (error) {
    console.error(`[idle-reaper] failed to tear down ${uniqueId}:`, error);
    await redis.del(`${REAP_LOCK_PREFIX}${uniqueId}`);
  }
}

/**
 * Enables keyspace expiry notifications and starts listening for idle previews.
 * Call once during startup, before the HTTP server begins accepting traffic.
 */
export async function startIdleReaper() {
  const db = redis.options.db ?? 0;
  const expiredChannel = `__keyevent@${db}__:expired`;

  try {
    // Redis does not emit expiry events unless keyspace notifications are enabled.
    const [, current] = (await redis.config('GET', 'notify-keyspace-events')) as [string, string];
    if (!current.includes('E') || !current.includes('x')) {
      await redis.config('SET', 'notify-keyspace-events', `${current}Ex`);
    }
  } catch (error) {
    console.warn(
      "[idle-reaper] could not enable keyspace notifications, enable 'Ex' on the server:",
      error
    );
  }

  await redisSubscriber.subscribe(expiredChannel, REAPED_CHANNEL);

  redisSubscriber.on('message', (channel, message) => {
    if (channel === expiredChannel && message.startsWith(ACTIVITY_KEY_PREFIX)) {
      void reap(message.slice(ACTIVITY_KEY_PREFIX.length));
      return;
    }

    if (channel === expiredChannel && message.startsWith(DEPLOY_ACTIVITY_KEY_PREFIX)) {
      void sleepDeployment(message.slice(DEPLOY_ACTIVITY_KEY_PREFIX.length));
      return;
    }

    if (channel === REAPED_CHANNEL) {
      reapedHandlers.forEach((handler) => handler(message));
    }
  });

  console.log(
    `[idle-reaper] listening on ${expiredChannel} (idle ttl ${IDLE_TTL_MS}ms, deployments ${env.DEPLOY_IDLE_TTL_MS}ms)`
  );
}
