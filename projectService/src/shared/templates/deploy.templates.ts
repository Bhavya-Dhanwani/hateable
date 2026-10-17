// Importing modules
import env from '../config/env.config.js';

/**
 * Pages the proxy serves on a deployment's own subdomain when it cannot hand the
 * request to the site: the site is asleep / waking up, or no site has that name.
 *
 * Visitors came for the user's site, not for hateable, so these stay quiet: plain
 * HTML (no build step, no assets), one line of text and a hairline progress bar.
 * Only validated slugs (SLUG_PATTERN) are interpolated, so nothing here needs escaping.
 */

// shared look: ink background, one text column, follows the visitor's light/dark preference
const BASE_STYLES = `
  :root { --bg: #09090b; --fg: #fafafa; --muted: rgb(250 250 250 / .45); --line: rgb(250 250 250 / .1); color-scheme: dark; }
  @media (prefers-color-scheme: light) {
    :root { --bg: #fafafa; --fg: #09090b; --muted: rgb(9 9 11 / .5); --line: rgb(9 9 11 / .1); color-scheme: light; }
  }
  * { box-sizing: border-box; }
  html, body { margin: 0; height: 100%; }
  body {
    display: grid; place-items: center; padding: 24px;
    background: var(--bg); color: var(--fg);
    font: 14px/1.5 "Geist", ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
    -webkit-font-smoothing: antialiased;
  }
  main { width: min(100%, 320px); animation: in .6s cubic-bezier(.22, 1, .36, 1) backwards; }
  .host { font: 12px/1 "JetBrains Mono", ui-monospace, monospace; color: var(--muted); }
  h1 { margin: 12px 0 4px; font-size: 15px; font-weight: 500; letter-spacing: -.01em; }
  p { margin: 0; color: var(--muted); }
  a { color: var(--fg); text-underline-offset: 3px; text-decoration-color: var(--line); }
  a:hover { text-decoration-color: currentColor; }
  .footer { position: fixed; bottom: 20px; font-size: 12px; color: var(--muted); }
  .footer a { color: inherit; }
  @keyframes in { from { opacity: 0; transform: translateY(4px); } }
  @media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation: none !important; } }
`;

// function to wrap a page body in the shared shell
function page(title: string, extraStyles: string, body: string) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex">
  <title>${title}</title>
  <style>${BASE_STYLES}${extraStyles}</style>
</head>
<body>
  ${body}
  <div class="footer">Hosted on <a href="${env.APP_URL}" target="_blank" rel="noopener">hateable</a></div>
</body>
</html>`;
}

/**
 * Shown while a sleeping deployment boots. It polls the same URL and swaps to the real
 * site as soon as the site answers with anything other than this page (marked by the
 * `x-hateable-waking` header), so the visitor lands on it without a click.
 */
export function wakingPage(slug: string) {
  return page(
    `Starting ${slug}`,
    `
    .bar { position: relative; height: 1px; margin-top: 20px; overflow: hidden; background: var(--line); }
    .bar::after {
      content: ""; position: absolute; inset: 0; width: 30%;
      background: linear-gradient(90deg, transparent, var(--fg), transparent);
      animation: sweep 1.6s cubic-bezier(.65, 0, .35, 1) infinite;
    }
    body.ready main { opacity: 0; transform: translateY(-4px); transition: opacity .25s, transform .25s; }
    @keyframes sweep { from { transform: translateX(-100%); } to { transform: translateX(340%); } }
  `,
    `
  <main>
    <div class="host">${slug}.${env.DEPLOY_DOMAIN}</div>
    <h1>Starting up</h1>
    <p>This site was asleep. It will be ready in a few seconds.</p>
    <div class="bar"></div>
  </main>
  <noscript><meta http-equiv="refresh" content="5"></noscript>
  <script>
    (function () {
      async function poll() {
        try {
          var res = await fetch(location.href, { cache: 'no-store', headers: { accept: 'text/html' } });
          if (!res.headers.get('x-hateable-waking')) {
            // fade out first so the switch to the real site is not a hard cut
            document.body.classList.add('ready');
            return setTimeout(function () { location.reload(); }, 250);
          }
        } catch (e) {}
        setTimeout(poll, 1500);
      }

      setTimeout(poll, 1500);
    })();
  </script>`
  );
}

// Shown when no deployment owns the subdomain, an invalid slug is passed as ''.
export function notFoundPage(slug: string) {
  const host = slug ? `${slug}.${env.DEPLOY_DOMAIN}` : env.DEPLOY_DOMAIN;

  return page(
    'Not found',
    '',
    `
  <main>
    <div class="host">${host}</div>
    <h1>Nothing here</h1>
    <p>No site is deployed at this address. <a href="${env.APP_URL}">Build one on hateable</a>.</p>
  </main>`
  );
}
