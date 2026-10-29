// BYOK key management: a user lists, adds and removes their own provider API keys. Secrets are
// write-only — list never returns them, only a masked tail.
import express, { Request, RequestHandler, Response } from 'express';
import authMiddleware from '../../shared/middlewares/auth.middleware.js';
import asyncWrapper from '../../shared/utils/asyncWrapper.util.js';
import Ok from '../../shared/responses/Ok.response.js';
import Unauthorized from '../../shared/errors/Unauthorized.error.js';
import {
  addKey,
  listKeys,
  providerCatalog,
  removeKey
} from '../../shared/services/userKeys.service.js';

const router = express.Router();

const idOf = (req: Request & { user?: Record<string, unknown> }) => {
  const id = req.user?.userId || req.user?._id;
  if (!id) throw new Unauthorized('User authentication failed. No user ID found.');
  return String(id);
};

/* @route GET /api/ai/keys  @desc the provider catalog + the caller's saved keys (masked) */
router.get(
  '/',
  authMiddleware as RequestHandler,
  asyncWrapper(async (req: Request, res: Response) => {
    Ok(res, 'Keys fetched', { providers: providerCatalog, keys: await listKeys(idOf(req)) });
  }) as RequestHandler
);

/* @route POST /api/ai/keys  @desc add a key { provider, apiKey, model? } */
router.post(
  '/',
  authMiddleware as RequestHandler,
  asyncWrapper(async (req: Request, res: Response) => {
    Ok(res, 'Key added', { keys: await addKey(idOf(req), req.body) });
  }) as RequestHandler
);

/* @route DELETE /api/ai/keys/:id  @desc remove one of the caller's keys */
router.delete(
  '/:id',
  authMiddleware as RequestHandler,
  asyncWrapper(async (req: Request, res: Response) => {
    Ok(res, 'Key removed', { keys: await removeKey(idOf(req), String(req.params.id)) });
  }) as RequestHandler
);

export default router;
