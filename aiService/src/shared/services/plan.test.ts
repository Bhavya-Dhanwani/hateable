import assert from 'node:assert/strict';
import { tally, usagePool } from './plan.service.js';

// workspace projects draw on the workspace's Team pool, whoever sends; others on the sender's plan
assert.deepEqual(usagePool({ userId: 'u1', plan: 'free' }, { workspaceId: 'w1' }), {
  key: 'ws:w1',
  plan: 'team'
});
assert.deepEqual(usagePool({ userId: 'u1', plan: 'pro' }, {}), { key: 'u1', plan: 'pro' });
assert.deepEqual(usagePool(undefined, {}), { key: '', plan: 'free' });

// window entries count per member and project; old-format entries are skipped
assert.deepEqual(
  tally(['1:u1:p1:ab', '2:u1:p1:cd', '3:u2:p1:ef', '4-legacy'], { 'u1:p1': '5', 'u2:p2': '1' }),
  [
    { userId: 'u1', projectId: 'p1', last24h: 2, total: 5 },
    { userId: 'u2', projectId: 'p2', last24h: 0, total: 1 },
    { userId: 'u2', projectId: 'p1', last24h: 1, total: 0 }
  ]
);

console.log('plan.test ok');
