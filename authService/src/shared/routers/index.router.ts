// Importing modules
import express from 'express';
import healthRouter from './health.router.js';
import authRouter from '../../modules/auth/auth.router.js';
import workspacesRouter from '../../modules/workspaces/workspaces.router.js';

// making the router
const router = express.Router();

// mounting the public routers
router.use('/health', healthRouter);
// before authRouter, under /auth so the ingress routes it here
router.use('/auth/workspaces', workspacesRouter);
router.use('/auth', authRouter);

// exporting the router
export default router;
