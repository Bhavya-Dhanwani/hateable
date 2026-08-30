import type { Request, Response, NextFunction } from "express";
import { ServerResponse } from "node:http";
import { createProxyMiddleware } from "http-proxy-middleware";
import { recordActivity, onPreviewReaped } from "../services/activity.service.js";

const proxyMap: { [key: string]: Function } = {};
const proxyAgentMap: { [key: string]: Function } = {};

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
            "^/": "/",
        },
        on: {
            error: (err, req, res) => {
                const response = res as ServerResponse;
                if (response.writeHead && !response.headersSent) {
                    response.writeHead(503, { "Content-Type": "text/html" });
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
            "^/": "/",
        },
        on: {
            error: (err, req, res) => {
                const response = res as ServerResponse;
                if (response.writeHead && !response.headersSent) {
                    response.writeHead(503, { "Content-Type": "text/html" });
                    response.end(STARTING_HTML);
                }
            }
        }
    });

    proxyAgentMap[uniqueId] = proxyMiddleware;

    return proxyMiddleware;

}

function handleProxy(req: Request, res: Response, next: NextFunction) {

    const host = req.headers.host || "";

    if(!host.includes("preview") && !host.includes("workspace")) {
        return next();
    }

    const subDomains = host.split(".");

    const uniqueId = subDomains[0];

    if (!uniqueId) {
        return res.status(400).json({ error: "Invalid preview URL." });
    }

    // Refresh the idle timer for this preview asynchronously
    void recordActivity(uniqueId);

    if (host.includes("preview")) {
        return handleProxyAgent(uniqueId)(req, res, next);
    }else if (host.includes("workspace")) {
        return handleProxyAgentWorkspace(uniqueId)(req, res, next);
    }
}

export default handleProxy;