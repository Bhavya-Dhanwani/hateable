// Browser QA: after the agents save, a tool-calling agent drives a real Chromium (Playwright MCP)
// against the project's preview and reports what is actually broken for a user.

// Importing modules
import { createAgent } from 'langchain';
import { z } from 'zod';
import logger from '../config/logger.config.js';
import { modelFor, pool } from './llm.js';
import { prompt } from './prompts.js';
import { openBrowserSession } from '../services/mcp.service.js';
import { createTerminalTool } from '../services/terminal.service.js';

const QaReport = z.object({
  ok: z.boolean(),
  issues: z.array(z.string()),
  summary: z.string()
});
export type QaReport = z.infer<typeof QaReport>;

// one browser step per graph step; a check that needs more than this is wandering
const MAX_STEPS = 40;

/**
 * Opens the preview in a fresh browser context and lets the QA agent test the task.
 *
 * @param previewUrl In-cluster preview origin, e.g. http://nextjs-service-<id>
 * @param task What the user asked for, so the agent knows what to exercise.
 * @param files Files the agents just wrote, as hints for where issues live.
 */
export async function checkInBrowser(
  previewUrl: string,
  task: string,
  files: string[],
  terminal?: { fileServerUrl: string; onRun: (line: string) => void }
): Promise<QaReport> {
  const session = await openBrowserSession(previewUrl);

  try {
    const agent = createAgent({
      model: modelFor(await pool.next()),
      // the browser, plus a shell in the project to read build errors behind what it sees
      tools: terminal
        ? [...session.tools, createTerminalTool(terminal.fileServerUrl, terminal.onRun)]
        : session.tools,
      systemPrompt: prompt('browser-qa'),
      responseFormat: QaReport
    });

    const result = await agent.invoke(
      {
        messages: [
          {
            role: 'user',
            content: [
              `Preview URL: ${previewUrl}`,
              `## What the user asked for\n${task}`,
              `## Files the agents just changed\n${files.map((f) => `- ${f}`).join('\n') || '(none)'}`
            ].join('\n\n')
          }
        ]
      },
      { recursionLimit: MAX_STEPS, runName: 'Browser QA' }
    );

    return result.structuredResponse;
  } finally {
    // freeing the browser context even when the agent throws
    await session.close().catch((err) => logger.warn(err, 'Failed to close browser session'));
  }
}
