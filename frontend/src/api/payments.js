import { useEffect, useState } from 'react';
import { apiRequest } from './client.js';

export const paymentsApi = {
  // public runtime config: { freeMode, upiEnabled, upi, payeeName, prices }
  config: () => apiRequest('/api/auth/config', { auth: false }),
  create: (plan, reference) =>
    apiRequest('/api/auth/payments', { method: 'POST', body: JSON.stringify({ plan, reference }) }),
  mine: () => apiRequest('/api/auth/payments/me'),
  // admin (x-admin-key)
  adminList: (key) => apiRequest('/api/auth/admin/payments', { headers: { 'x-admin-key': key } }),
  adminDecide: (key, id, action) =>
    apiRequest(`/api/auth/admin/payments/${id}`, {
      method: 'PATCH',
      headers: { 'x-admin-key': key },
      body: JSON.stringify({ action })
    })
};

// fetched once, cached for the session; null until loaded
let cache = null;
export function usePublicConfig() {
  const [config, setConfig] = useState(cache);
  useEffect(() => {
    if (cache) return;
    paymentsApi
      .config()
      .then((c) => {
        cache = c;
        setConfig(c);
      })
      .catch(() => setConfig({ freeMode: false, upiEnabled: false }));
  }, []);
  return config;
}
