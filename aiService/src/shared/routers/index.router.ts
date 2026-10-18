import express from 'express';
import healthRouter from './health.router.js';
import chatRouter from '../../modules/chat/chat.router.js';
import insightsRouter from '../../modules/insights/insights.router.js';
import usageRouter from '../../modules/usage/usage.router.js';

const router = express.Router();

router.use('/health', healthRouter);
// ingress routes /api/ai/* to this service
router.use('/ai/chat', chatRouter);
router.use('/ai/insights', insightsRouter);
router.use('/ai/usage', usageRouter);

export default router;
