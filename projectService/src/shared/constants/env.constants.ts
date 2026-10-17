const envConstants = {
  PORT: 3000,
  NODE_ENV: 'development',
  MONGO_URI: 'mongodb://localhost:27017/projectService',
  CORS_ORIGIN: '*',
  BROKER_URL: 'amqp://localhost:5672',
  ACCESS_TOKEN_SECRET: 'super_secret_access_jwt_key_change_in_production',
  APP_URL: 'http://localhost:5173',
  DEPLOY_DOMAIN: 'hateable.localhost',
  DEPLOY_PROTOCOL: 'http',
  DEPLOY_IDLE_TTL_MS: 15 * 60 * 1000,
  S3_ENDPOINT: 'http://s3-service:9000',
  S3_BUCKET_NAME: 'hateable-bucket',
  AWS_REGION: 'us-east-1',
  GITHUB_CLIENT_ID: '',
  GITHUB_CLIENT_SECRET: '',
  TOKEN_ENCRYPTION_KEY: 'dev_only_token_encryption_key_change_in_production'
} as const;

export default envConstants;
