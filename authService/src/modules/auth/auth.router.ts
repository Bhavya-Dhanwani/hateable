// Importing modules
import express from 'express';
import AuthController from './auth.controller.js';
import {
  signupValidators,
  loginValidators,
  forgotPasswordValidators,
  resetPasswordValidators,
  googleLoginValidators
} from './auth.validator.js';
import authMiddleware from '../../shared/middlewares/auth.middleware.js';
import refreshMiddleware from '../../shared/middlewares/refresh.middleware.js';

// making the router
const router = express.Router();

// creating a auth controller instance
const authController = new AuthController();

/*
    @route POST /api/auth/signup
    @desc Signup user
    @access Public
*/
router.post('/signup', signupValidators, authController.signup);

/*
    @route POST /api/auth/login
    @desc Login user
    @access Public
*/
router.post('/login', loginValidators, authController.login);

/*
    @route GET /api/auth/me
    @desc Get authenticated user profile
    @access Private
*/
router.get('/me', authMiddleware, authController.me);

/*
    @route POST /api/auth/refresh
    @desc Refresh access token
    @access Public
*/
router.post('/refresh', refreshMiddleware, authController.refresh);

/*
    @route POST /api/auth/logout
    @desc Logout user
    @access Public
*/
router.post('/logout', refreshMiddleware, authController.logout);

/*
    @route POST /api/auth/logoutall
    @desc Logout user from all active sessions
    @access Private
*/
router.post('/logoutall', authMiddleware, authController.logoutAll);

/*
    @route POST /api/auth/google-login
    @desc Login user via Google
    @access Public
*/
router.post('/google-login', googleLoginValidators, authController.googleLogin);
router.get('/google', authController.googleRedirect);
router.get('/google/callback', authController.googleCallback);

/*
    @route POST /api/auth/phone/truecaller
    @desc Start Truecaller phone verification, returns { requestNonce, deepLink }
    @access Private
*/
router.post('/phone/truecaller', authMiddleware, authController.truecallerStart);

/*
    @route POST /api/auth/phone/truecaller/callback
    @desc Callback URL registered in the Truecaller developer portal
    @access Public (called by Truecaller)
*/
router.post('/phone/truecaller/callback', authController.truecallerCallback);

/*
    @route POST /api/auth/phone/telegram
    @desc Start Telegram phone verification, returns { requestNonce, link } to the bot
    @access Private
*/
router.post('/phone/telegram', authMiddleware, authController.telegramStart);

/*
    @route POST /api/auth/phone/telegram/webhook
    @desc Telegram bot webhook (setWebhook with secret_token = TELEGRAM_WEBHOOK_SECRET)
    @access Public (called by Telegram)
*/
router.post('/phone/telegram/webhook', authController.telegramWebhook);

/*
    @route GET /api/auth/phone/:nonce
    @desc Poll a verification: pending, verified (with user), 409 if the number is taken
    @access Private
*/
router.get('/phone/:nonce', authMiddleware, authController.phoneStatus);

/*
    @route POST /api/auth/forgot-password
    @desc Forgot password
    @access Public
*/
router.post('/forgot-password', forgotPasswordValidators, authController.forgotPassword);

/*
    @route POST /api/auth/reset-password
    @desc Reset password
    @access Public
*/
router.post('/reset-password', resetPasswordValidators, authController.resetPassword);

/*
    @route PATCH /api/auth/admin/plan
    @desc Set a user's plan: body { email, plan }, header x-admin-key: ADMIN_API_KEY
    @access Admin
*/
router.patch('/admin/plan', authController.setPlan);

// exporting the router
export default router;
