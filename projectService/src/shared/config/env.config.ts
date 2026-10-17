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

  // how long a deployment may go without a visitor before it is put to sleep
  DEPLOY_IDLE_TTL_MS: z.coerce.number().default(envConstants.DEPLOY_IDLE_TTL_MS),

  // object storage holding the project files and the deployment snapshots
  S3_ENDPOINT: z.string().default(envConstants.S3_ENDPOINT),
  S3_BUCKET_NAME: z.string().default(envConstants.S3_BUCKET_NAME),
  AWS_REGION: z.string().default(envConstants.AWS_REGION),
  AWS_ACCESS_KEY_ID: z.string().default(''),
  AWS_SECRET_ACCESS_KEY: z.string().default('')
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
