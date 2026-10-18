// run: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import createApp from '../app.js';

test('GET /api/health returns 200 with server status', async () => {
  const res = await request(createApp()).get('/api/health');
  assert.equal(res.status, 200);
  assert.equal(res.body.data.status, 'UP');
});
