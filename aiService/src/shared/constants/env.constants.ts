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
  AGENT_SYSTEM_V2: 'false'
} as const;

export default envConstants;
