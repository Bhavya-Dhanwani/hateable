import amqplib from "amqplib";
import logger from "../config/logger.config.js";
import env from "../config/env.config.js";
import ApiError from "../utils/ApiError.util.js";
import Project from "../models/project.model.js";

let channel: amqplib.Channel | null = null;

export async function connectToBroker() {
    try {
        const connection = await amqplib.connect(env.BROKER_URL);
        channel = await connection.createChannel();
        logger.info("Connected to Message broker");
    } catch (error) {
        logger.error(error, "Error connecting to Message broker");
        throw error;
    }
}

export async function startProjectConsumer() {
    if (!channel) {
        throw new ApiError(500, "Broker channel is not initialized. Call connectToBroker first.");
    }

    const activeChannel = channel;
    const queueName = "project.created";

    // Ensure the queue exists
    await activeChannel.assertQueue(queueName, { durable: true });

    logger.info(`Starting consumer for queue: ${queueName}`);

    activeChannel.consume(queueName, async (msg) => {
        if (!msg) {
            logger.warn("Received empty message from queue");
            return;
        }

        let payload;
        try {
            const contentString = msg.content.toString();
            logger.info(`Received message from ${queueName}: ${contentString}`);
            payload = JSON.parse(contentString);
        } catch (parseError) {
            logger.error(parseError, `Failed to parse message JSON payload from queue ${queueName}`);
            // Acknowledge and discard malformed messages since retrying won't fix parsing issues
            activeChannel.ack(msg);
            return;
        }

        const { projectId, podName, serviceName, userId } = payload;
        if (!projectId) {
            logger.error("Message missing required field 'projectId'");
            // Acknowledge and discard invalid message payloads
            activeChannel.ack(msg);
            return;
        }

        try {
            // Store or update the project in the database
            const project = await Project.findOneAndUpdate(
                { projectId },
                { podName, serviceName, userId },
                { upsert: true, new: true }
            );

            logger.info(`Successfully stored project in db: ${project._id} (projectId: ${projectId})`);
            
            // Delete the message from the broker by acknowledging it
            activeChannel.ack(msg);
        } catch (dbError) {
            logger.error(dbError, `Database error processing message from queue ${queueName}. Re-queuing message.`);
            // Negative acknowledgement (nack) and requeue so it will be retried later
            activeChannel.nack(msg, false, true);
        }
    });
}
