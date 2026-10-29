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
  KEY_ENC_SECRET: z.string().default(envConstants.KEY_ENC_SECRET),
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
    .transform((v) => v === 'true'),
  // Playwright MCP server (k8s/playwright-mcp-*.yml), empty -> agents skip the browser check
  PLAYWRIGHT_MCP_URL: z.string().default(envConstants.PLAYWRIGHT_MCP_URL),
  // how many times the agents may fix problems the browser check found before giving up
  MAX_BROWSER_FIX_ROUNDS: z.coerce.number().default(envConstants.MAX_BROWSER_FIX_ROUNDS),
  // stock photos the agents can drop into a site (unsplash.com/developers), empty -> placeholders
  UNSPLASH_ACCESS_KEY: z.string().default(envConstants.UNSPLASH_ACCESS_KEY),
  // image generation through Replicate's MCP server, empty -> generated images fall back to photos
  REPLICATE_API_TOKEN: z.string().default(envConstants.REPLICATE_API_TOKEN),
  IMAGE_MODEL: z.string().default(envConstants.IMAGE_MODEL), // owner/name of a Replicate model
  MAX_IMAGES_PER_RUN: z.coerce.number().default(envConstants.MAX_IMAGES_PER_RUN),
  // in-cluster projectService, for deployment logs/analytics and the GitHub pull before each run
  PROJECT_SERVICE_URL: z.string().default(envConstants.PROJECT_SERVICE_URL)
});

const parsedEnv = envSchema.safeParse(process.env);

if (!parsedEnv.success) {
  console.error('Invalid environment variables:', parsedEnv.error.format());
  process.exit(1);
}

const env = parsedEnv.data;

export default env;
