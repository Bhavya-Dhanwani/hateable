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
} as const;

export default envConstants;
