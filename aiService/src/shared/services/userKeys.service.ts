// BYOK: a user's own provider keys. They power a personal Router once the plan allowance is spent,
// so a free user with their own keys gets unlimited runs.
import mongoose from 'mongoose';
import ApiKey from '../models/apiKey.model.js';
import { Router, type KeyEntry } from '../agents/llm.js';
import { isProvider, PROVIDERS, type ProviderId } from '../agents/providers.js';
import { decryptSecret, encryptSecret, maskKey } from '../utils/crypto.util.js';
import BadRequest from '../errors/BadRequest.error.js';

export const providerCatalog = (Object.keys(PROVIDERS) as ProviderId[]).map((id) => ({
  id,
  label: PROVIDERS[id].label,
  defaultModel: PROVIDERS[id].defaultModel
}));

export async function listKeys(userId: string) {
  const keys = await ApiKey.find({ userId }).sort({ createdAt: -1 });
  return keys.map((k) => ({
    id: String(k._id),
    provider: k.provider,
    model: k.model || PROVIDERS[k.provider as ProviderId]?.defaultModel || '',
    masked: `••••${k.last4}`,
    createdAt: k.createdAt
  }));
}

export async function addKey(
  userId: string,
  input: { provider?: unknown; apiKey?: unknown; model?: unknown }
) {
  const provider = input.provider;
  const apiKey = typeof input.apiKey === 'string' ? input.apiKey.trim() : '';
  const model =
    typeof input.model === 'string' && input.model.trim() ? input.model.trim() : undefined;
  if (!isProvider(provider)) throw new BadRequest('Unknown provider');
  if (!apiKey) throw new BadRequest('apiKey is required');

  await ApiKey.create({
    userId,
    provider,
    model,
    keyEnc: encryptSecret(apiKey),
    last4: maskKey(apiKey).slice(-4)
  });
  return listKeys(userId);
}

export async function removeKey(userId: string, id: string) {
  // guard the cast: a non-ObjectId id (e.g. "__proto__") would otherwise throw a 500
  if (mongoose.isValidObjectId(id)) await ApiKey.deleteOne({ _id: id, userId }); // scoped to the owner
  return listKeys(userId);
}

// a Router over the user's keys, or null if they have none
export async function userRouter(userId: string): Promise<Router | null> {
  const keys = await ApiKey.find({ userId });
  if (!keys.length) return null;
  const entries: KeyEntry[] = keys.map((k) => ({
    provider: k.provider as ProviderId,
    apiKey: decryptSecret(k.keyEnc),
    model: k.model || undefined
  }));
  const router = new Router(entries);
  return router.alive ? router : null;
}
