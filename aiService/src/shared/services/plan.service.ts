// Plan limits enforced by aiService. The plan comes from the access token (authService puts the
// user's `plan` in it); anything missing or unknown is treated as free.
// ponytail: projectService keeps its own copy of its limits, move both to a shared package if they drift
import { getRedisClient } from '../config/redis.config.js';
import Project from '../models/project.model.js';
import ApiError from '../utils/ApiError.util.js';

export type Plan = 'free' | 'pro' | 'team';

export const AI_LIMITS: Record<Plan, { messagesPerDay: number; extrasEverywhere: boolean }> = {
  // extras = AI image generation, the real-browser test and the live-site AI
  free: { messagesPerDay: 2, extrasEverywhere: false },
  pro: { messagesPerDay: 100, extrasEverywhere: true },
  team: { messagesPerDay: 500, extrasEverywhere: true }
};

export const planOf = (user: { plan?: unknown } | undefined): Plan =>
  user?.plan === 'pro' || user?.plan === 'team' ? user.plan : 'free';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Counts one AI message against the user's rolling 24 hour window, or throws a 429 saying
 * when the next one frees up. A sorted set of send times per user, trimmed on every call.
 * ponytail: counts messages, not tokens; check-then-add, so two sends at the same instant can
 * both pass the last slot. Switch to summed token usage if message size starts to matter.
 */
export async function takeMessage(userId: string, plan: Plan) {
  const redis = getRedisClient();
  const key = `ai-usage:${userId}`;
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
        : `You've used all ${limit} AI messages for the last 24 hours. The next one frees up in about ${hours}h.`
    );
  }

  await redis.zadd(key, now, `${now}-${Math.random().toString(36).slice(2, 8)}`);
  await redis.pexpire(key, DAY_MS);
}

/**
 * Whether AI image generation, the browser test and the live-site AI are on for a project:
 * always on paid plans, and on the free plan only for the user's first (oldest) project.
 */
export async function extrasAllowed(userId: string, plan: Plan, projectId: string) {
  if (AI_LIMITS[plan].extrasEverywhere) return true;
  const first = await Project.findOne({ userId }, { projectId: 1 }).sort({ createdAt: 1 });
  // no synced projects yet (older data): don't punish the user for it
  return !first || first.projectId === projectId;
}
