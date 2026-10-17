let accessToken = null;
let refreshPromise = null;

export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

export const setAccessToken = (token) => {
  accessToken = token || null;
};
export const getAccessToken = () => accessToken;

// Backend wraps everything as { success, message, data } — callers get `data`.
async function parseResponse(response) {
  const isJson = (response.headers.get('content-type') || '').includes('application/json');
  const payload = isJson ? await response.json() : await response.text();

  if (!response.ok) {
    // non-JSON 5xx = the dev proxy / ingress couldn't reach a service
    const message =
      (isJson && (payload.message || payload.error)) ||
      (response.status >= 500
        ? "Can't reach the Hateable servers right now. Is the backend running?"
        : `Request failed (${response.status})`);
    throw new ApiError(message, response.status);
  }
  return isJson && payload && 'data' in payload ? payload.data : payload;
}

export function refreshAccessToken() {
  refreshPromise ??= fetch('/api/auth/refresh', { method: 'POST', credentials: 'include' })
    .then(parseResponse)
    .then((session) => {
      setAccessToken(session.accessToken);
      return session;
    })
    .finally(() => {
      refreshPromise = null;
    });
  return refreshPromise;
}

export async function apiRequest(path, { auth = true, retry = true, headers, ...options } = {}) {
  const finalHeaders = new Headers(headers);
  if (options.body && !(options.body instanceof FormData))
    finalHeaders.set('Content-Type', 'application/json');
  if (auth && accessToken) finalHeaders.set('Authorization', `Bearer ${accessToken}`);

  const response = await fetch(path, { ...options, credentials: 'include', headers: finalHeaders });

  if (response.status === 401 && auth && retry) {
    await refreshAccessToken();
    return apiRequest(path, { auth, retry: false, headers, ...options });
  }
  return parseResponse(response);
}
