const envConstants = {
    PORT: 3000,
    NODE_ENV: 'development',
    MONGO_URI: 'mongodb://localhost:27017/projectService',
    CORS_ORIGIN: '*',
    BROKER_URL: 'amqp://localhost:5672',
    ACCESS_TOKEN_SECRET: 'super_secret_access_jwt_key_change_in_production',
} as const;

export default envConstants;
