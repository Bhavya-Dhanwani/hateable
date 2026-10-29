import express from 'express';
import PaymentsController from './payments.controller.js';
import authMiddleware from '../../shared/middlewares/auth.middleware.js';
import adminMiddleware from '../../shared/middlewares/admin.middleware.js';

const router = express.Router();
const c = new PaymentsController();

// @route GET  /api/auth/config            public runtime config (free mode, UPI, prices)
router.get('/config', c.config);

// @route POST /api/auth/payments           user submits a paid UPI request  @access Private
router.post('/payments', authMiddleware, c.create);
// @route GET  /api/auth/payments/me        the caller's requests            @access Private
router.get('/payments/me', authMiddleware, c.mine);

// @route GET   /api/auth/admin/payments        list requests                @access Admin
router.get('/admin/payments', adminMiddleware, c.adminList);
// @route PATCH /api/auth/admin/payments/:id    approve|reject               @access Admin
router.patch('/admin/payments/:id', adminMiddleware, c.adminDecide);

export default router;
