// Importing modules
import { Request, Response, NextFunction } from 'express';
import { BaseMessage } from '@langchain/core/messages';
import env from '../../shared/config/env.config.js';
import logger from '../../shared/config/logger.config.js';
import { getStream } from '../../shared/services/ai.service.js';
import { runAgents } from '../../shared/agents/graph.js';
import { callProjectService } from '../../shared/services/projectService.service.js';
import ProjectDao from '../../shared/dao/project.dao.js';
import ConversationDao from '../../shared/dao/conversation.dao.js';
import {
  getConversationHistory,
  flushConversationToDB
} from '../../shared/services/redis.service.js';
import BadRequest from '../../shared/errors/BadRequest.error.js';
import Unauthorized from '../../shared/errors/Unauthorized.error.js';
import { assertProjectAccess, resolveProject } from './utils/project.util.js';
import {
  AI_LIMITS,
  extrasAllowed,
  takeMessage,
  usagePool
} from '../../shared/services/plan.service.js';
import { resolveConversation, generateAndSaveTitle } from './utils/conversation.util.js';
import {
  saveUserMessage,
  saveAssistantMessage,
  saveAssistantToolCalls,
  saveToolResponse
} from './utils/chatCache.util.js';
import {
  mapLangChainToCached,
  MessageWithMetadata
} from '../../shared/utils/messageMapper.util.js';

// whether a project's file server answers, polling for up to `withinMs` (0 = one try)
async function workspaceReady(fileServerUrl: string, withinMs = 0) {
  const until = Date.now() + withinMs;
  for (;;) {
    try {
      await fetch(`${fileServerUrl}/file-tree`, { signal: AbortSignal.timeout(3000) });
      return true; // any HTTP answer means the server is up
    } catch {
      if (Date.now() >= until) return false;
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
}

// class to handle chat operations
class ChatController {
  projectDao: ProjectDao;
  conversationDao: ConversationDao;

  constructor() {
    // initializing the project dao
    this.projectDao = new ProjectDao();

    // initializing the conversation dao
    this.conversationDao = new ConversationDao();
  }

  // handle user messages and stream agent responses
  chatHandler = async (
    req: Request & { user?: Record<string, unknown> },
    res: Response,
    next: NextFunction
  ) => {
    const { conversationId, projectId, message } = req.body;
    const userId = req.user?.userId || req.user?._id;

    if (!projectId || !message) {
      throw new BadRequest('projectId and message are required fields.');
    }

    if (!userId) {
      throw new Unauthorized('User authentication failed. No user ID found.');
    }

    // 1. Resolve project
    const project = await resolveProject(projectId, this.projectDao, req.headers.authorization);
    // chatting changes the project's files: its owner or a workspace editor and up
    assertProjectAccess(req.user, project, 'editor');

    // plan limits: one message off the rolling 24h allowance (429 when it's used up), and
    // whether this project gets image generation and the browser test. Workspace projects
    // draw on the workspace's shared Team pool.
    const pool = usagePool(req.user, project);
    await takeMessage(pool, { userId: userId.toString(), projectId });
    const extras = await extrasAllowed(userId.toString(), pool.plan, projectId);
    // the pod file server mounts its routes at the root (express-file-server/src/app/app.ts)
    let fileServerUrl = `http://${project.serviceName}:8000`;

    if (
      env.NODE_ENV === 'development' &&
      (!project.serviceName || project.serviceName === 'localhost')
    ) {
      fileServerUrl = 'http://localhost:8080';
    }

    // 2. Resolve conversation
    let {
      conversationId: resolvedConversationId,
      conversationTitle,
      isNewConversation,
      cachedConvo
    } = await resolveConversation(
      conversationId,
      projectId,
      userId.toString(),
      this.conversationDao
    );

    // 3. Generate title if it is a new conversation
    if (isNewConversation && cachedConvo) {
      conversationTitle = await generateAndSaveTitle(
        resolvedConversationId,
        cachedConvo,
        message,
        this.conversationDao
      );
    }

    // 4. Cache user message
    await saveUserMessage(resolvedConversationId, message);

    // 5. Establish SSE connection
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    // stream the title event first
    res.write(
      `event: title\ndata: ${JSON.stringify({ conversationId: resolvedConversationId, title: conversationTitle })}\n\n`
    );

    // 6. Load prior messages from cache
    const history = await getConversationHistory(resolvedConversationId);

    // 7. Track flushing to database
    let isFlushed = false;

    const flushDatabase = async () => {
      if (isFlushed) {
        return;
      }

      isFlushed = true;

      try {
        await flushConversationToDB(resolvedConversationId);
      } catch (flushErr) {
        logger.error(
          flushErr as Error,
          `Failed to flush conversation ${resolvedConversationId} to MongoDB`
        );
      }
    };

    // attach listener for client disconnects
    req.on('close', async () => {
      logger.info(
        `Client disconnected from SSE stream for conversation: ${resolvedConversationId}`
      );
      await flushDatabase();
    });

    try {
      // a brand-new project's pod may still be booting (the landing-page prompt is sent the
      // moment the workspace opens): wait for its file server instead of failing the first run
      if (!(await workspaceReady(fileServerUrl))) {
        res.write(
          `event: agent
data: ${JSON.stringify({ path: 'Workspace', depth: 0, message: 'waiting for your workspace to start...' })}

`
        );
        if (!(await workspaceReady(fileServerUrl, 120_000))) {
          throw new Error(
            'Your workspace is still starting. Give it a minute and send that again.'
          );
        }
      }

      // 8a. Multi-agent system: boss triages, plans, hires sub-agents, reviewer loops to 9/10
      if (env.AGENT_SYSTEM_V2) {
        const abort = new AbortController();
        res.on('close', () => {
          if (!res.writableEnded) abort.abort();
        });

        const send = (event: string, data: unknown) => {
          if (!res.writableEnded && !res.destroyed)
            res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
        };

        // earlier turns, so follow-ups like "now make the button blue" have context
        const recent = history
          .slice(0, -1)
          .filter((m) => (m.role === 'user' || m.role === 'assistant') && m.content)
          .slice(-10)
          .map((m) => `${m.role}: ${m.content}`)
          .join('\n');

        // one pull before every run: edits made on GitHub land in the workspace before agents read it
        try {
          const pulled = await callProjectService<{
            linked: boolean;
            written: number;
            deleted: number;
          }>(req.headers.authorization || '', `/${projectId}/github/pull`, { method: 'POST' });
          if (pulled.linked) {
            send('agent', {
              path: 'GitHub',
              depth: 0,
              message:
                pulled.written || pulled.deleted
                  ? `pulled ${pulled.written} changed and ${pulled.deleted} deleted file(s)`
                  : 'already up to date'
            });
          }
        } catch (err) {
          // GitHub being unreachable must not block the user's request
          send('agent', {
            path: 'GitHub',
            depth: 0,
            message: `pull skipped: ${(err as Error).message}`
          });
        }

        const result = await runAgents({
          task: message,
          history: recent,
          fileServerUrl,
          // the browser check opens the same preview the user sees, from inside the cluster
          previewUrl: project.serviceName ? `http://${project.serviceName}` : undefined,
          extras,
          maxAgents: AI_LIMITS[pool.plan].maxAgents,
          signal: abort.signal,
          emit: (e) => send('agent', e)
        });

        const summary = [
          `Done. ${result.files.length} file(s) written:`,
          ...result.files.map((f) => `- ${f}`),
          '',
          'Agents:',
          ...result.reports.map((r) => `- ${r}`)
        ].join('\n');

        await saveAssistantMessage(resolvedConversationId, summary, 0, 0, 0);

        send('complete', {
          conversationId: resolvedConversationId,
          message: summary,
          files: result.files
        });
        res.end();

        flushDatabase().catch((flushErr) => {
          logger.error(
            flushErr as Error,
            `Failed to flush conversation ${resolvedConversationId} to MongoDB`
          );
        });

        return;
      }

      // 8b. Single tool-calling agent, streamed token by token
      const stream = await getStream({ messages: history, fileServerUrl });

      let aiMessage = '';
      let promptTokens = 0;
      let completionTokens = 0;
      let totalTokens = 0;

      let cachedCount = history.length;

      for await (const [streamMode, chunk] of stream) {
        if (streamMode === 'messages') {
          const messageChunk = chunk[0] as MessageWithMetadata;

          if (messageChunk) {
            // accumulate token usage metrics
            if (messageChunk.usage_metadata) {
              promptTokens += messageChunk.usage_metadata.input_tokens || 0;
              completionTokens += messageChunk.usage_metadata.output_tokens || 0;
              totalTokens += messageChunk.usage_metadata.total_tokens || 0;
            }

            if (typeof messageChunk.content === 'string' && messageChunk.content.length > 0) {
              res.write(
                `event: token\ndata: ${JSON.stringify({ text: messageChunk.content })}\n\n`
              );
              aiMessage += messageChunk.content;
            }
          }
        } else if (streamMode === 'values') {
          const currentMessages = chunk.messages as BaseMessage[];

          if (currentMessages && currentMessages.length > cachedCount) {
            const newMessages = currentMessages.slice(cachedCount);

            for (const msg of newMessages) {
              const cachedMsg = mapLangChainToCached(msg);

              if (
                cachedMsg.role === 'assistant' &&
                cachedMsg.toolCalls &&
                cachedMsg.toolCalls.length > 0
              ) {
                // stream the tool call event to the chatbot
                res.write(
                  `event: tool_call\ndata: ${JSON.stringify({ toolCalls: cachedMsg.toolCalls })}\n\n`
                );

                // cache the assistant's message with tool calls in redis
                await saveAssistantToolCalls(resolvedConversationId, cachedMsg.toolCalls);
              } else if (cachedMsg.role === 'tool') {
                // stream the tool response event to the chatbot
                res.write(
                  `event: tool_response\ndata: ${JSON.stringify({
                    toolCallId: cachedMsg.toolCallId,
                    name: cachedMsg.name,
                    content: cachedMsg.content
                  })}\n\n`
                );

                // cache the tool message in redis
                await saveToolResponse(
                  resolvedConversationId,
                  cachedMsg.toolCallId || '',
                  cachedMsg.name || '',
                  cachedMsg.content || ''
                );
              }
            }

            cachedCount = currentMessages.length;
          }
        }
      }

      // if we generated any assistant response, write the final assistant text to redis
      if (aiMessage.trim().length > 0) {
        await saveAssistantMessage(
          resolvedConversationId,
          aiMessage,
          promptTokens,
          completionTokens,
          totalTokens
        );
      }

      // 9. Send completion details
      const tokensUsed = { promptTokens, completionTokens, totalTokens };

      res.write(
        `event: complete\ndata: ${JSON.stringify({
          conversationId: resolvedConversationId,
          message: aiMessage,
          tokensUsed
        })}\n\n`
      );

      res.end();

      // 10. Flush cached messages to database (non-blocking background task)
      flushDatabase().catch((flushErr) => {
        logger.error(
          flushErr as Error,
          `Failed to flush conversation ${resolvedConversationId} to MongoDB`
        );
      });
    } catch (streamError) {
      const err = streamError as Error;
      logger.error(err, 'Error during SSE generation stream');

      res.write(
        `event: error\ndata: ${JSON.stringify({ message: err.message || 'An error occurred during generation.' })}\n\n`
      );
      res.end();

      // Flush cached messages to database (non-blocking background task)
      flushDatabase().catch((flushErr) => {
        logger.error(
          flushErr as Error,
          `Failed to flush conversation ${resolvedConversationId} to MongoDB`
        );
      });
    }
  };
}

export default ChatController;
