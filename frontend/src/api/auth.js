import { apiRequest, refreshAccessToken, setAccessToken } from './client.js';

async function authenticate(path, body) {
  const session = await apiRequest(path, {
    method: 'POST',
    auth: false,
    body: JSON.stringify(body)
  });
  setAccessToken(session.accessToken);
  return session;
}

export const authApi = {
  login: (credentials) => authenticate('/api/auth/login', credentials),
  signup: (details) => authenticate('/api/auth/signup', details),
  refresh: refreshAccessToken,
  telegramStart: () => apiRequest('/api/auth/phone/telegram', { method: 'POST' }),
  phoneStatus: (nonce) => apiRequest(`/api/auth/phone/${encodeURIComponent(nonce)}`),
  async logout() {
    try {
      await apiRequest('/api/auth/logout', { method: 'POST', auth: false });
    } finally {
      setAccessToken(null);
    }
  }
};
