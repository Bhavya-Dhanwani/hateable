import { apiRequest } from './client.js';

const json = (method, body) => ({ method, body: JSON.stringify(body) });

// Team plan workspaces (authService). Membership reaches the access token on its next refresh,
// so callers refresh after create/accept to see the workspace's projects straight away.
export const workspacesApi = {
  list: () => apiRequest('/api/auth/workspaces'),
  create: (name) => apiRequest('/api/auth/workspaces', json('POST', { name })),
  invite: (id, email, role) =>
    apiRequest(`/api/auth/workspaces/${id}/invites`, json('POST', { email, role })),
  accept: (id) => apiRequest(`/api/auth/workspaces/${id}/accept`, { method: 'POST' }),
  setRole: (id, memberId, role) =>
    apiRequest(`/api/auth/workspaces/${id}/members/${memberId}`, json('PATCH', { role })),
  remove: (id, memberId) =>
    apiRequest(`/api/auth/workspaces/${id}/members/${memberId}`, { method: 'DELETE' }),
  // AI messages per member and project against the workspace's shared pool (aiService)
  usage: (id) => apiRequest(`/api/ai/usage?workspaceId=${encodeURIComponent(id)}`)
};

// the workspace the projects page shows, '' for personal projects
const KEY = 'hateable.workspace';
export const selectedWorkspace = {
  get() {
    try {
      return localStorage.getItem(KEY) || '';
    } catch {
      return '';
    }
  },
  set(id) {
    try {
      if (id) localStorage.setItem(KEY, id);
      else localStorage.removeItem(KEY);
    } catch {
      // private mode: the choice just isn't remembered
    }
  }
};
