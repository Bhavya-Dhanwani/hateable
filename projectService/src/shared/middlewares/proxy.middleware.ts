import type { Request, Response, NextFunction } from "express";
import { createProxyMiddleware } from "http-proxy-middleware";

const proxyMap: { [key: string]: Function } = {};

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

function handleProxy(req: Request, res: Response, next: NextFunction) {

    const host = req.headers.host || "";

    if(!host.includes("preview")) {
        return next();
    }

    const subDomains = host.split(".");

    const uniqueId = subDomains[0];

    if (!uniqueId) {
        return res.status(400).json({ error: "Invalid preview URL." });
    }

    return handleProxyAgent(uniqueId)(req, res, next);

}

export default handleProxy;