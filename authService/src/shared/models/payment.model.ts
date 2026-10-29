import mongoose from 'mongoose';
import { PLANS } from './user.model.js';

// A manual UPI payment request: the user pays via UPI, then an admin approves after confirming
// the money landed, which flips the user's plan. A stopgap until a real payment gateway.
const paymentSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true, index: true },
    email: { type: String, required: true },
    plan: { type: String, enum: PLANS, required: true }, // the plan being bought (pro | team)
    amount: { type: Number, required: true }, // INR, from PLAN_PRICES at request time
    reference: { type: String }, // optional UPI transaction reference the user pasted
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected'],
      default: 'pending',
      index: true
    }
  },
  { timestamps: true }
);

const Payment = mongoose.model('Payment', paymentSchema);

export default Payment;
