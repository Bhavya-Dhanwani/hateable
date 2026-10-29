import { Request, Response, NextFunction } from 'express';
import { timingSafeEqual } from 'node:crypto';
import env from '../config/env.config.js';
import Unauthorized from '../errors/Unauthorized.error.js';

// Gate for admin-only routes (plan switch, payment approvals). Timing-safe compare of the
// x-admin-key header against ADMIN_API_KEY; when the key is unset the routes are off.
function adminMiddleware(req: Request, _res: Response, next: NextFunction) {
  const given = Buffer.from(String(req.headers['x-admin-key'] || ''));
  const expected = Buffer.from(env.ADMIN_API_KEY || '');
  if (!env.ADMIN_API_KEY || given.length !== expected.length || !timingSafeEqual(given, expected)) {
    throw new Unauthorized('Admin key is missing or wrong');
  }
  next();
}

export default adminMiddleware;
