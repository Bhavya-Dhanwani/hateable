// Importing modules
import { promises as dns } from 'node:dns';
import env from '../config/env.config.js';
import CustomDomain from '../models/customDomain.model.js';
import { challengeHost, isApex } from '../utils/domain.util.js';

/**
 * Custom domains: www.shop.com serving the deployment `shululu`.
 *
 * Ownership is proven with a TXT record at _hateable.<domain> holding a random token, so nobody
 * can attach a domain they do not control (an A record alone would not prove that: every
 * domain pointed at the shared ingress looks the same). Routing is the owner's CNAME to
 * <slug>.<DEPLOY_DOMAIN>, or an A record to the ingress for a bare domain.
 */

// hosts are looked up on every proxied request: keep answers (hits and misses) for a short while
const CACHE_MS = 30_000;
const cache = new Map<string, { slug: string | null; until: number }>();

/**
 * The deployment slug a verified custom domain serves, or null. Cached for 30s per host,
 * so a newly verified or removed domain takes effect within that window on every replica.
 */
export async function slugForHost(hostname: string) {
  const hit = cache.get(hostname);
  if (hit && hit.until > Date.now()) return hit.slug;

  const found = await CustomDomain.findOne({ domain: hostname, verified: true }).select('slug');
  const slug = found?.slug ?? null;
  cache.set(hostname, { slug, until: Date.now() + CACHE_MS });
  return slug;
}

// function to make this replica forget a domain right away (after verify / remove)
export const forgetHost = (hostname: string) => cache.delete(hostname);

// the DNS records the owner has to create, for the dashboard
export function dnsInstructions(domain: string, slug: string, token: string) {
  const routing = isApex(domain)
    ? {
        type: 'A',
        name: domain,
        value: env.DEPLOY_INGRESS_IP || '(the public IP of your hateable ingress)'
      }
    : { type: 'CNAME', name: domain, value: `${slug}.${env.DEPLOY_DOMAIN}` };

  return [{ type: 'TXT', name: challengeHost(domain), value: `hateable-verify=${token}` }, routing];
}

// function to read DNS without throwing: missing records are a normal state here
const quietly = async <T>(lookup: Promise<T>) => {
  try {
    return await lookup;
  } catch {
    return null;
  }
};

/**
 * Checks the owner's DNS: is the TXT challenge there (ownership), and does traffic reach us
 * (CNAME to the deployment, or A record to the ingress)?
 */
export async function checkDns(domain: string, slug: string, token: string) {
  // *.localhost resolves to this machine by definition and cannot carry TXT records: dev only
  if (domain.endsWith('.localhost') && env.NODE_ENV !== 'production') {
    return { ownership: true, routing: true };
  }

  const txt = await quietly(dns.resolveTxt(challengeHost(domain)));
  const ownership = Boolean(txt?.some((chunks) => chunks.join('') === `hateable-verify=${token}`));

  const target = `${slug}.${env.DEPLOY_DOMAIN}`.toLowerCase();
  const cname = await quietly(dns.resolveCname(domain));
  const a = await quietly(dns.resolve4(domain));
  const routing =
    Boolean(cname?.some((name) => name.toLowerCase().replace(/\.$/, '') === target)) ||
    Boolean(env.DEPLOY_INGRESS_IP && a?.includes(env.DEPLOY_INGRESS_IP));

  return { ownership, routing };
}
