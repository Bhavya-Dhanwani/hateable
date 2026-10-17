// Importing modules
import https from 'node:https';
import type { Writable } from 'node:stream';
import * as k8s from '@kubernetes/client-node';
import logger from '../config/logger.config.js';
import { redis } from './redis.service.js';
import { optimizeLogs, type LogLevel, type LogLine } from '../utils/logOptimizer.util.js';

/**
 * Logs for the two audiences:
 *
 * - development: the raw, live output of the preview pod's app containers, streamed as is.
 * - deployments: optimized logs (logOptimizer.util.ts) plus lifecycle events (deployed, woke,
 *   slept, failed requests). A sleeping deployment has no pod and therefore no logs, so the app
 *   log is snapshotted into Redis right before the pod is deleted, and events live in Redis.
 */

const kc = new k8s.KubeConfig();
kc.loadFromCluster();
const coreApi = kc.makeApiClient(k8s.CoreV1Api);

const EVENTS_KEY = (slug: string) => `deploy:events:${slug}`;
const SNAPSHOT_KEY = (slug: string) => `deploy:applogs:${slug}`;
const MAX_EVENTS = 200;
const TAIL_LINES = 500;

export type DeployEvent = { at: string; level: LogLevel; message: string };

// app containers of a project type (MERN runs a client and a server side by side)
export const appContainersOf = (projectType: string) =>
  projectType === 'mern-js' || projectType === 'mern-ts'
    ? ['client-container', 'server-container']
    : ['app-container'];

// function to read the last lines of every app container, prefixed when there is more than one
async function readPodLogs(podName: string, projectType: string) {
  const containers = appContainersOf(projectType);
  const logs = await Promise.all(
    containers.map(async (container) => {
      const text = await coreApi.readNamespacedPodLog({
        name: podName,
        namespace: 'default',
        container,
        tailLines: TAIL_LINES,
        timestamps: true
      });
      const tag = containers.length > 1 ? `[${container.replace('-container', '')}] ` : '';
      // keeping the k8s timestamp first so the optimizer can still read it
      return String(text)
        .split('\n')
        .filter(Boolean)
        .map((line) => line.replace(/^(\S+)\s/, `$1 ${tag}`));
    })
  );
  // interleaving containers by time; numerically, since k8s trims trailing zeros from the
  // fraction ("…10.12Z" vs "…10.1234567Z") and a text sort would reorder lines; stable, so lines
  // of the same millisecond (an error and its stack frames) keep their order
  const timeOf = (line: string) => Date.parse(line.slice(0, line.indexOf(' '))) || 0;
  return logs.flat().sort((a, b) => timeOf(a) - timeOf(b));
}

// function to append a lifecycle event to a deployment's log (newest first, capped)
export async function recordDeployEvent(slug: string, level: LogLevel, message: string) {
  const event: DeployEvent = { at: new Date().toISOString(), level, message };
  try {
    await redis
      .multi()
      .lpush(EVENTS_KEY(slug), JSON.stringify(event))
      .ltrim(EVENTS_KEY(slug), 0, MAX_EVENTS - 1)
      .exec();
  } catch (error) {
    logger.warn(error, `Failed to record a deploy event for ${slug}`);
  }
}

// function to keep the last app log of a deployment pod before it is deleted
export async function snapshotDeploymentLogs(slug: string, podName: string, projectType: string) {
  try {
    const lines = optimizeLogs(await readPodLogs(podName, projectType));
    await redis.set(SNAPSHOT_KEY(slug), JSON.stringify(lines));
  } catch (error) {
    // the pod may never have started; the events still tell the story
    logger.warn(error, `Could not snapshot the logs of ${podName}`);
  }
}

/**
 * Logs of a deployment for its owner: live from the pod when it is awake, otherwise the
 * snapshot taken when it went to sleep.
 */
export async function getDeploymentLogs(
  slug: string,
  podName: string,
  projectType: string,
  awake: boolean
) {
  let app: LogLine[] | null = null;
  let source: 'live' | 'last-run' | 'none' = 'none';

  if (awake) {
    try {
      app = optimizeLogs(await readPodLogs(podName, projectType));
      source = 'live';
    } catch {
      // still starting: fall back to the previous run
    }
  }

  if (!app) {
    const snapshot = await redis.get(SNAPSHOT_KEY(slug));
    app = snapshot ? JSON.parse(snapshot) : [];
    source = snapshot ? 'last-run' : 'none';
  }

  const events = (await redis.lrange(EVENTS_KEY(slug), 0, MAX_EVENTS - 1)).map(
    (raw) => JSON.parse(raw) as DeployEvent
  );

  return { source, app, events };
}

// function to drop everything logged for a deployment, used when it is unpublished
export async function deleteDeploymentLogs(slug: string) {
  await redis.del(EVENTS_KEY(slug), SNAPSHOT_KEY(slug));
}

// function to follow one container's log, returning a function that stops it
async function followContainer(podName: string, container: string, out: Writable) {
  // not k8s.Log: aborting its stream emits an 'error' nobody listens to, which crashes the
  // process whenever a viewer closes the logs panel; owning the request lets us stop it safely
  const url = new URL(
    `${kc.getCurrentCluster()!.server}/api/v1/namespaces/default/pods/${podName}/log`
  );
  url.search = new URLSearchParams({ container, follow: 'true', tailLines: '200' }).toString();
  const options: https.RequestOptions = { method: 'GET' };
  await kc.applyToHTTPSOptions(options);

  return new Promise<() => void>((resolve, reject) => {
    const req = https.request(url, options, (res) => {
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error(`Log request for ${container} failed: ${res.statusCode}`));
      }
      res.on('data', (chunk) => out.writable && out.write(chunk));
      res.on('error', () => {}); // the stop below destroys the response mid-stream
      resolve(() => req.destroy());
    });
    req.on('error', reject); // after a stop this is a no-op, but it must be listened to
    req.end();
  });
}

/**
 * Follows the raw output of a preview pod's app containers, writing their chunks to `out`.
 * Returns a function that stops following.
 */
export async function followPreviewLogs(podName: string, projectType: string, out: Writable) {
  const stops = await Promise.all(
    appContainersOf(projectType).map((container) => followContainer(podName, container, out))
  );
  return () => stops.forEach((stop) => stop());
}
