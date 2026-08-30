// Importing modules
import { ChatMistralAI } from "@langchain/mistralai";
import { AIMessage, BaseMessage, createAgent, HumanMessage, ToolMessage } from "langchain";
import * as z from "zod";
import env from "../config/env.config.js";
import { createFileTools } from "./fileTools.service.js";
import { CachedMessage } from "./redis.service.js";
import { mapCachedToLangChain } from "../utils/messageMapper.util.js";

// function to generate conversation title
export async function getTitleFromMessage({ message }: { message: string }): Promise<string> {

	const model = new ChatMistralAI({
		apiKey: env.MISTRAL_API_KEY,
		modelName: "mistral-large-latest",
		temperature: 0,
	});

	const agent = createAgent({
		model,
		responseFormat: z.object({
			title: z.string().max(30).describe("The title of the conversation, max 30 characters")
		}),
		systemPrompt: "You are a helpful assistant that extracts a concise title from the given message."
	});

	const titleResult = await agent.invoke({
		messages: [
			new HumanMessage(message)
		]
	});

	return titleResult.structuredResponse.title;

}

// function to stream agent response
export async function getStream({ messages, fileServerUrl }: { messages: CachedMessage[], fileServerUrl: string }) {

	const model = new ChatMistralAI({
		apiKey: env.MISTRAL_API_KEY,
		modelName: "mistral-large-latest",
		temperature: 0,
		streaming: true
	});

	const fileTools = createFileTools(fileServerUrl);

	const agent = createAgent({
		model,
		tools: fileTools,
		systemPrompt: "You are a helpful programming assistant that helps users manage files in their workspace. Use the provided tools when necessary."
	});

	const langchainMessages: BaseMessage[] = messages.map(mapCachedToLangChain);

	const stream = await agent.stream(
		{
			messages: langchainMessages,
		},
		{
			streamMode: ["messages", "values"],
		}
	);

	return stream;

}
