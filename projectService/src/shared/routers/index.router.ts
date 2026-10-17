// Importing modules
import express from 'express';
import healthRouter from './health.router.js';
import podsRouter from '../../modules/pods/pods.router.js';
import deploymentsRouter from '../../modules/deployments/deployments.router.js';
import githubRouter from '../../modules/github/github.router.js';

// making the router
const router = express.Router();

// mounting the public routers
router.use('/health', healthRouter);
// before podsRouter: its GET /:projectId would otherwise swallow /github/status
router.use('/projects', githubRouter);
router.use('/projects', podsRouter);
router.use('/projects', deploymentsRouter);

// exporting the router
export default router;
