import { config } from "dotenv";
import z from "zod";
import envConstants from "../constants/env.constants.js";

config();

const envSchema = z.object({
    PORT: z.coerce.number().default(envConstants.PORT),
    NODE_ENV: z.enum(["development", "production", "test"]).default(envConstants.NODE_ENV),
    MONGO_URI: z.string().default(envConstants.MONGO_URI),
    CORS_ORIGIN: z.string().default(envConstants.CORS_ORIGIN),
    BROKER_URL: z.string().default(envConstants.BROKER_URL),
    ACCESS_TOKEN_SECRET: z.string().default(envConstants.ACCESS_TOKEN_SECRET),
    REDIS_HOST: z.string().default(envConstants.REDIS_HOST),
    REDIS_PORT: z.coerce.number().default(envConstants.REDIS_PORT),
    MISTRAL_API_KEY: z.string().default(envConstants.MISTRAL_API_KEY),
});

const parsedEnv = envSchema.safeParse(process.env);

if (!parsedEnv.success) {
    console.error("Invalid environment variables:", parsedEnv.error.format());
    process.exit(1);
}

const env = parsedEnv.data;

export default env;
