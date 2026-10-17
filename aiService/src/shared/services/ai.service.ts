// Importing modules
import { BaseMessage, createAgent } from 'langchain';
import * as z from 'zod';
import { ask, modelFor, pool } from '../agents/llm.js';
import { createFileTools } from './fileTools.service.js';
import { CachedMessage } from './redis.service.js';
import { mapCachedToLangChain } from '../utils/messageMapper.util.js';

// function to generate conversation title
export async function getTitleFromMessage({ message }: { message: string }): Promise<string> {
  const result = await ask(
    z.object({
      title: z.string().max(30).describe('The title of the conversation, max 30 characters')
    }),
    'You are a helpful assistant that extracts a concise title from the given message.',
    message,
    'title'
  );

  return result.title;
}

// function to stream agent response
export async function getStream({
  messages,
  fileServerUrl
}: {
  messages: CachedMessage[];
  fileServerUrl: string;
}) {
  // next key from the shared round-robin pool
  const model = modelFor(await pool.next(), true);

  const fileTools = createFileTools(fileServerUrl);

  const agent = createAgent({
    model,
    tools: fileTools,
    systemPrompt:
      'You are a helpful programming assistant that helps users manage files in their workspace. Use the provided tools when necessary.'
  });

  const langchainMessages: BaseMessage[] = messages.map(mapCachedToLangChain);

  const stream = await agent.stream(
    {
      messages: langchainMessages
    },
    {
      streamMode: ['messages', 'values']
    }
  );

  return stream;
}
