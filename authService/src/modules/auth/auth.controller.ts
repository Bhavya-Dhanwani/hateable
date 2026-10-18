// Importing modules
import { Request, Response } from 'express';
import {
  AuthenticatedRequest,
  SignupRequest,
  LoginRequest,
  SessionRequest,
  GoogleLoginRequest,
  ForgotPasswordRequest,
  ResetPasswordRequest
} from './auth.types.js';
import env from '../../shared/config/env.config.js';
import {
  OTP_EXPIRY_TIME,
  RESET_PASSWORD_TOKEN_EXPIRY_TIME
} from '../../shared/constants/tokens.constants.js';
import UserDao from '../../shared/dao/user.dao.js';
import SessionDao from '../../shared/dao/session.dao.js';
import TokenDao from '../../shared/dao/token.dao.js';
import NotFound from '../../shared/errors/NotFound.error.js';
import BadRequest from '../../shared/errors/BadRequest.error.js';
import Unauthorized from '../../shared/errors/Unauthorized.error.js';
import Created from '../../shared/responses/Created.response.js';
import Ok from '../../shared/responses/Ok.response.js';
import createSession from '../../shared/utils/createSession.util.js';
import {
  getGoogleAuthorizationUrl,
  getGoogleUserFromCode,
  verifyGoogleToken
} from '../../shared/utils/googleAuth.util.js';
import sendMail from '../../shared/utils/sendMail.util.js';
import { generateOTPToken, generateResetPasswordToken } from '../../shared/utils/token.util.js';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import Conflict from '../../shared/errors/Conflict.error.js';
import {
  buildTruecallerDeepLink,
  fetchTruecallerPhone
} from '../../shared/utils/truecaller.util.js';
import { sendTelegramMessage, telegramLink } from '../../shared/utils/telegram.util.js';
import logger from '../../shared/config/logger.config.js';
import { PLANS, Plan } from '../../shared/models/user.model.js';
import sanitizeUser from '../../shared/sanitizers/user.sanitizer.js';

// class to handle public authentication operations
class AuthController {
  userDao: UserDao;
  sessionDao: SessionDao;
  tokenDao: TokenDao;

  constructor() {
    // initializing the user dao
    this.userDao = new UserDao();

    // initializing the session dao
    this.sessionDao = new SessionDao();

    // initializing the token dao
    this.tokenDao = new TokenDao();
  }

  // signup a new user
  signup = async (req: SignupRequest, res: Response) => {
    // getting the user from the request body
    const { name, email, password, token } = req.body;

    // creating a new user using the user dao
    const user = await this.userDao.createUser({
      name,
      email,
      password,
      providers: ['local'],
      isVerified: token ? true : false
    });

    // creating session and tokens
    const { sanitizedUser, accessToken } = await createSession(user, res);

    // generating the otp to verify the user email
    const otp = generateOTPToken();

    // setting otp in the database using the token dao
    await this.tokenDao.createToken({
      email: user.email,
      type: 'otp',
      value: otp,
      expiresAt: new Date(Date.now() + OTP_EXPIRY_TIME)
    });

    sendMail(
      user.email,
      'Verify your email',
      `Your OTP is ${otp}. It will expire in ${OTP_EXPIRY_TIME / 60000} minutes.`
    );

    // returning otp verification response with access token
    return Created(res, 'Otp Sent Successfully for verification', {
      user: sanitizedUser,
      accessToken: accessToken
    });
  };

  // login an existing user
  login = async (req: LoginRequest, res: Response) => {
    // getting the user from the request body
    const { email, password } = req.body;

    // finding the user using the user dao
    const user = await this.userDao.findUserByEmail(email);

    // checking if the user exists
    if (!user) {
      throw new NotFound('User not found');
    }

    // checking if the password is valid
    const userWithAuth = user as unknown as { comparePassword(password: string): Promise<boolean> };
    const isPasswordValid = await userWithAuth.comparePassword(password || '');

    // if the password is not valid, throw an unauthorized error
    if (!isPasswordValid) {
      throw new Unauthorized('Invalid email or password');
    }

    // creating session and tokens
    const { sanitizedUser, accessToken } = await createSession(user, res);

    // returning the logged in user with access token
    return Ok(res, 'User Logged in Successfully', {
      user: sanitizedUser,
      accessToken: accessToken
    });
  };

  // get authenticated user profile
  me = async (req: AuthenticatedRequest, res: Response) => {
    // returning the authenticated user profile
    return Ok(res, 'User profile fetched successfully', { user: req.user });
  };

  // admin: set a user's plan (until real checkout exists). The new plan reaches the user's
  // access token on its next refresh, within one access-token lifetime.
  setPlan = async (req: Request, res: Response) => {
    const given = Buffer.from(String(req.headers['x-admin-key'] || ''));
    const expected = Buffer.from(env.ADMIN_API_KEY || '');
    if (
      !env.ADMIN_API_KEY ||
      given.length !== expected.length ||
      !timingSafeEqual(given, expected)
    ) {
      throw new Unauthorized('Admin key is missing or wrong');
    }

    const { email, plan } = req.body as { email?: string; plan?: string };
    if (!email || !PLANS.includes(plan as Plan)) {
      throw new BadRequest(`email and plan (${PLANS.join(', ')}) are required`);
    }

    const user = await this.userDao.findUserByEmail(email);
    if (!user) {
      throw new NotFound('User not found');
    }
    user.plan = plan as Plan;
    await user.save();

    return Ok(res, `Plan set to ${plan}`, { user: sanitizeUser(user.toObject()) });
  };

  // a single-use, 10 minute phone verification request; the nonce is URL and Telegram-payload safe
  private startPhoneRequest = async (
    email: string | undefined,
    type: 'truecaller' | 'telegram'
  ) => {
    const requestNonce = randomBytes(24).toString('base64url');
    await this.tokenDao.createToken({
      email,
      type,
      value: requestNonce,
      status: 'pending',
      expiresAt: new Date(Date.now() + 10 * 60 * 1000)
    });
    return requestNonce;
  };

  // start Telegram verification: the link opens our bot with "/start <nonce>"
  telegramStart = async (req: AuthenticatedRequest, res: Response) => {
    if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_BOT_USERNAME || !env.TELEGRAM_WEBHOOK_SECRET) {
      throw new BadRequest('Verification with Telegram is not configured');
    }
    const requestNonce = await this.startPhoneRequest(req.user?.email, 'telegram');
    return Created(res, 'Telegram verification started', {
      requestNonce,
      link: telegramLink(requestNonce)
    });
  };

  // Telegram posts bot updates here (public, authenticated by the webhook secret header).
  // "/start <nonce>" links the sender's Telegram account to the Hateable account. Every Telegram
  // account sits on its own phone number, so one Telegram account per Hateable account gives
  // the same one-number-per-account rule without asking for the number (and Telegram's warning).
  telegramWebhook = async (req: Request, res: Response) => {
    const given = Buffer.from(String(req.headers['x-telegram-bot-api-secret-token'] || ''));
    const expected = Buffer.from(env.TELEGRAM_WEBHOOK_SECRET || '');
    if (!expected.length || given.length !== expected.length || !timingSafeEqual(given, expected)) {
      throw new Unauthorized('Bad webhook secret');
    }
    Ok(res, 'Received'); // acknowledge first so Telegram doesn't redeliver while we reply

    type TelegramMessage = {
      chat: { id: number; type: string };
      from?: { id: number; is_bot?: boolean };
      text?: string;
    };
    const message = (req.body as { message?: TelegramMessage })?.message;
    if (!message?.from || message.from.is_bot || message.chat.type !== 'private') return;
    const chatId = message.chat.id;

    try {
      const nonce = message.text?.match(/^\/start ([A-Za-z0-9_-]{8,64})$/)?.[1];
      if (!nonce) {
        return await sendTelegramMessage(
          chatId,
          'Open the "Verify with Telegram" link on Hateable to verify your account.'
        );
      }

      const request = await this.tokenDao.findTokenByValue(nonce);
      if (!request || request.type !== 'telegram' || request.status !== 'pending') {
        return await sendTelegramMessage(
          chatId,
          'This link has expired. Go back to Hateable and start again.'
        );
      }
      try {
        await this.userDao.setVerifiedTelegram(request.email!, String(message.from.id));
        request.status = 'verified';
      } catch (error) {
        if (!(error instanceof Conflict)) throw error;
        request.status = 'conflict';
      }
      await request.save();
      await sendTelegramMessage(
        chatId,
        request.status === 'verified'
          ? 'Verified! You can go back to Hateable now.'
          : 'This Telegram account is already linked to another Hateable account.'
      );
    } catch (error) {
      logger.error({ err: error }, 'Telegram webhook processing failed');
    }
  };

  // start Truecaller phone verification: returns the deep link plus the nonce to poll with
  truecallerStart = async (req: AuthenticatedRequest, res: Response) => {
    if (!env.TRUECALLER_APP_KEY) {
      throw new BadRequest('Phone verification with Truecaller is not configured');
    }

    const requestNonce = await this.startPhoneRequest(req.user?.email, 'truecaller');
    return Created(res, 'Truecaller verification started', {
      requestNonce,
      deepLink: buildTruecallerDeepLink(requestNonce)
    });
  };

  // Truecaller posts here (public): { requestId, status } or { requestId, accessToken, endpoint }.
  // Truecaller expects a 2xx within 3s, so acknowledge first and fetch the profile after;
  // the outcome is stored on the request for the status poll.
  truecallerCallback = async (req: Request, res: Response) => {
    const { requestId, status, accessToken, endpoint } = (req.body || {}) as Record<string, string>;
    Ok(res, 'Received');

    try {
      const request = requestId ? await this.tokenDao.findTokenByValue(String(requestId)) : null;
      if (!request || request.type !== 'truecaller' || request.status !== 'pending') return;

      if (accessToken && endpoint) {
        try {
          const phone = await fetchTruecallerPhone(String(endpoint), String(accessToken));
          await this.userDao.setVerifiedPhone(request.email!, phone);
          request.status = 'verified';
        } catch (error) {
          request.status = error instanceof Conflict ? 'conflict' : 'failed';
          logger.warn({ err: error }, 'Truecaller verification did not complete');
        }
      } else if (status === 'user_rejected') {
        request.status = 'rejected';
      } else {
        return; // "flow_invoked" handshake: the 2xx above is all Truecaller needs
      }
      await request.save();
    } catch (error) {
      logger.error({ err: error }, 'Truecaller callback processing failed');
    }
  };

  // frontend polls this (Telegram or Truecaller request) until it settles; 409 when the number
  // belongs to another account
  phoneStatus = async (req: AuthenticatedRequest, res: Response) => {
    const request = await this.tokenDao.findTokenByValue(String(req.params.nonce));
    if (
      !request ||
      !['telegram', 'truecaller'].includes(request.type) ||
      request.email !== req.user?.email
    ) {
      throw new NotFound('Verification request not found or expired');
    }
    if (request.status === 'pending') {
      return Ok(res, 'Waiting for verification', { status: 'pending' });
    }

    await this.tokenDao.deleteTokenByValue(request.value);
    if (request.status === 'conflict') {
      throw new Conflict(
        request.type === 'telegram'
          ? 'This Telegram account is already linked to another Hateable account'
          : 'This phone number is already linked to another account'
      );
    }
    if (request.status !== 'verified') {
      throw new BadRequest(
        request.status === 'rejected'
          ? 'Verification was cancelled'
          : 'Verification failed, please try again'
      );
    }

    const user = await this.userDao.findUserByEmail(request.email!);
    return Ok(res, 'Phone number verified', {
      status: 'verified',
      user: sanitizeUser(user?.toObject())
    });
  };

  // refresh access token
  refresh = async (req: SessionRequest, res: Response) => {
    // getting the session and refresh token from the request
    const { session, refreshToken } = req;

    // checking if the session and refresh token are present
    if (!session || !refreshToken) {
      throw new Unauthorized('Session expired or invalid');
    }

    // getting the session id from the decoded session
    const sessionId = (session as unknown as Record<string, unknown>).sessionId as string;

    // finding the session in the database
    const dbSession = await this.sessionDao.findSessionByRefreshTokenandSessionId(
      refreshToken,
      sessionId
    );

    // checking if the session exists
    if (!dbSession) {
      throw new Unauthorized('Session expired or invalid');
    }

    // getting the user from the session
    const dbUserId = String((dbSession as unknown as Record<string, unknown>).userId || '');
    const user = await this.userDao.findUserById(dbUserId);

    // checking if the user exists
    if (!user) {
      throw new Unauthorized('Session expired or invalid');
    }

    // creating session and tokens
    const { sanitizedUser, accessToken } = await createSession(user, res);

    // deleting the old session
    await this.sessionDao.deleteSessionByRefreshTokenandSessionId(refreshToken, sessionId);

    // returning the refreshed tokens
    return Ok(res, 'Token refreshed successfully', {
      user: sanitizedUser,
      accessToken: accessToken
    });
  };

  // logout user
  logout = async (req: SessionRequest, res: Response) => {
    // getting the session and refresh token from the request
    const { session, refreshToken } = req;

    // deleting the session if present
    if (refreshToken && session) {
      await this.sessionDao.deleteSessionByRefreshTokenandSessionId(
        refreshToken,
        session.sessionId
      );
    }

    // clearing the refresh token cookie
    res.clearCookie('refreshToken');

    // returning success response
    return Ok(res, 'Logged out successfully');
  };

  // logout user from all active sessions
  logoutAll = async (req: AuthenticatedRequest, res: Response) => {
    // getting the user id from the request
    const userId = (req.user?._id || req.user?.userId) as string;

    // deleting all sessions for the user
    await this.sessionDao.deleteSessionByUserId(userId);

    // clearing the refresh token cookie
    res.clearCookie('refreshToken');

    // returning success response
    return Ok(res, 'Logged out from all sessions successfully');
  };

  // login via google credential token
  googleLogin = async (req: GoogleLoginRequest, res: Response) => {
    // getting the credential from the request body
    const { credential } = req.body;

    // verifying the Google credential token
    const googleUser = await verifyGoogleToken(credential);

    // finding the user by email
    let user = await this.userDao.findUserByEmail(googleUser.email);

    if (user) {
      // checking if the user already has google provider
      if (!user.providers.includes('google')) {
        // adding google to the providers list and setting googleId
        user = await this.userDao.updateUserById(user._id.toString(), {
          $addToSet: { providers: 'google' },
          googleId: googleUser.googleId
        });
      }
    } else {
      // creating a new user with google provider
      user = await this.userDao.createUser({
        name: googleUser.name,
        email: googleUser.email,
        providers: ['google'],
        googleId: googleUser.googleId,
        isVerified: true
      });
    }

    // creating session and tokens
    const { sanitizedUser, accessToken } = await createSession(user!, res);

    // returning the google logged in user with access token
    return Ok(res, 'User Logged in Successfully via Google', {
      user: sanitizedUser,
      accessToken: accessToken
    });
  };

  // redirect user to google oauth authorization page
  googleRedirect = (req: Request, res: Response) => {
    const state = generateResetPasswordToken(32);

    // setting the google oauth state cookie
    res.cookie('googleOAuthState', state, {
      httpOnly: true,
      secure: env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 10 * 60 * 1000
    });

    // capturing client origin from referer or query
    let clientOrigin = env.FRONTEND_URL;
    if (req.headers.referer) {
      try {
        clientOrigin = new URL(req.headers.referer).origin;
      } catch (err) {
        // ignore invalid URL referers
      }
    }

    // setting the google oauth origin cookie
    res.cookie('googleOAuthOrigin', clientOrigin, {
      httpOnly: true,
      secure: env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 10 * 60 * 1000
    });

    // returning the redirect to google authorization url
    return res.redirect(getGoogleAuthorizationUrl(state));
  };

  // handle google oauth callback
  googleCallback = async (req: Request, res: Response) => {
    const { code, state, error } = req.query;
    const cookies = req.cookies as Record<string, string>;
    const clientOrigin = cookies?.googleOAuthOrigin || env.FRONTEND_URL;
    const redirectToLogin = `${clientOrigin}/login?googleError=1`;

    // redirecting to login if state is invalid or error
    const isStateValid = state && state === cookies?.googleOAuthState;
    if (error || !code || !state || (!isStateValid && env.NODE_ENV === 'production')) {
      res.clearCookie('googleOAuthState');
      res.clearCookie('googleOAuthOrigin');
      return res.redirect(redirectToLogin);
    }

    res.clearCookie('googleOAuthState');
    res.clearCookie('googleOAuthOrigin');

    // fetching the google user using the authorization code
    const googleUser = await getGoogleUserFromCode(code as string);
    let user = await this.userDao.findUserByEmail(googleUser.email);

    if (user && !user.providers.includes('google')) {
      // adding google provider to existing user
      user = await this.userDao.updateUserById(user._id.toString(), {
        $addToSet: { providers: 'google' },
        googleId: googleUser.googleId,
        isVerified: true
      });
    } else if (!user) {
      // creating a new user from google profile
      user = await this.userDao.createUser({
        name: googleUser.name,
        email: googleUser.email,
        providers: ['google'],
        googleId: googleUser.googleId,
        isVerified: true
      });
    }

    // creating session for the authenticated user
    await createSession(user!, res);

    // returning redirect to dashboard
    return res.redirect(`${clientOrigin}/dashboard`);
  };

  // send password reset email
  forgotPassword = async (req: ForgotPasswordRequest, res: Response) => {
    // getting the email from the request body
    const { email } = req.body;

    // deleting any existing reset token for this email
    await this.tokenDao.deleteTokenByEmail(email, 'reset');

    // generating the new reset token
    const resetToken = generateResetPasswordToken();

    // setting the reset token in the database
    await this.tokenDao.createToken({
      email: email,
      type: 'reset',
      value: resetToken,
      expiresAt: new Date(Date.now() + RESET_PASSWORD_TOKEN_EXPIRY_TIME)
    });

    // sending the reset password token as a magic link to the email
    sendMail(
      email,
      'Your reset Password Link',
      `Click the link and reset your password <a href="${env.FRONTEND_URL}/reset-password/${resetToken}">Reset Your Password</a>`
    );

    // returning success response
    return Ok(res, 'Reset password Mail sent Successfully');
  };

  // reset password using token
  resetPassword = async (req: ResetPasswordRequest, res: Response) => {
    // getting the token from the request body
    const { token, password } = req.body;

    // finding the reset token in the database
    const resetToken = await this.tokenDao.findTokenByValue(token);

    if (!resetToken) {
      throw new NotFound('Reset token not found.');
    }

    // finding the user from the email
    const tokenEmail = (resetToken as unknown as { email: string }).email;
    const user = await this.userDao.findUserByEmail(tokenEmail);

    // setting the new password
    const userDoc = user as unknown as { password?: string; save(): Promise<unknown> };
    userDoc.password = password;

    // saving the user with the new password
    await userDoc.save();

    // deleting the token after successful reset
    await this.tokenDao.deleteTokenByValue(token);

    // returning success response
    return Ok(res, 'Password reset Successfully');
  };
}

export default AuthController;
