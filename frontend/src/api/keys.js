import { apiRequest } from './client.js';

// BYOK: a user's own provider API keys. Secrets are write-only — the server returns masked tails.
export const keysApi = {
  list: () => apiRequest('/api/ai/keys'),
  add: (provider, apiKey, model) =>
    apiRequest('/api/ai/keys', {
      method: 'POST',
      body: JSON.stringify({ provider, apiKey, model: model || undefined })
    }),
  remove: (id) => apiRequest(`/api/ai/keys/${id}`, { method: 'DELETE' })
};
