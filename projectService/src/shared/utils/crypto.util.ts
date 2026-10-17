// Importing modules
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import env from '../config/env.config.js';

// AES-256-GCM key derived from the configured secret (any length in, 32 bytes out)
const key = () => createHash('sha256').update(env.TOKEN_ENCRYPTION_KEY).digest();

// function to encrypt a secret for storage, output: iv.tag.ciphertext (base64url)
export function encrypt(plain: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(), iv);
  const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), data].map((b) => b.toString('base64url')).join('.');
}

// function to decrypt what `encrypt` produced; throws if it was tampered with
export function decrypt(sealed: string) {
  const [iv, tag, data] = sealed.split('.').map((part) => Buffer.from(part, 'base64url'));
  const decipher = createDecipheriv('aes-256-gcm', key(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
}
