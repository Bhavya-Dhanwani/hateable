// Importing modules
import { createHash } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import { redis } from './redis.service.js';
import { browserFromUserAgent, deviceFromUserAgent } from '../utils/userAgent.util.js';

/**
 * Deployment analytics, kept as Redis counters.
 *
 * Every response the proxy sends back from a deployment calls `recordHit`, which
 * writes a handful of counters in one MULTI. Nothing personal is stored: a visitor
 * is a truncated SHA-256 of ip + user agent, and unique counts use HyperLogLog
 * (PFADD / PFCOUNT), a ~12KB sketch per key with ~1% error no matter how many visitors.
 *
 * ponytail: counters live only in Redis, enable AOF/RDB persistence (or roll days up into Mongo) if they must survive a Redis wipe
 */

// all keys of a deployment share this prefix so they can be dropped together
const keyOf = (slug: string, name: string) => `analytics:${slug}:${name}`;

// daily keys are kept a little longer than the longest range the dashboard shows
const DAILY_RETENTION_SECONDS = 35 * 24 * 60 * 60;

// a visitor counts as "live" when they loaded a page within this window
const LIVE_WINDOW_MS = 5 * 60 * 1000;

// top-N lists keep this many entries so random URLs from bots cannot grow them forever
const TOP_LIST_SIZE = 200;

// function to get the YYYY-MM-DD bucket of a timestamp
const dayOf = (time: number) => new Date(time).toISOString().slice(0, 10);

// function to read the client ip, ingress-nginx puts the original one first in x-forwarded-for
function clientIp(req: IncomingMessage) {
  const forwarded = req.headers['x-forwarded-for'];
  const first = (Array.isArray(forwarded) ? forwarded[0] : forwarded)?.split(',')[0]?.trim();
  return first || req.socket.remoteAddress || '';
}

// a navigation to a document, as opposed to the js, css and images it loads
export function isPageView(req: IncomingMessage) {
  if (req.method !== 'GET') return false;
  if (req.headers['sec-fetch-dest']) return req.headers['sec-fetch-dest'] === 'document';
  return (req.headers.accept || '').includes('text/html');
}

// function to keep only external referrers, as a bare host
function referrerHost(req: IncomingMessage) {
  try {
    const host = new URL(req.headers.referer || '').host;
    return host && host !== req.headers.host ? host : null;
  } catch {
    return null;
  }
}

/**
 * Records one proxied response of a deployment.
 *
 * Fire-and-forget: errors are logged and swallowed so analytics can never break a site.
 *
 * @param slug Deployment subdomain.
 * @param req The visitor's request.
 * @param statusCode Status the deployment answered with.
 * @param durationMs Time from request to upstream response headers.
 */
export async function recordHit(
  slug: string,
  req: IncomingMessage,
  statusCode: number,
  durationMs: number
) {
  const now = Date.now();
  const day = dayOf(now);

  const pipeline = redis
    .multi()
    .hincrby(keyOf(slug, 'totals'), 'requests', 1)
    .hincrby(keyOf(slug, 'totals'), 'responseMs', Math.round(durationMs))
    .hincrby(keyOf(slug, 'status'), `${Math.floor(statusCode / 100)}xx`, 1)
    .incr(keyOf(slug, `requests:${day}`))
    .expire(keyOf(slug, `requests:${day}`), DAILY_RETENTION_SECONDS);

  if (isPageView(req)) {
    const userAgent = req.headers['user-agent'] || '';
    const visitor = createHash('sha256')
      .update(`${clientIp(req)}|${userAgent}`)
      .digest('hex')
      .slice(0, 16);
    const path = (req.url || '/').split('?')[0].slice(0, 200);
    const referrer = referrerHost(req);

    pipeline
      .hincrby(keyOf(slug, 'totals'), 'views', 1)
      .incr(keyOf(slug, `views:${day}`))
      .expire(keyOf(slug, `views:${day}`), DAILY_RETENTION_SECONDS)
      .pfadd(keyOf(slug, 'visitors'), visitor)
      .pfadd(keyOf(slug, `visitors:${day}`), visitor)
      .expire(keyOf(slug, `visitors:${day}`), DAILY_RETENTION_SECONDS)
      .zadd(keyOf(slug, 'live'), now, visitor)
      .zincrby(keyOf(slug, 'paths'), 1, path)
      .zremrangebyrank(keyOf(slug, 'paths'), 0, -TOP_LIST_SIZE - 1)
      .hincrby(keyOf(slug, 'devices'), deviceFromUserAgent(userAgent), 1)
      .hincrby(keyOf(slug, 'browsers'), browserFromUserAgent(userAgent), 1);

    if (referrer) {
      pipeline
        .zincrby(keyOf(slug, 'referrers'), 1, referrer)
        .zremrangebyrank(keyOf(slug, 'referrers'), 0, -TOP_LIST_SIZE - 1);
    }
  }

  try {
    await pipeline.exec();
  } catch (error) {
    console.error(`[analytics] failed to record hit for ${slug}:`, error);
  }
}

// function to count a cold start, shown on the dashboard as "wake-ups"
export async function recordWake(slug: string) {
  await redis.hincrby(keyOf(slug, 'totals'), 'wakes', 1);
}

// function to turn a ZREVRANGE ... WITHSCORES reply into [{ name, count }]
function toRanking(reply: string[]) {
  const ranking: Array<{ name: string; count: number }> = [];
  for (let i = 0; i < reply.length; i += 2) {
    ranking.push({ name: reply[i], count: Number(reply[i + 1]) });
  }
  return ranking;
}

// function to turn an HGETALL reply into numbers
const toCounts = (hash: Record<string, string>) =>
  Object.fromEntries(Object.entries(hash).map(([key, value]) => [key, Number(value)]));

/**
 * Reads the dashboard of a deployment in one round trip.
 *
 * @param slug Deployment subdomain.
 * @param days How many daily buckets to return, oldest first.
 */
export async function getAnalytics(slug: string, days: number) {
  const now = Date.now();
  const dayKeys = Array.from({ length: days }, (_, i) =>
    dayOf(now - (days - 1 - i) * 24 * 60 * 60 * 1000)
  );

  const pipeline = redis
    .multi()
    .zremrangebyscore(keyOf(slug, 'live'), 0, now - LIVE_WINDOW_MS)
    .zcard(keyOf(slug, 'live'))
    .hgetall(keyOf(slug, 'totals'))
    .pfcount(keyOf(slug, 'visitors'))
    .zrevrange(keyOf(slug, 'paths'), 0, 9, 'WITHSCORES')
    .zrevrange(keyOf(slug, 'referrers'), 0, 9, 'WITHSCORES')
    .hgetall(keyOf(slug, 'devices'))
    .hgetall(keyOf(slug, 'browsers'))
    .hgetall(keyOf(slug, 'status'));

  for (const day of dayKeys) {
    pipeline
      .get(keyOf(slug, `views:${day}`))
      .pfcount(keyOf(slug, `visitors:${day}`))
      .get(keyOf(slug, `requests:${day}`));
  }

  // every reply is [error, value], a failed MULTI rejects as a whole
  const replies = ((await pipeline.exec()) || []).map(([, value]) => value);
  const [, live, totals, visitors, paths, referrers, devices, browsers, status] = replies as [
    number,
    number,
    Record<string, string>,
    number,
    string[],
    string[],
    Record<string, string>,
    Record<string, string>,
    Record<string, string>
  ];
  const daily = replies.slice(9);
  const totalCounts = toCounts(totals);

  return {
    liveVisitors: live,
    totals: {
      views: totalCounts.views || 0,
      visitors,
      requests: totalCounts.requests || 0,
      wakes: totalCounts.wakes || 0,
      avgResponseMs: totalCounts.requests
        ? Math.round((totalCounts.responseMs || 0) / totalCounts.requests)
        : 0
    },
    daily: dayKeys.map((date, i) => ({
      date,
      views: Number(daily[i * 3] || 0),
      visitors: Number(daily[i * 3 + 1] || 0),
      requests: Number(daily[i * 3 + 2] || 0)
    })),
    topPages: toRanking(paths),
    topReferrers: toRanking(referrers),
    devices: toCounts(devices),
    browsers: toCounts(browsers),
    statusCodes: toCounts(status)
  };
}

// function to drop every analytics key of a deployment, used when it is unpublished
export async function deleteAnalytics(slug: string) {
  const stream = redis.scanStream({ match: keyOf(slug, '*'), count: 200 });

  for await (const keys of stream) {
    if ((keys as string[]).length) await redis.del(...(keys as string[]));
  }
}
