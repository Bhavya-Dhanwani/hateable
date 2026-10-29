import { Request, Response } from 'express';
import mongoose from 'mongoose';
import env from '../../shared/config/env.config.js';
import Payment from '../../shared/models/payment.model.js';
import User, { PLAN_PRICES, Plan } from '../../shared/models/user.model.js';
import { AuthenticatedRequest } from '../auth/auth.types.js';
import Ok from '../../shared/responses/Ok.response.js';
import Created from '../../shared/responses/Created.response.js';
import BadRequest from '../../shared/errors/BadRequest.error.js';
import NotFound from '../../shared/errors/NotFound.error.js';

type PaidPlan = Exclude<Plan, 'free'>;
const isPaidPlan = (p: unknown): p is PaidPlan => p === 'pro' || p === 'team';

class PaymentsController {
  // Public runtime config for the frontend: whether to hide subscriptions, and UPI details for the QR.
  config = (_req: Request, res: Response) => {
    const upiEnabled = !env.FREE_MODE && !!env.UPI_ID;
    return Ok(res, 'Config', {
      freeMode: env.FREE_MODE,
      upiEnabled,
      // VPA is a payment address meant to be shared; only sent when payments are actually on
      upi: upiEnabled ? env.UPI_ID : '',
      payeeName: env.UPI_PAYEE_NAME,
      prices: PLAN_PRICES
    });
  };

  // User says they've paid: record a pending request for an admin to confirm against the UPI inbox.
  create = async (req: AuthenticatedRequest, res: Response) => {
    if (env.FREE_MODE)
      throw new BadRequest('Payments are disabled — everything is free right now.');
    if (!env.UPI_ID) throw new BadRequest('Payments are not configured yet.');

    const userId = req.user?.userId || req.user?._id;
    const email = req.user?.email;
    if (!userId || !email) throw new BadRequest('Not signed in.');

    const { plan, reference } = req.body as { plan?: string; reference?: string };
    if (!isPaidPlan(plan)) throw new BadRequest('plan must be pro or team');

    // one pending request per user: avoids a pile of duplicates for the admin to sift
    const existing = await Payment.findOne({ userId: String(userId), status: 'pending' });
    if (existing) {
      throw new BadRequest('You already have a payment awaiting approval.');
    }

    const payment = await Payment.create({
      userId: String(userId),
      email,
      plan,
      amount: PLAN_PRICES[plan],
      reference: typeof reference === 'string' ? reference.trim().slice(0, 120) : undefined
    });
    return Created(res, 'Payment submitted for approval', { payment });
  };

  // The caller's own requests (so the UI can show "pending" / "approved").
  mine = async (req: AuthenticatedRequest, res: Response) => {
    const userId = req.user?.userId || req.user?._id;
    const payments = await Payment.find({ userId: String(userId) })
      .sort({ createdAt: -1 })
      .limit(20);
    return Ok(res, 'Your payments', { payments });
  };

  // Admin: pending requests first, then recent decisions, newest first.
  adminList = async (_req: Request, res: Response) => {
    const payments = await Payment.find().sort({ status: 1, createdAt: -1 }).limit(100);
    return Ok(res, 'Payments', { payments });
  };

  // Admin: approve (flips the user's plan, applied on their next token refresh) or reject.
  adminDecide = async (req: Request, res: Response) => {
    const { action } = req.body as { action?: string };
    if (action !== 'approve' && action !== 'reject') {
      throw new BadRequest("action must be 'approve' or 'reject'");
    }
    // guard the cast: a non-ObjectId id would otherwise throw a 500
    if (!mongoose.isValidObjectId(req.params.id)) throw new NotFound('Payment not found');
    const payment = await Payment.findById(req.params.id);
    if (!payment) throw new NotFound('Payment not found');
    if (payment.status !== 'pending') throw new BadRequest(`Payment already ${payment.status}`);

    if (action === 'approve') {
      const user = await User.findById(payment.userId);
      if (!user) throw new NotFound('User not found');
      user.plan = payment.plan as Plan;
      await user.save();
    }
    payment.status = action === 'approve' ? 'approved' : 'rejected';
    await payment.save();
    return Ok(res, `Payment ${payment.status}`, { payment });
  };
}

export default PaymentsController;
