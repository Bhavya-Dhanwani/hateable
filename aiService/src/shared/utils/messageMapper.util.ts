// Importing modules
import {
	BaseMessage,
	HumanMessage,
	AIMessage,
	SystemMessage,
	ToolMessage
} from "@langchain/core/messages";
import { CachedMessage } from "../services/redis.service.js";

// custom interface to access langchain's usage_metadata property type-safely
export interface MessageWithMetadata extends BaseMessage {
	usage_metadata?: {
		input_tokens?: number;
		output_tokens?: number;
		total_tokens?: number;
	};
}

// maps a CachedMessage from Redis/MongoDB to a LangChain BaseMessage instance
export function mapCachedToLangChain(cached: CachedMessage): BaseMessage {

	switch (cached.role) {

		case "user":
			return new HumanMessage({ content: cached.content || "" });

		case "system":
			return new SystemMessage({ content: cached.content || "" });

		case "assistant":
			return new AIMessage({
				content: cached.content || "",
				tool_calls: cached.toolCalls?.map((tc) => ({
					id: tc.id,
					name: tc.name,
					args: tc.args,
					type: "tool_call"
				})),
			});

		case "tool":
			return new ToolMessage({
				content: cached.content || "",
				tool_call_id: cached.toolCallId || "",
				name: cached.name || "",
			});

		default:
			throw new Error(`Unsupported message role: ${cached.role}`);

	}

}

// maps a LangChain BaseMessage instance to a CachedMessage object
export function mapLangChainToCached(msg: BaseMessage): CachedMessage {

	let role: "user" | "assistant" | "system" | "tool";
	let toolCalls: Array<{ id: string; name: string; args: Record<string, unknown>; type: string }> | undefined = undefined;
	let toolCallId: string | undefined = undefined;
	let name: string | undefined = undefined;

	const type = msg.getType();

	if (type === "human") {

		role = "user";

	} else if (type === "ai") {

		role = "assistant";
		const aiMsg = msg as AIMessage;

		if (aiMsg.tool_calls && aiMsg.tool_calls.length > 0) {

			toolCalls = aiMsg.tool_calls.map((tc) => ({
				id: tc.id || "",
				name: tc.name,
				args: tc.args as Record<string, unknown>,
				type: "tool_call",
			}));

		}

	} else if (type === "system") {

		role = "system";

	} else if (type === "tool") {

		role = "tool";
		const toolMsg = msg as ToolMessage;
		toolCallId = toolMsg.tool_call_id;
		name = toolMsg.name as string;

	} else {

		role = "user";

	}

	const msgWithMetadata = msg as MessageWithMetadata;

	return {
		role,
		content: typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content),
		toolCalls,
		toolCallId,
		name,
		tokensUsed: msgWithMetadata.usage_metadata ? {
			promptTokens: msgWithMetadata.usage_metadata.input_tokens || 0,
			completionTokens: msgWithMetadata.usage_metadata.output_tokens || 0,
			totalTokens: msgWithMetadata.usage_metadata.total_tokens || 0
		} : undefined,
		createdAt: new Date().toISOString(),
	};

}
