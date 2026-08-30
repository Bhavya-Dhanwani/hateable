// Importing modules
import { getRedisClient } from "../config/redis.config.js";
import MessageDao from "../dao/message.dao.js";
import logger from "../config/logger.config.js";

const messageDao = new MessageDao();

// cached message interface
export interface CachedMessage {
	role: "user" | "assistant" | "system" | "tool";
	content?: string;
	toolCalls?: Array<{
		id: string;
		type: string;
		name: string;
		args: Record<string, unknown>;
	}>;
	toolCallId?: string;
	name?: string;
	tokensUsed?: {
		promptTokens: number;
		completionTokens: number;
		totalTokens: number;
	};
	createdAt?: string;
}

// metadata cache interfaces
export interface CachedProject {
	projectId: string;
	podName?: string;
	serviceName?: string;
	userId?: string;
}

export interface CachedConversation {
	conversationId: string;
	projectId: string;
	userId: string;
	title: string;
}

const HISTORY_TTL = 86400; // 24 hours

// retrieve conversation messages history
export async function getConversationHistory(conversationId: string): Promise<CachedMessage[]> {

	const redis = getRedisClient();
	const listKey = `conversation:${conversationId}:messages`;

	try {

		// try to read from redis cache
		const cached = await redis.lrange(listKey, 0, -1);

		if (cached && cached.length > 0) {
			logger.info(`Loaded conversation history from Redis cache for conversationId: ${conversationId}`);
			return cached.map((item) => JSON.parse(item) as CachedMessage);
		}

		// cache miss, query mongodb
		logger.info(`Redis cache miss, loading conversation history from MongoDB for conversationId: ${conversationId}`);
		const dbMessages = await messageDao.findMessagesByConversationId(conversationId);

		const mappedMessages: CachedMessage[] = dbMessages.map((msg) => ({
			role: msg.role,
			content: msg.content,
			toolCalls: msg.toolCalls,
			toolCallId: msg.toolCallId,
			name: msg.name,
			tokensUsed: msg.tokensUsed,
			createdAt: msg.createdAt.toISOString(),
		}));

		// cache the loaded messages in redis with a ttl
		if (mappedMessages.length > 0) {

			const pipeline = redis.pipeline();

			for (const msg of mappedMessages) {
				pipeline.rpush(listKey, JSON.stringify(msg));
			}

			pipeline.expire(listKey, HISTORY_TTL);
			await pipeline.exec();

		}

		return mappedMessages;

	} catch (error) {

		logger.error(error, `Failed to retrieve conversation history for conversationId: ${conversationId}`);
		throw error;

	}

}

// add message to redis cache
export async function addMessageToCache(conversationId: string, message: CachedMessage): Promise<void> {

	const redis = getRedisClient();
	const listKey = `conversation:${conversationId}:messages`;
	const dirtyKey = `conversation:${conversationId}:dirty`;

	// ensure createdAt timestamp is populated
	if (!message.createdAt) {
		message.createdAt = new Date().toISOString();
	}

	const messageJson = JSON.stringify(message);

	try {

		const pipeline = redis.pipeline();

		pipeline.rpush(listKey, messageJson);
		pipeline.rpush(dirtyKey, messageJson);
		pipeline.expire(listKey, HISTORY_TTL);

		await pipeline.exec();

		logger.debug(`Saved message to Redis cache and dirty list for conversationId: ${conversationId}`);

	} catch (error) {

		logger.error(error, `Failed to add message to Redis cache for conversationId: ${conversationId}`);
		throw error;

	}

}

// flush unsaved messages to mongodb
export async function flushConversationToDB(conversationId: string): Promise<void> {

	const redis = getRedisClient();
	const dirtyKey = `conversation:${conversationId}:dirty`;

	try {

		// retrieve all dirty messages and delete the dirty list atomically in redis
		const execResult = await redis
			.multi()
			.lrange(dirtyKey, 0, -1)
			.del(dirtyKey)
			.exec();

		if (!execResult) {
			return;
		}

		const [lrangeErr, lrangeResult] = execResult[0] as [Error | null, string[]];
		
		if (lrangeErr) {
			throw lrangeErr;
		}

		const dirtyMessagesJson = lrangeResult || [];

		if (dirtyMessagesJson.length === 0) {
			logger.debug(`No dirty messages found in Redis to flush to MongoDB for conversationId: ${conversationId}`);
			return;
		}

		const dirtyMessages = dirtyMessagesJson.map((item) => JSON.parse(item) as CachedMessage);
		
		logger.info(`Flushing ${dirtyMessages.length} messages from Redis to MongoDB for conversationId: ${conversationId}`);

		const messageDocs = dirtyMessages.map((msg) => ({
			conversationId,
			role: msg.role,
			content: msg.content,
			toolCalls: msg.toolCalls,
			toolCallId: msg.toolCallId,
			name: msg.name,
			tokensUsed: msg.tokensUsed,
			createdAt: msg.createdAt ? new Date(msg.createdAt) : new Date(),
		}));

		await messageDao.insertMessages(messageDocs);

		logger.info(`Successfully flushed ${dirtyMessages.length} messages to MongoDB for conversationId: ${conversationId}`);

	} catch (error) {

		logger.error(error, `Error flushing conversation messages to MongoDB for conversationId: ${conversationId}`);
		throw error;

	}

}

// get project metadata from redis cache
export async function getCachedProject(projectId: string): Promise<CachedProject | null> {

	const redis = getRedisClient();
	const key = `project:${projectId}:metadata`;

	try {

		const cached = await redis.get(key);

		if (cached) {
			logger.info(`Loaded project metadata from Redis cache for projectId: ${projectId}`);
			return JSON.parse(cached) as CachedProject;
		}

		return null;

	} catch (error) {

		logger.error(error, `Failed to retrieve project metadata from Redis for projectId: ${projectId}`);
		return null;

	}

}

// cache project metadata in redis
export async function cacheProject(project: CachedProject): Promise<void> {

	const redis = getRedisClient();
	const key = `project:${project.projectId}:metadata`;

	try {

		await redis.set(key, JSON.stringify(project), "EX", HISTORY_TTL);
		logger.debug(`Cached project metadata in Redis for projectId: ${project.projectId}`);

	} catch (error) {

		logger.error(error, `Failed to cache project metadata in Redis for projectId: ${project.projectId}`);

	}

}

// get conversation metadata from redis cache
export async function getCachedConversation(conversationId: string): Promise<CachedConversation | null> {

	const redis = getRedisClient();
	const key = `conversation:${conversationId}:metadata`;

	try {

		const cached = await redis.get(key);

		if (cached) {
			logger.info(`Loaded conversation metadata from Redis cache for conversationId: ${conversationId}`);
			return JSON.parse(cached) as CachedConversation;
		}

		return null;

	} catch (error) {

		logger.error(error, `Failed to retrieve conversation metadata from Redis for conversationId: ${conversationId}`);
		return null;

	}

}

// cache conversation metadata in redis
export async function cacheConversation(convo: CachedConversation): Promise<void> {

	const redis = getRedisClient();
	const key = `conversation:${convo.conversationId}:metadata`;

	try {

		await redis.set(key, JSON.stringify(convo), "EX", HISTORY_TTL);
		logger.debug(`Cached conversation metadata in Redis for conversationId: ${convo.conversationId}`);

	} catch (error) {

		logger.error(error, `Failed to cache conversation metadata in Redis for conversationId: ${convo.conversationId}`);

	}

}
