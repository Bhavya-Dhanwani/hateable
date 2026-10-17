// Importing modules
import { config } from 'dotenv';
import z from 'zod';
import envConstants from '../constants/env.constants.js';

// loading environment variables
config();

// defining the schema for environment variables
const envSchema = z.object({
  PORT: z.coerce.number().default(envConstants.PORT),
  NODE_ENV: z.enum(['development', 'production', 'test']).default(envConstants.NODE_ENV),
  MONGO_URI: z.string().default(envConstants.MONGO_URI),
  CORS_ORIGIN: z.string().default(envConstants.CORS_ORIGIN),
  BROKER_URL: z.string().default(envConstants.BROKER_URL),
  ACCESS_TOKEN_SECRET: z.string().default(envConstants.ACCESS_TOKEN_SECRET),

  // the hateable frontend, linked from the deployment pages
  APP_URL: z.string().default(envConstants.APP_URL),

  // deployments are served at <slug>.<DEPLOY_DOMAIN>
  DEPLOY_DOMAIN: z.string().default(envConstants.DEPLOY_DOMAIN),
  DEPLOY_PROTOCOL: z.enum(['http', 'https']).default(envConstants.DEPLOY_PROTOCOL),

  // public IP of the ingress, shown as the A record for bare custom domains (shop.com)
  DEPLOY_INGRESS_IP: z.string().default(envConstants.DEPLOY_INGRESS_IP),

  // how long a deployment may go without a visitor before it is put to sleep
  DEPLOY_IDLE_TTL_MS: z.coerce.number().default(envConstants.DEPLOY_IDLE_TTL_MS),

  // object storage holding the project files and the deployment snapshots
  S3_ENDPOINT: z.string().default(envConstants.S3_ENDPOINT),
  S3_BUCKET_NAME: z.string().default(envConstants.S3_BUCKET_NAME),
  AWS_REGION: z.string().default(envConstants.AWS_REGION),
  AWS_ACCESS_KEY_ID: z.string().default(''),
  AWS_SECRET_ACCESS_KEY: z.string().default(''),

  // GitHub OAuth App (github.com/settings/developers), callback: <APP_URL>/api/projects/github/callback
  GITHUB_CLIENT_ID: z.string().default(envConstants.GITHUB_CLIENT_ID),
  GITHUB_CLIENT_SECRET: z.string().default(envConstants.GITHUB_CLIENT_SECRET),

  // encrypts stored third-party tokens (GitHub) at rest
  TOKEN_ENCRYPTION_KEY: z.string().default(envConstants.TOKEN_ENCRYPTION_KEY)
});

// parsing and validating environment variables
const parsedEnv = envSchema.safeParse(process.env);

if (!parsedEnv.success) {
  console.error('Invalid environment variables:', parsedEnv.error.format());
  process.exit(1);
}

// getting the validated environment variables
const env = parsedEnv.data;

export default env;
