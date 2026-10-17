// Importing modules
import { decrypt, encrypt } from './crypto.util.js';

export type EnvVars = Record<string, string>;

// POSIX-style names: what process.env and every shell accept
const KEY = /^[A-Za-z_][A-Za-z0-9_]*$/;

// the dev servers listen on PORT and Next.js binds to HOSTNAME: overriding them makes the site
// unreachable through its service
const RESERVED = new Set(['PORT', 'HOSTNAME']);

const MAX_VARS = 100;
const MAX_VALUE_BYTES = 32 * 1024;
const MAX_TOTAL_BYTES = 64 * 1024; // has to fit the 100kb JSON body limit (index.middleware.ts)

/**
 * Checks user-supplied env vars and returns them cleaned up (keys trimmed), or the first
 * problem as a message for the user.
 */
export function validateEnvVars(input: unknown): { vars: EnvVars } | { error: string } {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    return { error: 'vars must be an object of NAME: value' };
  }

  const entries = Object.entries(input as Record<string, unknown>).map(
    ([key, value]) => [key.trim(), value] as const
  );
  if (entries.length > MAX_VARS) return { error: `At most ${MAX_VARS} variables` };

  const vars: EnvVars = {};
  let total = 0;
  for (const [key, value] of entries) {
    if (!KEY.test(key)) {
      return {
        error: `"${key}" is not a valid name: use letters, digits and _, not starting with a digit`
      };
    }
    if (RESERVED.has(key)) return { error: `${key} is set by hateable and cannot be changed` };
    if (typeof value !== 'string') return { error: `The value of ${key} must be text` };

    const bytes = Buffer.byteLength(value);
    if (bytes > MAX_VALUE_BYTES) return { error: `The value of ${key} is over 32KB` };
    total += bytes + key.length;
    vars[key] = value;
  }
  if (total > MAX_TOTAL_BYTES) return { error: 'All variables together are over 64KB' };

  return { vars };
}

// function to encrypt env vars for storage ('' when there are none)
export const sealEnvVars = (vars: EnvVars) =>
  Object.keys(vars).length ? encrypt(JSON.stringify(vars)) : '';

// function to read stored env vars back
export const unsealEnvVars = (sealed?: string | null): EnvVars =>
  sealed ? (JSON.parse(decrypt(sealed)) as EnvVars) : {};
