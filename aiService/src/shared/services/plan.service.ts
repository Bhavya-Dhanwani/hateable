// Plan limits enforced by aiService. The plan comes from the access token (authService puts the
// user's `plan` in it); anything missing or unknown is treated as free.
// ponytail: projectService keeps its own copy of its limits, move both to a shared package if they drift
import { getRedisClient } from '../config/redis.config.js';
import Project from '../models/project.model.js';
import ApiError from '../utils/ApiError.util.js';

export type Plan = 'free' | 'pro' | 'team';

export const AI_LIMITS: Record<
  Plan,
  { messagesPerDay: number; extrasEverywhere: boolean; maxAgents?: number }
> = {
  // extras = AI image generation, the real-browser test and the live-site AI.
  // maxAgents caps how many agents one run may hire; unset = the MAX_AGENTS env (longer runs)
  free: { messagesPerDay: 2, extrasEverywhere: false, maxAgents: 40 },
  pro: { messagesPerDay: 100, extrasEverywhere: true },
  team: { messagesPerDay: 500, extrasEverywhere: true }
};

export const planOf = (user: { plan?: unknown } | undefined): Plan =>
  user?.plan === 'pro' || user?.plan === 'team' ? user.plan : 'free';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Whose allowance a message comes out of: a workspace project draws on the workspace's shared
 * Team pool whoever sends it, anything else on the sender's own plan.
 */
export function usagePool(
  user: { userId?: unknown; _id?: unknown; plan?: unknown } | undefined,
  project: { workspaceId?: string }
): { key: string; plan: Plan } {
  return project.workspaceId
    ? { key: `ws:${project.workspaceId}`, plan: 'team' }
    : { key: String(user?.userId || user?._id || ''), plan: planOf(user) };
}

// one entry per message in the pool's 24h window: "<sentAt>:<userId>:<projectId>:<nonce>"
const entry = (now: number, userId: string, projectId: string) =>
  `${now}:${userId}:${projectId}:${Math.random().toString(36).slice(2, 8)}`;

/**
 * Counts one AI message against the pool's rolling 24 hour window, or throws a 429 saying
 * when the next one frees up. A sorted set of send times per pool, trimmed on every call; each
 * entry names the sender and project, and an all-time per member/project tally feeds analytics.
 * ponytail: counts messages, not tokens; check-then-add, so two sends at the same instant can
 * both pass the last slot. Switch to summed token usage if message size starts to matter.
 */
export async function takeMessage(
  pool: { key: string; plan: Plan },
  sender: { userId: string; projectId: string }
) {
  const redis = getRedisClient();
  const key = `ai-usage:${pool.key}`;
  const { plan } = pool;
  const now = Date.now();
  const limit = AI_LIMITS[plan].messagesPerDay;

  await redis.zremrangebyscore(key, '-inf', now - DAY_MS);
  const used = await redis.zcard(key);

  if (used >= limit) {
    const [, oldest] = await redis.zrange(key, '0', '0', 'WITHSCORES');
    const hours = Math.max(1, Math.ceil((Number(oldest) + DAY_MS - now) / 3600000));
    throw new ApiError(
      429,
      plan === 'free'
        ? `The Hobby plan includes ${limit} AI messages every 24 hours. Your next one frees up in about ${hours}h, or upgrade to Pro for more.`
        : `${plan === 'team' ? 'Your team has' : "You've"} used all ${limit} AI messages for the last 24 hours. The next one frees up in about ${hours}h.`
    );
  }

  await redis.zadd(key, now, entry(now, sender.userId, sender.projectId));
  await redis.pexpire(key, DAY_MS);
  await redis.hincrby(`ai-usage-total:${pool.key}`, `${sender.userId}:${sender.projectId}`, 1);
}

/**
 * Per member and project message counts for a pool: in the current 24h window and all time.
 */
export async function usageOf(pool: { key: string; plan: Plan }) {
  const redis = getRedisClient();
  const now = Date.now();
  await redis.zremrangebyscore(`ai-usage:${pool.key}`, '-inf', now - DAY_MS);
  const [window, totals] = await Promise.all([
    redis.zrange(`ai-usage:${pool.key}`, '0', '-1'),
    redis.hgetall(`ai-usage-total:${pool.key}`)
  ]);
  return {
    limit: AI_LIMITS[pool.plan].messagesPerDay,
    used: window.length,
    rows: tally(window, totals)
  };
}

// folds window entries and all-time totals into one row per member and project
export function tally(window: string[], totals: Record<string, string>) {
  const rows = new Map<
    string,
    { userId: string; projectId: string; last24h: number; total: number }
  >();
  const row = (userId: string, projectId: string) => {
    const id = `${userId}:${projectId}`;
    if (!rows.has(id)) rows.set(id, { userId, projectId, last24h: 0, total: 0 });
    return rows.get(id)!;
  };
  for (const [id, count] of Object.entries(totals)) {
    const [userId, projectId] = id.split(':');
    row(userId, projectId).total = Number(count);
  }
  // entries from before the per-member format ("<sentAt>-<nonce>") count in `used` only
  for (const e of window) {
    const [, userId, projectId] = e.split(':');
    if (userId && projectId) row(userId, projectId).last24h++;
  }
  return [...rows.values()].sort((a, b) => b.total - a.total);
}

/**
 * Whether AI image generation, the browser test and the live-site AI are on for a project:
 * always on paid plans, and on the free plan only for the user's first (oldest) project.
 */
export async function extrasAllowed(userId: string, plan: Plan, projectId: string) {
  if (AI_LIMITS[plan].extrasEverywhere) return true;
  const first = await Project.findOne({ userId, workspaceId: null }, { projectId: 1 }).sort({
    createdAt: 1
  });
  // no synced projects yet (older data): don't punish the user for it
  return !first || first.projectId === projectId;
}
