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
