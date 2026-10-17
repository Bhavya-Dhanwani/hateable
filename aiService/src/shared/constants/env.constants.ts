const envConstants = {
  PORT: 5000,
  NODE_ENV: 'development',
  MONGO_URI: 'mongodb://localhost:27017/aiService',
  CORS_ORIGIN: '*',
  BROKER_URL: 'amqp://localhost:5672',
  ACCESS_TOKEN_SECRET: 'super_secret_access_jwt_key_change_in_production',
  REDIS_HOST: 'localhost',
  REDIS_PORT: 6379,
  MISTRAL_API_KEY: '',
  MISTRAL_API_KEYS: '',
  MISTRAL_MODEL: 'mistral-large-latest',
  PER_KEY_CONCURRENCY: 2,
  MIN_SCORE: 9,
  MAX_REVIEW_ROUNDS: 4,
  MAX_DEPTH: 4,
  MAX_AGENTS: 200,
  AGENT_SYSTEM_V2: 'false',
  PLAYWRIGHT_MCP_URL: '',
  MAX_BROWSER_FIX_ROUNDS: 1,
  UNSPLASH_ACCESS_KEY: '',
  REPLICATE_API_TOKEN: '',
  IMAGE_MODEL: 'black-forest-labs/flux-schnell',
  MAX_IMAGES_PER_RUN: 8,
  PROJECT_SERVICE_URL: 'http://project-service'
} as const;

export default envConstants;
