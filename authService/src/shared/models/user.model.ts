// Importing module
import mongoose from 'mongoose';
import { hashPassword, comparePassword } from '../../shared/utils/hashing.util.js';

// the plans a user can be on; the landing page pricing uses the same keys
export const PLANS = ['free', 'pro', 'team'] as const;
export type Plan = (typeof PLANS)[number];

// monthly price in INR for the manual UPI checkout (free has no price); keys match PLANS
export const PLAN_PRICES: Record<Exclude<Plan, 'free'>, number> = { pro: 999, team: 1999 };

// defining the schema for the user model
const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Name is required'],
    minlength: [3, 'Name must be at least 3 characters long']
  },

  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: [true, 'Email already exists'],
    match: [/\S+@\S+\.\S+/, 'Email is invalid']
  },

  password: {
    type: String,
    required: false,
    minlength: [6, 'Password must be at least 6 characters long']
  },

  providers: {
    type: [String],
    enum: ['local', 'google'],
    default: ['local']
  },

  googleId: {
    type: String,
    required: false
  },

  isVerified: {
    type: Boolean,
    default: false
  },

  plan: {
    type: String,
    enum: PLANS,
    default: 'free'
  },

  // E.164 number verified via Truecaller; unique so one number belongs to one account
  phone: {
    type: String,
    unique: true,
    sparse: true,
    match: [/^\+[1-9]\d{7,14}$/, 'Phone must be in E.164 format']
  },

  // Telegram account the user verified with (one per account); each sits on its own phone number
  telegramId: {
    type: String,
    unique: true,
    sparse: true
  },

  // true once verified by Telegram or Truecaller; projectService requires it to create projects
  phoneVerified: {
    type: Boolean,
    default: false
  }
});

// adding a pre-save hook to hash the password before saving the user
userSchema.pre('save', async function () {
  // checking if the password is modified or exists
  if (!this.isModified('password') || !this.password) return;

  // hashing the password
  this.password = await hashPassword(this.password);
});

// adding a method to compare the password
userSchema.methods.comparePassword = async function (password: string) {
  // checking if the user has a password
  if (!this.password) return false;

  // comparing the password with the hashed password
  const isMatch = await comparePassword(password, this.password);

  // returning the result of the comparison
  return isMatch;
};

// making the model for the user schema
const User = mongoose.model('User', userSchema);

// exporting the user model
export default User;
