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

// optimized deployment logs: { source: live|last-run|none, app: LogLine[], events }
deploymentsApi.logs = (id) => apiRequest(`/api/projects/${id}/deployment/logs`);

// GitHub: connect once per user, then push any project to a repo in one click
export const githubApi = {
  status: () => apiRequest('/api/projects/github/status'),
  connectUrl: (returnTo) =>
    apiRequest(`/api/projects/github/connect?returnTo=${encodeURIComponent(returnTo)}`).then(
      (data) => data.url
    ),
  disconnect: () => apiRequest('/api/projects/github', { method: 'DELETE' }),
  link: (id) => apiRequest(`/api/projects/${id}/github`),
  push: (id, repo) =>
    apiRequest(`/api/projects/${id}/github/push`, {
      method: 'POST',
      body: JSON.stringify({ repo })
    })
};

// deployment environment variables (stored encrypted; saving restarts an awake site)
deploymentsApi.env = (id) => apiRequest(`/api/projects/${id}/deployment/env`).then((d) => d.vars);
deploymentsApi.saveEnv = (id, vars) =>
  apiRequest(`/api/projects/${id}/deployment/env`, {
    method: 'PUT',
    body: JSON.stringify({ vars })
  });

// custom domains of a deployment: pending until their TXT record verifies, then they serve the site
deploymentsApi.domains = (id) =>
  apiRequest(`/api/projects/${id}/deployment/domains`).then((d) => d.domains);
deploymentsApi.addDomain = (id, domain) =>
  apiRequest(`/api/projects/${id}/deployment/domains`, {
    method: 'POST',
    body: JSON.stringify({ domain })
  }).then((d) => d.domain);
deploymentsApi.verifyDomain = (id, domain) =>
  apiRequest(`/api/projects/${id}/deployment/domains/${encodeURIComponent(domain)}/verify`, {
    method: 'POST'
  });
deploymentsApi.removeDomain = (id, domain) =>
  apiRequest(`/api/projects/${id}/deployment/domains/${encodeURIComponent(domain)}`, {
    method: 'DELETE'
  });
