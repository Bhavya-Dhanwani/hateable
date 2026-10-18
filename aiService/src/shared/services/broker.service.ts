import amqplib from 'amqplib';
import logger from '../config/logger.config.js';
import env from '../config/env.config.js';
import ApiError from '../utils/ApiError.util.js';
import ProjectDao from '../dao/project.dao.js';
import { getRedisClient } from '../config/redis.config.js';

let channel: amqplib.Channel | null = null;
const projectDao = new ProjectDao();

export async function connectToBroker() {
  try {
    const connection = await amqplib.connect(env.BROKER_URL);
    channel = await connection.createChannel();
    logger.info('Connected to Message broker');
  } catch (error) {
    logger.error(error, 'Error connecting to Message broker');
    throw error;
  }
}

export async function startProjectConsumer() {
  if (!channel) {
    throw new ApiError(500, 'Broker channel is not initialized. Call connectToBroker first.');
  }

  const activeChannel = channel;
  const queueName = 'project.created';

  // Ensure the queue exists
  await activeChannel.assertQueue(queueName, { durable: true });

  logger.info(`Starting consumer for queue: ${queueName}`);

  activeChannel.consume(queueName, async (msg) => {
    if (!msg) {
      logger.warn('Received empty message from queue');
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

    const { projectId, podName, serviceName, userId, workspaceId } = payload;
    if (!projectId) {
      logger.error("Message missing required field 'projectId'");
      // Acknowledge and discard invalid message payloads
      activeChannel.ack(msg);
      return;
    }

    try {
      // Store or update the project in the database
      const project = await projectDao.upsertProject(projectId, {
        podName,
        serviceName,
        userId,
        workspaceId
      });

      logger.info(
        `Successfully stored project in db: ${project ? project._id : 'upserted'} (projectId: ${projectId})`
      );

      // Cache the project metadata in Redis for fast access
      try {
        const redis = getRedisClient();
        const key = `project:${projectId}:metadata`;
        await redis.set(
          key,
          JSON.stringify({ projectId, podName, serviceName, userId, workspaceId }),
          'EX',
          86400
        );
        logger.info(`Cached project metadata in Redis for projectId: ${projectId}`);
      } catch (redisCacheError) {
        logger.error(
          redisCacheError,
          `Failed to cache project in Redis for projectId: ${projectId}`
        );
      }

      // Delete the message from the broker by acknowledging it
      activeChannel.ack(msg);
    } catch (dbError) {
      logger.error(
        dbError,
        `Database error processing message from queue ${queueName}. Re-queuing message.`
      );
      // Negative acknowledgement (nack) and requeue so it will be retried later
      activeChannel.nack(msg, false, true);
    }
  });
}
