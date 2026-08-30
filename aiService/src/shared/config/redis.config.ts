// Importing modules
import { Redis } from "ioredis";
import env from "./env.config.js";
import logger from "./logger.config.js";

let redis: Redis;

// function to get or initialize the redis client
function getRedisClient(): Redis {

	if (!redis) {

		redis = new Redis({
			host: env.REDIS_HOST,
			port: env.REDIS_PORT,
			maxRetriesPerRequest: null, // essential for langchain memory and queue processors
		});

		redis.on("connect", () => {
			logger.info("Connected to Redis server successfully");
		});

		redis.on("error", (error) => {
			logger.error(error, "Redis connection error");
		});

	}

	return redis;

}

export { getRedisClient };
