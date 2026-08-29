import amqplib from "amqplib";
import logger from "../config/logger.config.js";
import env from "../config/env.config.js";
import ApiError from "../utils/ApiError.util.js";

let channel: amqplib.Channel | null = null;

export async function connectToBroker() {
    const connection = await amqplib.connect(env.BROKER_URL);

    channel = await connection.createChannel();

    logger.info("Connected to Message broker");
}

export async function publishMessage(queue: string, message: string) {

    if (!channel) {
        throw new ApiError(400, "Channel is not initialized. Call connectToBroker first.");
    }

    await channel.assertQueue(queue, { durable: true });
    channel.sendToQueue(queue, Buffer.from(message), { persistent: true });

}