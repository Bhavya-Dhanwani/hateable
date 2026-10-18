// Importing modules
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { atLeast, planFor, projectRole } from '../shared/utils/access.util.js';

const alice = { userId: 'a', plan: 'free', workspaces: [{ id: 'w1', role: 'viewer' as const }] };
const bob = { userId: 'b', plan: 'team', workspaces: [{ id: 'w1', role: 'owner' as const }] };

test('the creator owns a personal project, workspace projects go by workspace role', () => {
  assert.equal(projectRole(bob, { userId: 'b' }), 'owner');
  assert.equal(projectRole(alice, { userId: 'b', workspaceId: 'w1' }), 'viewer');
  // a creator removed from the workspace loses the projects they made there
  assert.equal(projectRole({ userId: 'b' }, { userId: 'b', workspaceId: 'w1' }), null);
  assert.equal(projectRole(alice, { userId: 'b' }), null);
  assert.equal(projectRole(alice, { userId: 'b', workspaceId: 'w2' }), null);
  assert.equal(projectRole({}, { userId: null }), null);
});

test('viewers read, editors and up write', () => {
  assert.ok(atLeast('viewer', 'viewer'));
  assert.ok(!atLeast('viewer', 'editor'));
  assert.ok(atLeast('admin', 'editor'));
  assert.ok(!atLeast(null, 'viewer'));
});

test('workspace projects run on Team limits for every member', () => {
  assert.equal(planFor(alice, { workspaceId: 'w1' }), 'team');
  assert.equal(planFor(alice, {}), 'free');
});
