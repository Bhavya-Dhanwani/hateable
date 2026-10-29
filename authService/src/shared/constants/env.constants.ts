const envConstants = {
  PORT: 5000,
  NODE_ENV: 'development',
  MONGO_URI: 'mongodb://localhost:27017/authService',
  CORS_ORIGIN: '*',
  ACCESS_TOKEN_SECRET: 'super_secret_access_jwt_key_change_in_production',
  REFRESH_TOKEN_SECRET: 'super_secret_refresh_jwt_key_change_in_production',
  SMTP_HOST: 'smtp.gmail.com',
  SMTP_PORT: 587,
  SMTP_USER: '',
  SMTP_PASS: '',
  SENDING_USER: 'authService <noreply@example.com>',
  SEND_MAIL: false,
  GOOGLE_CLIENT_ID: '',
  GOOGLE_CLIENT_SECRET: '',
  GOOGLE_REDIRECT_URI: 'http://localhost:5000/api/v1/auth/google/callback',
  FRONTEND_URL: 'http://localhost:3000',
  // when true: every logged-in user is treated as free, and the subscription + payment UI is hidden
  FREE_MODE: false,
  // payee VPA for manual UPI payments (e.g. name@bank); empty disables the payment flow
  UPI_ID: '',
  UPI_PAYEE_NAME: 'Hateable'
} as const;

export default envConstants;
