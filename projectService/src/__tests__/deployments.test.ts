// Importing modules
import { test } from 'node:test';
import assert from 'node:assert/strict';
import slugify, { SLUG_PATTERN } from '../shared/utils/slugify.util.js';
import { browserFromUserAgent, deviceFromUserAgent } from '../shared/utils/userAgent.util.js';

test('slugify turns project names into valid subdomains', () => {
  assert.equal(slugify('shululu'), 'shululu');
  assert.equal(slugify('Shululu App!'), 'shululu-app');
  assert.equal(slugify('  Café   Crème  '), 'cafe-creme');
  assert.equal(slugify('!!!'), 'site-app');
  assert.equal(slugify('www'), 'site-www');
  assert.ok(slugify('a'.repeat(100)).length <= 40);

  for (const name of ['shululu', '--x--', '日本語', 'a'.repeat(100), 'My Site 2']) {
    assert.match(slugify(name), SLUG_PATTERN);
  }
});

test('user agents are bucketed into devices and browsers', () => {
  const iphone =
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
  const edge =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36 Edg/120.0';

  assert.equal(deviceFromUserAgent(iphone), 'mobile');
  assert.equal(browserFromUserAgent(iphone), 'Safari');
  assert.equal(deviceFromUserAgent(edge), 'desktop');
  assert.equal(browserFromUserAgent(edge), 'Edge');
  assert.equal(deviceFromUserAgent('Googlebot/2.1'), 'bot');
  assert.equal(browserFromUserAgent(''), 'Other');
});

test('raw container output is cut down to the useful lines', async () => {
  const { optimizeLogs } = await import('../shared/utils/logOptimizer.util.js');
  const lines = optimizeLogs([
    '2026-10-17T10:00:00.000Z > app@1.0.0 dev',
    '2026-10-17T10:00:00.100Z \x1b[32m  VITE v7.1.9\x1b[39m  ready in 312 ms',
    '2026-10-17T10:00:00.200Z   ➜  Local:   http://localhost:5173/',
    '2026-10-17T10:00:01.000Z Server listening on 5000',
    '2026-10-17T10:00:02.000Z GET /api/items',
    '2026-10-17T10:00:02.100Z GET /api/items',
    '2026-10-17T10:00:02.200Z GET /api/items',
    '2026-10-17T10:00:03.000Z TypeError: Cannot read properties of undefined (reading "map")',
    '2026-10-17T10:00:03.000Z     at List (/app/src/List.jsx:4:10)',
    '2026-10-17T10:00:03.000Z     at render (/app/node_modules/react/x.js:1:1)',
    '2026-10-17T10:00:03.000Z     at a (x.js:1:1)',
    '2026-10-17T10:00:03.000Z     at b (x.js:1:1)',
    '2026-10-17T10:00:04.000Z (node:1) Warning: punycode is deprecated',
    '2026-10-17T10:00:05.000Z [vite] hmr update /src/App.jsx'
  ]);

  assert.deepEqual(
    lines.map((l) => [l.level, l.message, l.count]),
    [
      ['info', 'Server listening on 5000', 1],
      ['info', 'GET /api/items', 3],
      ['error', 'TypeError: Cannot read properties of undefined (reading "map")', 1],
      ['warn', '(node:1) Warning: punycode is deprecated', 1]
    ]
  );
  assert.equal(lines[0].at, '2026-10-17T10:00:01.000Z');
  assert.deepEqual(lines[2].stack, [
    'at List (/app/src/List.jsx:4:10)',
    'at render (/app/node_modules/react/x.js:1:1)',
    'at a (x.js:1:1)'
  ]);
});

test('stored tokens round-trip and tampering is detected', async () => {
  const { encrypt, decrypt } = await import('../shared/utils/crypto.util.js');
  const sealed = encrypt('gho_example_token');
  assert.notEqual(sealed, encrypt('gho_example_token')); // fresh IV every time
  assert.equal(decrypt(sealed), 'gho_example_token');
  const [iv, tag, data] = sealed.split('.');
  assert.throws(() =>
    decrypt(
      [iv, tag, data.slice(0, -2) + (data.endsWith('A') ? 'B' : 'A') + data.slice(-1)].join('.')
    )
  );
});

test('a stack frame still finds its error when a stdout line lands in between', async () => {
  const { optimizeLogs } = await import('../shared/utils/logOptimizer.util.js');
  const lines = optimizeLogs([
    'TypeError: boom',
    'GET /api/items',
    '    at List (/app/src/List.jsx:4:10)'
  ]);
  assert.deepEqual(lines[0].stack, ['at List (/app/src/List.jsx:4:10)']);
  assert.equal(lines[1].stack, undefined);
});
