import type { Request, Response, NextFunction } from 'express';
import { IncomingMessage, ServerResponse } from 'node:http';
import { createProxyMiddleware } from 'http-proxy-middleware';
import {
  recordActivity,
  onPreviewReaped,
  touchDeployment,
  claimDeploymentWake
} from '../services/activity.service.js';
import { isPageView, recordHit, recordWake } from '../services/analytics.service.js';
import { recordDeployEvent } from '../services/logs.service.js';
import { deploymentServiceName, startDeployment } from '../services/deployment.service.js';
import { notFoundPage, wakingPage } from '../templates/deploy.templates.js';
import DeploymentDao from '../dao/deployment.dao.js';
import { SLUG_PATTERN } from '../utils/slugify.util.js';
import env from '../config/env.config.js';
import logger from '../config/logger.config.js';

const proxyMap: { [key: string]: Function } = {};
const proxyAgentMap: { [key: string]: Function } = {};

// deployment proxies target the stable service DNS name, so they stay valid across sleeps
const deployProxyMap: { [slug: string]: Function } = {};

// when each deployment request arrived, to measure the site's response time
const requestStart = new WeakMap<IncomingMessage, number>();

const deploymentDao = new DeploymentDao();

// when this replica started waking each deployment, to log how long the cold start took
// ponytail: in-process, so with several replicas only the waking one logs the duration
const wakingSince = new Map<string, number>();

// Clean up stale proxy instances when a preview is reaped
onPreviewReaped((uniqueId) => {
  delete proxyMap[uniqueId];
  delete proxyAgentMap[uniqueId];
});

const STARTING_HTML = `
<!DOCTYPE html>
<html>
<head>
  <title>Workspace Starting Up</title>
  <meta http-equiv="refresh" content="5">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; text-align: center; padding: 50px; background-color: #f7f9fa; }
    .card { background: white; padding: 40px; border-radius: 8px; box-shadow: 0 4px 6px rgba(0,0,0,0.05); max-width: 500px; margin: 0 auto; border: 1px solid #e1e8ed; }
    h1 { color: #1a1a1a; font-size: 24px; margin-bottom: 10px; }
    p { color: #657786; font-size: 16px; line-height: 1.5; }
    .spinner { border: 3px solid #e1e8ed; width: 40px; height: 40px; border-radius: 50%; border-left-color: #1da1f2; animation: spin 1s linear infinite; margin: 25px auto; }
    @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
  </style>
</head>
<body>
  <div class="card">
    <div class="spinner"></div>
    <h1>Project workspace is starting up</h1>
    <p>We are spinning up the preview environment for this project. This page will refresh automatically in 5 seconds...</p>
  </div>
</body>
</html>
`;

function handleProxyAgent(uniqueId: string) {
  if (proxyMap[uniqueId]) {
    return proxyMap[uniqueId];
  }

  const targetUrl = `http://nextjs-service-${uniqueId}`;

  const proxyMiddleware = createProxyMiddleware({
    target: targetUrl,
    changeOrigin: true,
    pathRewrite: {
      '^/': '/'
    },
    on: {
      error: (err, req, res) => {
        const response = res as ServerResponse;
        if (response.writeHead && !response.headersSent) {
          response.writeHead(503, { 'Content-Type': 'text/html' });
          response.end(STARTING_HTML);
        }
      }
    }
  });

  proxyMap[uniqueId] = proxyMiddleware;

  return proxyMiddleware;
}

function handleProxyAgentWorkspace(uniqueId: string) {
  if (proxyAgentMap[uniqueId]) {
    return proxyAgentMap[uniqueId];
  }

  const targetUrl = `http://nextjs-service-${uniqueId}:8000`;

  const proxyMiddleware = createProxyMiddleware({
    target: targetUrl,
    changeOrigin: true,
    pathRewrite: {
      '^/': '/'
    },
    on: {
      error: (err, req, res) => {
        const response = res as ServerResponse;
        if (response.writeHead && !response.headersSent) {
          response.writeHead(503, { 'Content-Type': 'text/html' });
          response.end(STARTING_HTML);
        }
      }
    }
  });

  proxyAgentMap[uniqueId] = proxyMiddleware;

  return proxyMiddleware;
}

// function to answer with the "waking up" loader, its header tells the loader's poll to keep waiting
function sendWaking(res: ServerResponse, slug: string) {
  res.writeHead(503, {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-store',
    'Retry-After': '3',
    'x-hateable-waking': '1'
  });
  res.end(wakingPage(slug));
}

// function to answer with the themed "no site here" page
function sendNotFound(res: ServerResponse, slug: string) {
  res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(notFoundPage(slug));
}

function handleDeploymentProxy(slug: string) {
  if (deployProxyMap[slug]) {
    return deployProxyMap[slug];
  }

  const proxyMiddleware = createProxyMiddleware({
    target: `http://${deploymentServiceName(slug)}`,
    changeOrigin: true,
    xfwd: true,
    on: {
      // every answer from the site feeds the analytics dashboard
      proxyRes: (proxyRes, req) => {
        const startedAt = requestStart.get(req) ?? Date.now();
        const status = proxyRes.statusCode || 0;
        void recordHit(slug, req, status, Date.now() - startedAt);

        // the first answer after a wake: the cold start is over
        const wokeAt = wakingSince.get(slug);
        if (wokeAt) {
          wakingSince.delete(slug);
          const seconds = ((Date.now() - wokeAt) / 1000).toFixed(1);
          void recordDeployEvent(slug, 'info', `Back online after a ${seconds}s cold start`);
        }

        // only failures are worth a log line, successful traffic is in the analytics
        const line = `${req.method} ${(req.url || '/').split('?')[0]} -> ${status} in ${Date.now() - startedAt}ms`;
        if (status >= 500) void recordDeployEvent(slug, 'error', line);
        else if (status === 404 && isPageView(req)) void recordDeployEvent(slug, 'warn', line);
      },

      // the pod exists but the app is not listening yet: keep showing the loader
      error: (err, req, res) => {
        if (res instanceof ServerResponse && !res.headersSent) {
          sendWaking(res, slug);
        }
      }
    }
  });

  deployProxyMap[slug] = proxyMiddleware;

  return proxyMiddleware;
}

/**
 * Serves <slug>.<DEPLOY_DOMAIN>.
 *
 * Awake site: slide its 15 minute idle window and proxy to its pod.
 * Sleeping site: the first visitor claims the wake and starts the pod in the
 * background, everyone sees the loader until the pod answers.
 */
async function handleDeployment(slug: string, req: Request, res: Response, next: NextFunction) {
  if (!SLUG_PATTERN.test(slug)) {
    return sendNotFound(res, '');
  }

  requestStart.set(req, Date.now());

  // awake: the visit itself resets the idle timer
  if (await touchDeployment(slug)) {
    return handleDeploymentProxy(slug)(req, res, next);
  }

  const deployment = await deploymentDao.findBySlug(slug);

  if (!deployment) {
    return sendNotFound(res, slug);
  }

  // only the visitor that wins the claim starts the pod, the rest just wait on the loader
  if (await claimDeploymentWake(slug)) {
    wakingSince.set(slug, Date.now());
    void recordDeployEvent(slug, 'info', 'A visitor arrived, waking the site up');
    startDeployment(deployment)
      .then(() => recordWake(slug))
      .catch((error) => {
        wakingSince.delete(slug);
        logger.error(error, `Failed to wake deployment ${slug}`);
        void recordDeployEvent(slug, 'error', `Failed to start: ${(error as Error).message}`);
      });
  }

  return sendWaking(res, slug);
}

function handleProxy(req: Request, res: Response, next: NextFunction) {
  const host = req.headers.host || '';

  // deployments first: a slug may itself contain "preview" or "workspace"
  const hostname = host.split(':')[0].toLowerCase();
  if (hostname.endsWith(`.${env.DEPLOY_DOMAIN}`)) {
    return handleDeployment(hostname.slice(0, -env.DEPLOY_DOMAIN.length - 1), req, res, next);
  }

  if (!host.includes('preview') && !host.includes('workspace')) {
    return next();
  }

  const subDomains = host.split('.');

  const uniqueId = subDomains[0];

  if (!uniqueId) {
    return res.status(400).json({ error: 'Invalid preview URL.' });
  }

  // Refresh the idle timer for this preview asynchronously
  void recordActivity(uniqueId);

  if (host.includes('preview')) {
    return handleProxyAgent(uniqueId)(req, res, next);
  } else if (host.includes('workspace')) {
    return handleProxyAgentWorkspace(uniqueId)(req, res, next);
  }
}

export default handleProxy;
