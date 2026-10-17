// Importing modules
import env from '../config/env.config.js';

// a registrable hostname: at least two labels, each 1-63 chars of letters/digits/inner hyphens
const HOSTNAME =
  /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z][a-z0-9-]{0,61}[a-z0-9]$/;

/**
 * Normalizes what a user typed ("https://WWW.Shop.com/" -> "www.shop.com") and checks it can be
 * connected to a deployment. Returns the domain or the problem, for the user.
 */
export function normalizeDomain(input: unknown): { domain: string } | { error: string } {
  if (typeof input !== 'string' || !input.trim())
    return { error: 'Enter a domain, e.g. www.example.com' };

  const domain = input
    .trim()
    .toLowerCase()
    .replace(/^[a-z]+:\/\//, '') // a pasted URL
    .replace(/[/?#].*$/, '')
    .replace(/:\d+$/, '')
    .replace(/\.$/, '');

  if (!HOSTNAME.test(domain)) return { error: `"${domain}" is not a valid domain` };

  const deployDomain = env.DEPLOY_DOMAIN.toLowerCase();
  if (domain === deployDomain || domain.endsWith(`.${deployDomain}`)) {
    return { error: `Subdomains of ${deployDomain} are hateable's own` };
  }
  if (domain === new URL(env.APP_URL).hostname) return { error: 'That is the hateable app itself' };

  // *.localhost always resolves to this machine, so it can only mean something in development
  if (domain.endsWith('.localhost') && env.NODE_ENV === 'production') {
    return { error: '.localhost domains only work in development' };
  }

  return { domain };
}

// a bare domain ("shop.com") cannot have a CNAME, so it needs an A record instead
// ponytail: counts labels, so "shop.co.uk" looks like a subdomain; use the public suffix list if that matters
export const isApex = (domain: string) => domain.split('.').length === 2;

// the TXT record that proves the user controls the domain
export const challengeHost = (domain: string) => `_hateable.${domain}`;
