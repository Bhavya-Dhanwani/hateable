// Importing modules
import express from 'express';
import catchAsync from '../../shared/utils/catchAsync.util.js';
import DeploymentsController from './deployments.controller.js';
import { analyticsValidators, projectIdValidators } from './deployments.validator.js';
import authMiddleware from '../../shared/middlewares/auth.middleware.js';

// making the router
const router = express.Router();

// creating an instance of the controller
const deploymentsController = new DeploymentsController();

/*
    @route GET /api/projects/:projectId/deployment
    @desc Get the deployment of a project with its live status
    @access Private
*/
router.get(
  '/:projectId/deployment',
  authMiddleware,
  projectIdValidators,
  catchAsync(deploymentsController.getDeployment)
);

/*
    @route POST /api/projects/:projectId/deployment
    @desc Deploy (or redeploy) the project to <slug>.<DEPLOY_DOMAIN>
    @access Private
*/
router.post(
  '/:projectId/deployment',
  authMiddleware,
  projectIdValidators,
  catchAsync(deploymentsController.deploy)
);

/*
    @route DELETE /api/projects/:projectId/deployment
    @desc Unpublish the deployment and free its subdomain
    @access Private
*/
router.delete(
  '/:projectId/deployment',
  authMiddleware,
  projectIdValidators,
  catchAsync(deploymentsController.undeploy)
);

/*
    @route GET /api/projects/:projectId/deployment/analytics?days=14
    @desc Get the visitor analytics of the deployment
    @access Private
*/
router.get(
  '/:projectId/deployment/analytics',
  authMiddleware,
  analyticsValidators,
  catchAsync(deploymentsController.getAnalytics)
);

// exporting the router
export default router;
