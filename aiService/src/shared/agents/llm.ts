// A router over many (provider, key) pairs. Round-robin, cooldown and drop-dead come from KeyPool;
// ids are opaque indexes so no API key ever reaches a log line. ask() picks the current router from
// an AsyncLocalStorage store (per request), falling back to the shared env pool — so BYOK keys flow
// through the whole agent tree without threading a param through every node.
import { AsyncLocalStorage } from 'node:async_hooks';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type { z } from 'zod';
import env from '../config/env.config.js';
import logger from '../config/logger.config.js';
import { KeyPool, Semaphore } from './keyPool.js';
import {
  PROVIDERS,
  type ProviderId,
  buildModel,
  defaultModelFor,
  isProvider
} from './providers.js';

export type KeyEntry = { provider: ProviderId; apiKey: string; model?: string };

export class Router {
  private pool: KeyPool;
  private entries: KeyEntry[];
  private sem: Semaphore;
  private models = new Map<string, BaseChatModel>(); // non-streaming models, cached per key

  constructor(entries: KeyEntry[]) {
    const seen = new Set<string>();
    this.entries = entries.filter((e) => {
      if (!e.apiKey?.trim() || !isProvider(e.provider)) return false;
      const sig = `${e.provider}\u0000${e.model || ''}\u0000${e.apiKey}`;
      if (seen.has(sig)) return false;
      seen.add(sig);
      return true;
    });
    // total parallel calls scale with healthy keys (PER_KEY_CONCURRENCY each)
    this.pool = new KeyPool(this.entries.map((_, i) => String(i)));
    this.sem = new Semaphore(() => Math.max(1, this.pool.alive * env.PER_KEY_CONCURRENCY));
  }

  get alive() {
    return this.pool.alive;
  }

  // next usable key in round-robin order, with the chat model built for it
  async pick(streaming = false): Promise<{ id: string; model: BaseChatModel }> {
    const id = await this.pool.next();
    return { id, model: this.modelFor(id, streaming) };
  }

  private modelFor(id: string, streaming: boolean): BaseChatModel {
    const e = this.entries[Number(id)];
    const model = e.model || defaultModelFor(e.provider);
    if (streaming) return buildModel(e.provider, e.apiKey, model, true);
    let m = this.models.get(id);
    if (!m) {
      m = buildModel(e.provider, e.apiKey, model, false);
      this.models.set(id, m);
    }
    return m;
  }

  ok(id: string) {
    this.pool.ok(id);
  }

  fail(id: string, status?: number) {
    this.pool.fail(id, status);
  }

  run<T>(fn: () => Promise<T>) {
    return this.sem.run(fn);
  }
}

// --- the shared pool, built from env: <PROVIDER>_API_KEYS (comma/space separated), plus the
//     legacy single MISTRAL_API_KEY. Duplicates collapse in the Router. ---
function sharedEntries(): KeyEntry[] {
  const out: KeyEntry[] = [];
  for (const id of Object.keys(PROVIDERS) as ProviderId[]) {
    const raw = process.env[`${id.toUpperCase()}_API_KEYS`] || '';
    for (const k of raw.split(/[\s,]+/)) if (k.trim()) out.push({ provider: id, apiKey: k.trim() });
  }
  for (const k of env.MISTRAL_API_KEY.split(/[\s,]+/))
    if (k.trim()) out.push({ provider: 'mistral', apiKey: k.trim() });
  return out;
}

export const sharedRouter = new Router(sharedEntries());

if (!sharedRouter.alive) {
  throw new Error(
    'No LLM API keys configured. Set MISTRAL_API_KEYS (or OPENAI_API_KEYS, ANTHROPIC_API_KEYS, GROK_API_KEYS, …), comma separated.'
  );
}

// per-request router (BYOK). ask()/getStream read it; unset -> the shared pool.
const llmContext = new AsyncLocalStorage<Router>();
export const currentRouter = () => llmContext.getStore() ?? sharedRouter;
// set the router for the rest of this request (each HTTP request is its own async context)
export const useRouter = (router: Router) => llmContext.enterWith(router);

function statusOf(err: any): number | undefined {
  const s = err?.status ?? err?.statusCode ?? err?.response?.status;
  if (typeof s === 'number') return s;
  const m = /\b(401|403|429|5\d\d|400|422)\b/.exec(String(err?.message));
  return m ? Number(m[1]) : undefined;
}

// one structured LLM call with round-robin key rotation and retry on another key
export async function ask<S extends z.ZodTypeAny>(
  schema: S,
  system: string,
  user: string,
  runName: string
): Promise<z.infer<S>> {
  const router = currentRouter();
  const attempts = Math.max(4, Math.min(router.alive, 10));
  let lastErr: unknown;

  for (let i = 0; i < attempts; i++) {
    const { id, model } = await router.pick();
    try {
      const out = await router.run(() =>
        model
          .withStructuredOutput(schema, { name: 'respond' })
          .invoke([new SystemMessage(system), new HumanMessage(user)], { runName })
      );
      router.ok(id);
      // withStructuredOutput validates against `schema` at runtime; zod 4 no longer flows that
      // type through LangChain's generic (it falls back to Record<string, any>), so assert it here
      return out as z.infer<S>;
    } catch (err) {
      lastErr = err;
      const status = statusOf(err);
      if (status === 400 || status === 422) throw err; // our request is bad, another key won't help
      // the model isn't on this key's plan: say so instead of silently burning the whole pool
      if (
        /tier_not_allowed|not available in your subscription/i.test(String((err as Error)?.message))
      ) {
        throw new Error(
          `The chosen model isn't available on the configured API key's plan. Pick a model the key can use.`
        );
      }
      router.fail(id, status);
      logger.warn(
        `${runName}: attempt ${i + 1} failed (${status ?? (err as Error).message?.slice(0, 80)}), rotating key`
      );
    }
  }

  throw lastErr;
}
