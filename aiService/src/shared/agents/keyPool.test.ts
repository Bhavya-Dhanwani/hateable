import assert from 'node:assert/strict';
import { KeyPool, Semaphore } from './keyPool.js';

const pool = new KeyPool(['a', 'b', 'c', 'a', ' ']);
assert.equal(pool.alive, 3);

// plain round robin
assert.deepEqual(
  [await pool.next(), await pool.next(), await pool.next(), await pool.next()],
  ['a', 'b', 'c', 'a']
);

// rate-limited key is skipped, dead key is dropped
pool.fail('b', 429);
pool.fail('c', 401);
assert.equal(pool.alive, 2);
assert.deepEqual([await pool.next(), await pool.next()], ['a', 'a']);

// when every live key cools down, next() waits instead of failing
pool.fail('a', 429, 100);
pool.fail('b', 429, 100);
const t = Date.now();
await pool.next();
assert.ok(Date.now() - t >= 90);

// runtime add scales the pool
pool.add(Array.from({ length: 97 }, (_, i) => `k${i}`));
assert.equal(pool.alive, 99);

// all keys dead -> clear error
const dead = new KeyPool(['x']);
dead.fail('x', 403);
await assert.rejects(dead.next(), /no valid API keys/);

// semaphore never exceeds limit
const sem = new Semaphore(() => 3);
let active = 0,
  peak = 0;
await Promise.all(
  Array.from({ length: 20 }, () =>
    sem.run(async () => {
      peak = Math.max(peak, ++active);
      await new Promise((r) => setTimeout(r, 5));
      active--;
    })
  )
);
assert.equal(peak, 3);

console.log('keyPool ok');
