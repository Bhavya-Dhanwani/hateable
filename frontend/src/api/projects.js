import { apiRequest } from './client.js';

export const PROJECT_TYPES = [
  { id: 'react-ts', label: 'React', lang: 'TS' },
  { id: 'react-js', label: 'React', lang: 'JS' },
  { id: 'next-ts', label: 'Next.js', lang: 'TS' },
  { id: 'next-js', label: 'Next.js', lang: 'JS' },
  { id: 'mern-ts', label: 'MERN', lang: 'TS' },
  { id: 'mern-js', label: 'MERN', lang: 'JS' },
  { id: 'node-ts', label: 'Node', lang: 'TS' },
  { id: 'node-js', label: 'Node', lang: 'JS' }
];

export const projectsApi = {
  list: () => apiRequest('/api/projects').then((data) => data.projects),
  get: (id) => apiRequest(`/api/projects/${id}`).then((data) => data.project),
  create: (name, projectType) =>
    apiRequest('/api/projects', {
      method: 'POST',
      body: JSON.stringify({ name, projectType })
    }).then((data) => data.project),
  launch: (id) => apiRequest(`/api/projects/${id}/launch`, { method: 'POST' })
};

// One-click deployments: <slug>.<DEPLOY_DOMAIN>, asleep after 15 idle minutes, woken by the next visitor.
export const deploymentsApi = {
  get: (id) => apiRequest(`/api/projects/${id}/deployment`),
  deploy: (id) => apiRequest(`/api/projects/${id}/deployment`, { method: 'POST' }),
  remove: (id) => apiRequest(`/api/projects/${id}/deployment`, { method: 'DELETE' }),
  analytics: (id, days = 14) => apiRequest(`/api/projects/${id}/deployment/analytics?days=${days}`)
};
