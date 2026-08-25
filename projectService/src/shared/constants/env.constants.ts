const envConstants = {
    PORT: 5001,
    NODE_ENV: 'development',
    MONGO_URI: 'mongodb://localhost:27017/projectService',
    CORS_ORIGIN: '*',
} as const;

export default envConstants;
