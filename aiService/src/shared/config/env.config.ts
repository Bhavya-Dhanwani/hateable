import { config } from 'dotenv';
import z from 'zod';
import envConstants from '../constants/env.constants.js';

config();

const envSchema = z.object({
  PORT: z.coerce.number().default(envConstants.PORT),
  NODE_ENV: z.enum(['development', 'production', 'test']).default(envConstants.NODE_ENV),
  MONGO_URI: z.string().default(envConstants.MONGO_URI),
  CORS_ORIGIN: z.string().default(envConstants.CORS_ORIGIN),
  BROKER_URL: z.string().default(envConstants.BROKER_URL),
  ACCESS_TOKEN_SECRET: z.string().default(envConstants.ACCESS_TOKEN_SECRET),
  REDIS_HOST: z.string().default(envConstants.REDIS_HOST),
  REDIS_PORT: z.coerce.number().default(envConstants.REDIS_PORT),
  MISTRAL_API_KEY: z.string().default(envConstants.MISTRAL_API_KEY),
  // comma/newline separated pool, any size; MISTRAL_API_KEY is added to it
  MISTRAL_API_KEYS: z.string().default(envConstants.MISTRAL_API_KEYS),
  MISTRAL_MODEL: z.string().default(envConstants.MISTRAL_MODEL),
  PER_KEY_CONCURRENCY: z.coerce.number().default(envConstants.PER_KEY_CONCURRENCY),
  MIN_SCORE: z.coerce.number().default(envConstants.MIN_SCORE),
  MAX_REVIEW_ROUNDS: z.coerce.number().default(envConstants.MAX_REVIEW_ROUNDS),
  MAX_DEPTH: z.coerce.number().default(envConstants.MAX_DEPTH),
  MAX_AGENTS: z.coerce.number().default(envConstants.MAX_AGENTS),
  // "true" -> chat goes through the multi-agent system, else the single tool-calling agent
  AGENT_SYSTEM_V2: z
    .enum(['true', 'false'])
    .default(envConstants.AGENT_SYSTEM_V2)
    .transform((v) => v === 'true')
});

const parsedEnv = envSchema.safeParse(process.env);

if (!parsedEnv.success) {
  console.error('Invalid environment variables:', parsedEnv.error.format());
  process.exit(1);
}

const env = parsedEnv.data;

export default env;
