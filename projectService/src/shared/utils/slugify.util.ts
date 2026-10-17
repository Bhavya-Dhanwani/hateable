// a single DNS label: lowercase letters, digits and inner hyphens, at most 63 characters
export const SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

// subdomains a user site may never claim
const RESERVED_SLUGS = new Set(['www', 'api', 'app', 'admin', 'mail']);

// function to turn a project name into a subdomain, "Shululu App!" -> "shululu-app"
function slugify(name: string) {
  const slug = name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '') // drop accents left behind by NFKD
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .slice(0, 40)
    .replace(/^-+|-+$/g, '');

  // falling back to a generic name for empty or reserved names
  return slug && !RESERVED_SLUGS.has(slug) ? slug : `site-${slug || 'app'}`;
}

export default slugify;
