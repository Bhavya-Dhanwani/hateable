// Truecaller mobile-web SDK helpers
// docs: https://docs.truecaller.com/truecaller-sdk/mobile-websites/integrating-with-your-mobile-website
import env from '../config/env.config.js';

// deep link the frontend opens to show Truecaller's consent sheet (Android browsers only)
function buildTruecallerDeepLink(requestNonce: string) {
  const params = new URLSearchParams({
    type: 'btmsheet',
    requestNonce,
    partnerKey: env.TRUECALLER_APP_KEY || '',
    partnerName: env.TRUECALLER_PARTNER_NAME,
    lang: 'en',
    loginPrefix: 'continue',
    loginSuffix: 'verifymobile',
    ctaPrefix: 'continuewith',
    btnShape: 'round',
    skipOption: 'later',
    ttl: '60000'
  });
  return `truecallersdk://truesdk/web_verify?${params}`;
}

// the callback names the profile endpoint; only ever send the token to Truecaller's own hosts
function isTruecallerEndpoint(endpoint: string) {
  try {
    const url = new URL(endpoint);
    return url.protocol === 'https:' && url.hostname.endsWith('.truecaller.com');
  } catch {
    return false;
  }
}

// Truecaller returns numbers as digits with country code ("919999999999")
function toE164(phone: unknown) {
  const digits = String(phone ?? '').replace(/\D/g, '');
  return /^[1-9]\d{7,14}$/.test(digits) ? `+${digits}` : null;
}

// fetches the user's profile with the access token from the callback, returns their E.164 number
async function fetchTruecallerPhone(endpoint: string, accessToken: string) {
  if (!isTruecallerEndpoint(endpoint)) throw new Error('Untrusted Truecaller profile endpoint');

  const response = await fetch(endpoint, {
    headers: { Authorization: `Bearer ${accessToken}`, 'Cache-Control': 'no-cache' },
    signal: AbortSignal.timeout(10_000)
  });
  if (!response.ok) throw new Error(`Truecaller profile fetch failed (${response.status})`);

  const profile = (await response.json()) as { phoneNumbers?: unknown[] };
  const phone = toE164(profile.phoneNumbers?.[0]);
  if (!phone) throw new Error('Truecaller profile has no usable phone number');
  return phone;
}

export { buildTruecallerDeepLink, isTruecallerEndpoint, toE164, fetchTruecallerPhone };
