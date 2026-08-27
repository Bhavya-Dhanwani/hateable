import type { Request, Response, NextFunction } from "express";
import { createProxyMiddleware } from "http-proxy-middleware";

const proxyMap: { [key: string]: Function } = {};
const proxyAgentMap: { [key: string]: Function } = {};

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

    if (host.includes("preview")) {
        return handleProxyAgent(uniqueId)(req, res, next);
    }else if (host.includes("workspace")) {
        return handleProxyAgentWorkspace(uniqueId)(req, res, next);
    }
}

export default handleProxy;