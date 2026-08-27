import { Redis } from "ioredis";
import logger from "../config/logger.config.js";

const redisURL = process.env.REDIS_URL || "redis://localhost:6379";

export const redis = new Redis(redisURL);

export  const redisSubscriber= new Redis(redisURL);

redis.on("error", err => logger.error({err}, "[redis] Client err"));
redisSubscriber.on("error", err => logger.error({err}, "[redis] Subscriber err"));

redis.once("connect", () => logger.info("[redis] Client connected"));
redisSubscriber.once("connect", () => logger.info("[redis] Subscriber connected"));