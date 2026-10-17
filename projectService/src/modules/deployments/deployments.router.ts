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
    @route GET /api/projects/:projectId/deployment/domains
    @desc List the custom domains of the deployment, with the DNS records to create
    @access Private
*/
router.get(
  '/:projectId/deployment/domains',
  authMiddleware,
  projectIdValidators,
  catchAsync(deploymentsController.listDomains)
);

/*
    @route POST /api/projects/:projectId/deployment/domains
    @desc Connect a custom domain ({ domain }), pending until verified
    @access Private
*/
router.post(
  '/:projectId/deployment/domains',
  authMiddleware,
  projectIdValidators,
  catchAsync(deploymentsController.addDomain)
);

/*
    @route POST /api/projects/:projectId/deployment/domains/:domain/verify
    @desc Check the domain's DNS; it serves the site once its TXT record is found
    @access Private
*/
router.post(
  '/:projectId/deployment/domains/:domain/verify',
  authMiddleware,
  projectIdValidators,
  catchAsync(deploymentsController.verifyDomain)
);

/*
    @route DELETE /api/projects/:projectId/deployment/domains/:domain
    @desc Disconnect a custom domain
    @access Private
*/
router.delete(
  '/:projectId/deployment/domains/:domain',
  authMiddleware,
  projectIdValidators,
  catchAsync(deploymentsController.removeDomain)
);

/*
    @route GET /api/projects/:projectId/deployment/env
    @desc Get the deployment's environment variables
    @access Private
*/
router.get(
  '/:projectId/deployment/env',
  authMiddleware,
  projectIdValidators,
  catchAsync(deploymentsController.getEnv)
);

/*
    @route PUT /api/projects/:projectId/deployment/env
    @desc Replace the deployment's environment variables ({ vars: { NAME: value } })
    @access Private
*/
router.put(
  '/:projectId/deployment/env',
  authMiddleware,
  projectIdValidators,
  catchAsync(deploymentsController.updateEnv)
);

/*
    @route GET /api/projects/:projectId/deployment/logs
    @desc Get the optimized logs of the deployment (app output + lifecycle events)
    @access Private
*/
router.get(
  '/:projectId/deployment/logs',
  authMiddleware,
  projectIdValidators,
  catchAsync(deploymentsController.getLogs)
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
