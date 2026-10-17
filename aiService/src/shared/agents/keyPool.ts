// Round-robin API key pool. Works with any number of keys (1, 50, 70, 100...).
// Rate-limited keys cool down and are skipped; rejected keys (401/403) are dropped.

type Key = { value: string; coolUntil: number; dead: boolean; fails: number };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class KeyPool {
  private keys: Key[] = [];
  private cursor = 0;

  constructor(raw: string[]) {
    this.add(raw);
  }

  // add keys at runtime, duplicates and blanks ignored
  add(raw: string[]) {
    const seen = new Set(this.keys.map((k) => k.value));
    for (const v of raw.map((s) => s.trim()).filter(Boolean)) {
      if (!seen.has(v)) this.keys.push({ value: v, coolUntil: 0, dead: false, fails: 0 });
      seen.add(v);
    }
  }

  get alive() {
    return this.keys.filter((k) => !k.dead).length;
  }

  // next usable key in round-robin order; waits if every live key is cooling down
  async next(): Promise<string> {
    for (;;) {
      const now = Date.now();
      const n = this.keys.length;
      for (let i = 0; i < n; i++) {
        const k = this.keys[(this.cursor + i) % n];
        if (!k.dead && k.coolUntil <= now) {
          this.cursor = (this.cursor + i + 1) % n;
          return k.value;
        }
      }
      const live = this.keys.filter((k) => !k.dead);
      if (!live.length) throw new Error('KeyPool: no valid API keys left');
      await sleep(Math.max(50, Math.min(...live.map((k) => k.coolUntil)) - now));
    }
  }

  ok(value: string) {
    const k = this.find(value);
    if (k) k.fails = 0;
  }

  // status: HTTP status of the failure; retryAfterMs: server hint if any
  fail(value: string, status?: number, retryAfterMs?: number) {
    const k = this.find(value);
    if (!k) return;
    if (status === 401 || status === 403) {
      k.dead = true;
      return;
    }
    k.fails++;
    // 429 -> exponential cooldown (5s, 10s, 20s ... max 2min); other errors -> short pause
    const backoff = status === 429 ? Math.min(5000 * 2 ** (k.fails - 1), 120_000) : 2000;
    k.coolUntil = Date.now() + (retryAfterMs ?? backoff);
  }

  private find(value: string) {
    return this.keys.find((k) => k.value === value);
  }
}

// Tiny semaphore to cap total parallel LLM calls (limit can change at runtime)
export class Semaphore {
  private active = 0;
  private queue: (() => void)[] = [];

  constructor(public limit: () => number) {}

  async run<T>(fn: () => Promise<T>): Promise<T> {
    if (this.active < Math.max(1, this.limit())) this.active++;
    else await new Promise<void>((r) => this.queue.push(r)); // slot handed over by releaser
    try {
      return await fn();
    } finally {
      const waiter = this.queue.shift();
      if (waiter) waiter();
      else this.active--;
    }
  }
}
