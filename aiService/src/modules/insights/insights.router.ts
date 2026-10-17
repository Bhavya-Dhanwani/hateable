// Importing modules
import express, { RequestHandler } from 'express';
import InsightsController from './insights.controller.js';
import authMiddleware from '../../shared/middlewares/auth.middleware.js';
import asyncWrapper from '../../shared/utils/asyncWrapper.util.js';

// making the router
const router = express.Router();

// creating an insights controller instance
const insightsController = new InsightsController();

/*
	@route POST /api/ai/insights
	@desc Ask the site AI about a deployed site (reads its logs and analytics)
	@access Private
*/
router.post(
  '/',
  authMiddleware as RequestHandler,
  asyncWrapper(insightsController.ask) as RequestHandler
);

// exporting the router
export default router;
