import jwt from "jsonwebtoken";
import { Request, Response, NextFunction } from "express";
import env from "../config/env.config.js";
import Unauthorized from "../errors/Unauthorized.error.js";

function authMiddleware(req: Request & { user?: Record<string, unknown> }, res: Response, next: NextFunction) {

    let accessToken = (req.headers.accesstoken as string) || (req.headers["access-token"] as string);
    if (!accessToken && req.headers.authorization) {
        const parts = req.headers.authorization.split(" ");
        if (parts.length === 2 && parts[0].toLowerCase() === "bearer") {
            accessToken = parts[1];
        } else {
            accessToken = req.headers.authorization;
        }
    }

    if (!accessToken) {
        throw new Unauthorized("Access token is required.");
    }

    try {
        const decoded = jwt.verify(accessToken, env.ACCESS_TOKEN_SECRET);
        req.user = decoded as Record<string, unknown>;
        next();
    } catch (error) {
        throw new Unauthorized("Access token expired or invalid.");
    }

}

export default authMiddleware;
