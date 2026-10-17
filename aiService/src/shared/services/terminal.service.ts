// Importing modules
import { tool } from '@langchain/core/tools';
import { z } from 'zod';

/**
 * Shell access for the agents, through the project pod's file server (POST /exec). Commands run
 * inside the project with node + npm available, non-interactively, with a timeout and the tail
 * of their output returned (express-file-server/src/service/exec.service.ts).
 */

export type CommandResult = {
  exitCode: number | null;
  output: string;
  timedOut: boolean;
  durationMs: number;
};

// function to run one command in the project, e.g. runCommand(url, 'npm install zod')
export async function runCommand(
  fileServerUrl: string,
  command: string,
  cwd = ''
): Promise<CommandResult> {
  const res = await fetch(`${fileServerUrl}/exec`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ command, cwd })
  });
  if (!res.ok) throw new Error(`exec failed: ${res.status} ${await res.text()}`);
  return res.json();
}

// short status line for the chat, e.g. "$ npm install zod -> exit 0 in 4.2s"
export const describeResult = (command: string, r: CommandResult) =>
  `$ ${command} -> ${r.timedOut ? 'timed out' : `exit ${r.exitCode}`} in ${(r.durationMs / 1000).toFixed(1)}s`;

/**
 * The same command runner as a LangChain tool, for tool-calling agents (Browser QA).
 *
 * @param onRun Called after every command so the chat can show what the agent ran.
 */
export function createTerminalTool(fileServerUrl: string, onRun: (line: string) => void) {
  return tool(
    async ({ command, cwd }) => {
      const r = await runCommand(fileServerUrl, command, cwd ?? '');
      onRun(describeResult(command, r));
      return `${describeResult(command, r)}\n${r.output.slice(-6000) || '(no output)'}`;
    },
    {
      name: 'run_command',
      description:
        'Run a shell command in the project folder (node and npm are installed), e.g. "npm run build" ' +
        'to see compile errors or "cat package.json". Non-interactive, times out after 2 minutes. ' +
        'Never start long-running servers; the dev server is already running.',
      schema: z.object({
        command: z.string(),
        cwd: z
          .string()
          .optional()
          .describe('folder inside the project to run in, e.g. "client" for MERN; default root')
      })
    }
  );
}
