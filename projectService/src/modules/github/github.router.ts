// Importing modules
import express from 'express';
import { body, param } from 'express-validator';
import catchAsync from '../../shared/utils/catchAsync.util.js';
import validateErrors from '../../shared/utils/validateErrors.util.js';
import GithubController from './github.controller.js';
import authMiddleware from '../../shared/middlewares/auth.middleware.js';

// making the router
const router = express.Router();

// creating an instance of the controller
const githubController = new GithubController();

// validating the project id in the url
const projectIdValidators = [
  param('projectId').isMongoId().withMessage('projectId must be a valid id'),
  validateErrors
];

/*
    @route GET /api/projects/github/status
    @desc Whether GitHub is configured and connected for the user
    @access Private
*/
router.get('/github/status', authMiddleware, catchAsync(githubController.status));

/*
    @route GET /api/projects/github/connect?returnTo=/projects/:id
    @desc Get the GitHub authorize URL to send the browser to
    @access Private
*/
router.get('/github/connect', authMiddleware, catchAsync(githubController.connect));

/*
    @route GET /api/projects/github/callback
    @desc GitHub OAuth redirect target, stores the token and returns to the app
    @access Public (authenticated by the signed state)
*/
router.get('/github/callback', catchAsync(githubController.callback));

/*
    @route DELETE /api/projects/github
    @desc Disconnect the user's GitHub account
    @access Private
*/
router.delete('/github', authMiddleware, catchAsync(githubController.disconnect));

/*
    @route GET /api/projects/:projectId/github
    @desc Get the repo the project is linked to
    @access Private
*/
router.get(
  '/:projectId/github',
  authMiddleware,
  projectIdValidators,
  catchAsync(githubController.getLink)
);

/*
    @route POST /api/projects/:projectId/github/push
    @desc Push the project to GitHub, creating the repo if needed ({ repo, message? })
    @access Private
*/
router.post(
  '/:projectId/github/push',
  authMiddleware,
  projectIdValidators,
  body('repo').optional().isString().withMessage('repo must be a string'),
  validateErrors,
  catchAsync(githubController.push)
);

/*
    @route POST /api/projects/:projectId/github/pull
    @desc Pull the changes made on GitHub into the workspace
    @access Private
*/
router.post(
  '/:projectId/github/pull',
  authMiddleware,
  projectIdValidators,
  catchAsync(githubController.pull)
);

// exporting the router
export default router;
