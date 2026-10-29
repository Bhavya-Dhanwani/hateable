// AES-256-GCM for BYOK API keys at rest. The data key is derived from ACCESS_TOKEN_SECRET (set
// everywhere already), or KEY_ENC_SECRET if you'd rather rotate it apart from auth tokens.
// Format: base64(iv[12] | authTag[16] | ciphertext). Rotating the secret invalidates stored keys
// (users just re-add them) — acceptable for third-party keys we never need to recover ourselves.
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto';
import env from '../config/env.config.js';

const dataKey = scryptSync(env.KEY_ENC_SECRET || env.ACCESS_TOKEN_SECRET, 'byok-keys', 32);

export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', dataKey, iv);
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), enc]).toString('base64');
}

export function decryptSecret(blob: string): string {
  const buf = Buffer.from(blob, 'base64');
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const dec = createDecipheriv('aes-256-gcm', dataKey, iv);
  dec.setAuthTag(tag);
  return Buffer.concat([dec.update(buf.subarray(28)), dec.final()]).toString('utf8');
}

// last 4 chars for display; the rest never leaves the server
export const maskKey = (plain: string) => `••••${plain.slice(-4)}`;
