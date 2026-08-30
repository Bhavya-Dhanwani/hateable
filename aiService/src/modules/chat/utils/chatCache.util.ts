// Importing modules
import { addMessageToCache, CachedMessage } from "../../../shared/services/redis.service.js";

// function to save a user message in redis cache
export async function saveUserMessage(conversationId: string, content: string): Promise<void> {

	const userCachedMessage: CachedMessage = {
		role: "user",
		content,
		createdAt: new Date().toISOString(),
	};

	await addMessageToCache(conversationId, userCachedMessage);

}

// function to save an assistant response message in redis cache
export async function saveAssistantMessage(
	conversationId: string,
	content: string,
	promptTokens: number,
	completionTokens: number,
	totalTokens: number
): Promise<void> {

	await addMessageToCache(conversationId, {
		role: "assistant",
		content,
		tokensUsed: {
			promptTokens,
			completionTokens,
			totalTokens
		},
		createdAt: new Date().toISOString()
	});

}

// function to save assistant tool calls in redis cache
export async function saveAssistantToolCalls(
	conversationId: string,
	toolCalls: Array<{ id: string; type: string; name: string; args: Record<string, unknown> }>
): Promise<void> {

	await addMessageToCache(conversationId, {
		role: "assistant",
		content: "",
		toolCalls,
		createdAt: new Date().toISOString()
	});

}

// function to save a tool response in redis cache
export async function saveToolResponse(
	conversationId: string,
	toolCallId: string,
	name: string,
	content: string
): Promise<void> {

	await addMessageToCache(conversationId, {
		role: "tool",
		content,
		toolCallId,
		name,
		createdAt: new Date().toISOString()
	});

}
