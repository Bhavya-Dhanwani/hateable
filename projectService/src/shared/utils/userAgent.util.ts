// function to bucket a user agent into a device type for the analytics dashboard
export function deviceFromUserAgent(userAgent: string) {
  if (/bot|crawl|spider|slurp|preview/i.test(userAgent)) return 'bot';
  if (/ipad|tablet/i.test(userAgent)) return 'tablet';
  if (/mobi|android|iphone/i.test(userAgent)) return 'mobile';
  return 'desktop';
}

// function to pick the browser family out of a user agent; order matters, Edge and Opera also say "Chrome"
export function browserFromUserAgent(userAgent: string) {
  if (/edg\//i.test(userAgent)) return 'Edge';
  if (/opr\/|opera/i.test(userAgent)) return 'Opera';
  if (/firefox|fxios/i.test(userAgent)) return 'Firefox';
  if (/chrome|crios|chromium/i.test(userAgent)) return 'Chrome';
  if (/safari/i.test(userAgent)) return 'Safari';
  return 'Other';
}
