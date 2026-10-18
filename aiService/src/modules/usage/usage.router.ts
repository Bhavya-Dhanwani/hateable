// Importing modules
import express, { Request, RequestHandler, Response } from 'express';
import authMiddleware from '../../shared/middlewares/auth.middleware.js';
import asyncWrapper from '../../shared/utils/asyncWrapper.util.js';
import Forbidden from '../../shared/errors/Forbidden.error.js';
import Ok from '../../shared/responses/Ok.response.js';
import { usageOf, usagePool } from '../../shared/services/plan.service.js';
import { TokenUser } from '../chat/utils/project.util.js';

// making the router
const router = express.Router();

/*
	@route GET /api/ai/usage?workspaceId=
	@desc AI messages per member and project: the workspace's shared pool, or the caller's own
	@access Private (workspace members)
*/
router.get(
  '/',
  authMiddleware as RequestHandler,
  asyncWrapper(async (req: Request, res: Response) => {
    const user = (req as Request & { user?: TokenUser }).user;
    const workspaceId = typeof req.query.workspaceId === 'string' ? req.query.workspaceId : '';
    if (workspaceId && !user?.workspaces?.some((w) => w.id === workspaceId)) {
      throw new Forbidden('You are not a member of this workspace');
    }
    return Ok(res, 'Usage fetched', await usageOf(usagePool(user, { workspaceId })));
  }) as RequestHandler
);

// exporting the router
export default router;
