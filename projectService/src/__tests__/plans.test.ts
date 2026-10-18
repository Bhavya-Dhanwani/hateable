// Importing modules
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PLAN_LIMITS, planOf, slotCost } from '../shared/constants/plans.constants.js';

// what createPod checks: do the user's existing projects plus the new one fit the plan
const fits = (plan: ReturnType<typeof planOf>, types: string[]) =>
  types.reduce((n, t) => n + slotCost(plan, t), 0) <= PLAN_LIMITS[plan].projectSlots;

test('free plan: 2 frontend, 2 backend, 1 of each, or 1 full-stack', () => {
  assert.ok(fits('free', ['react-ts', 'next-js']));
  assert.ok(fits('free', ['node-ts', 'node-js']));
  assert.ok(fits('free', ['react-js', 'node-ts']));
  assert.ok(fits('free', ['mern-ts']));
  assert.ok(!fits('free', ['mern-ts', 'react-ts']));
  assert.ok(!fits('free', ['react-ts', 'react-js', 'node-ts']));
});

test('pro and team: 10 projects of any stack', () => {
  assert.ok(fits('pro', Array(10).fill('mern-ts')));
  assert.ok(!fits('pro', Array(11).fill('react-ts')));
  assert.ok(fits('team', Array(10).fill('mern-js')));
});

test('planOf falls back to free', () => {
  assert.equal(planOf(undefined), 'free');
  assert.equal(planOf({}), 'free');
  assert.equal(planOf({ plan: 'enterprise' }), 'free');
  assert.equal(planOf({ plan: 'pro' }), 'pro');
  assert.equal(planOf({ plan: 'team' }), 'team');
});
