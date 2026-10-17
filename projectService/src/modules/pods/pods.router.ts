// Importing modules
import express from 'express';
import catchAsync from '../../shared/utils/catchAsync.util.js';
import PodsController from './pods.controller.js';
import { createPodValidators } from './pods.validator.js';
import { CreatePodRequest } from './pods.type.js';
import authMiddleware from '../../shared/middlewares/auth.middleware.js';

// making the router
const router = express.Router();

// creating an instance of the controller
const podsController = new PodsController();

// defining the routes
router.get('/', authMiddleware, catchAsync(podsController.listProjects));
router.post(
  '/',
  authMiddleware,
  createPodValidators,
  catchAsync<CreatePodRequest>(podsController.createPod)
);
router.get('/:projectId', authMiddleware, catchAsync(podsController.getProject));
router.post('/:projectId/launch', authMiddleware, catchAsync(podsController.relaunchPod));

export default router;
