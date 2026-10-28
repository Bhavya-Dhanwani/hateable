// Importing modules
import { ChatMistralAI } from '@langchain/mistralai';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import type { z } from 'zod';
import env from '../config/env.config.js';
import logger from '../config/logger.config.js';
import { KeyPool, Semaphore } from './keyPool.js';

export const pool = new KeyPool(`${env.MISTRAL_API_KEYS},${env.MISTRAL_API_KEY}`.split(/[\s,]+/));

if (!pool.alive) {
  throw new Error('No Mistral keys configured. Set MISTRAL_API_KEYS (comma separated).');
}

// total parallel calls scale with healthy keys: 100 keys -> 200 calls in flight, 1 dead -> 198
const sem = new Semaphore(() => pool.alive * env.PER_KEY_CONCURRENCY);

const models = new Map<string, ChatMistralAI>();

// one model instance per key; maxRetries 0 because the pool retries on a different key
export function modelFor(apiKey: string, streaming = false): ChatMistralAI {
  if (streaming) {
    return new ChatMistralAI({ apiKey, model: env.MISTRAL_MODEL, temperature: 0, streaming: true });
  }
  let model = models.get(apiKey);
  if (!model) {
    model = new ChatMistralAI({
      apiKey,
      model: env.MISTRAL_MODEL,
      temperature: 0.2,
      maxRetries: 0
    });
    models.set(apiKey, model);
  }
  return model;
}

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
  const attempts = Math.max(4, Math.min(pool.alive, 10));
  let lastErr: unknown;

  for (let i = 0; i < attempts; i++) {
    const key = await pool.next();
    try {
      const out = await sem.run(() =>
        modelFor(key)
          .withStructuredOutput(schema, { name: 'respond' })
          .invoke([new SystemMessage(system), new HumanMessage(user)], { runName })
      );
      pool.ok(key);
      // withStructuredOutput validates against `schema` at runtime; zod 4 no longer flows that
      // type through LangChain's generic (it falls back to Record<string, any>), so assert it here
      return out as z.infer<S>;
    } catch (err) {
      lastErr = err;
      const status = statusOf(err);
      if (status === 400 || status === 422) throw err; // our request is bad, another key won't help
      // the model isn't on the account's plan: every key of that account gets the same 403, so
      // say so instead of burning (and dropping) the whole pool
      if (
        /tier_not_allowed|not available in your subscription/i.test(String((err as Error)?.message))
      ) {
        throw new Error(
          `Mistral model "${env.MISTRAL_MODEL}" isn't available on these API keys' plan. Set MISTRAL_MODEL to one they can use (e.g. codestral-latest).`
        );
      }
      pool.fail(key, status);
      logger.warn(
        `${runName}: attempt ${i + 1} failed (${status ?? (err as Error).message?.slice(0, 80)}), rotating key`
      );
    }
  }

  throw lastErr;
}
