// Importing modules
import express from 'express';
import healthRouter from './health.router.js';
import podsRouter from '../../modules/pods/pods.router.js';
import deploymentsRouter from '../../modules/deployments/deployments.router.js';

// making the router
const router = express.Router();

// mounting the public routers
router.use('/health', healthRouter);
router.use('/projects', podsRouter);
router.use('/projects', deploymentsRouter);

// exporting the router
export default router;
