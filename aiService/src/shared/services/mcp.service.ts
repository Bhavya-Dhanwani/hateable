// Importing modules
import { MultiServerMCPClient } from '@langchain/mcp-adapters';
import { createRequire } from 'node:module';
import { tool, type StructuredToolInterface } from '@langchain/core/tools';
import env from '../config/env.config.js';

/**
 * MCP (Model Context Protocol) servers the agents can use.
 *
 * - playwright: its own in-cluster service over streamable HTTP, so aiService stays a small
 *   Node image (it ships a whole Chromium).
 * - replicate: Replicate's official server (npm replicate-mcp), stdio only, so it runs as a
 *   short-lived child process of aiService for the duration of one agent run.
 *
 * Adding a server = one entry here (+ a k8s manifest if it runs remotely); an empty value disables it.
 */
const SERVERS = {
  playwright: env.PLAYWRIGHT_MCP_URL,
  replicate: env.REPLICATE_API_TOKEN
} as const;

type ServerName = keyof typeof SERVERS;

// browser tools the QA agent may use; evaluate/run_code/file_upload/tabs are left out on purpose
const PLAYWRIGHT_TOOLS = new Set([
  'browser_navigate',
  'browser_navigate_back',
  'browser_snapshot',
  'browser_console_messages',
  'browser_network_requests',
  'browser_click',
  'browser_type',
  'browser_press_key',
  'browser_hover',
  'browser_wait_for',
  'browser_resize'
]);

// function to tell whether a server is configured
export const hasMcpServer = (name: ServerName) => Boolean(SERVERS[name]);

/**
 * Opens a fresh MCP session with the Playwright server, scoped to one project preview.
 *
 * One session per agent run: Playwright MCP gives every HTTP session its own isolated
 * browser context, so parallel runs never share tabs, cookies or storage. Call `close`
 * when the run is done to free the context.
 *
 * `browser_navigate` is wrapped so the model can only open the preview it is checking,
 * never an internal service (mongo, redis, the k8s API...) or the open internet.
 *
 * @param previewUrl Origin of the project preview, e.g. http://nextjs-service-<id>
 */
export async function openBrowserSession(previewUrl: string) {
  const client = new MultiServerMCPClient({
    mcpServers: { playwright: { url: SERVERS.playwright, transport: 'http' } },
    throwOnLoadError: true,
    prefixToolNameWithServerName: false,
    useStandardContentBlocks: true
  });

  const allowedOrigin = new URL(previewUrl).origin;
  const tools = (await client.getTools('playwright')).filter((t) => PLAYWRIGHT_TOOLS.has(t.name));

  const scoped: StructuredToolInterface[] = tools.map((original) =>
    original.name !== 'browser_navigate'
      ? original
      : tool(
          async (args: { url: string }) => {
            // resolving relative paths against the preview, then refusing anything off-origin
            const target = new URL(args.url, allowedOrigin);
            if (target.origin !== allowedOrigin) {
              return `Refused: you may only open pages under ${allowedOrigin}.`;
            }
            return original.invoke({ ...args, url: target.toString() });
          },
          {
            name: original.name,
            description: `${original.description} Only URLs under ${allowedOrigin} are allowed.`,
            schema: original.schema as never
          }
        )
  );

  return { tools: scoped, close: () => client.close() };
}

/**
 * Starts Replicate's MCP server as a child process, exposing only the two tools image
 * generation needs: run an official model, and poll a prediction that is still running.
 *
 * The child gets an env with just the Replicate token (and PATH), never aiService's own
 * secrets like the Mistral keys or database URLs.
 */
export async function openReplicateSession() {
  const bin = createRequire(import.meta.url).resolve('replicate-mcp/index.js');
  const client = new MultiServerMCPClient({
    mcpServers: {
      replicate: {
        transport: 'stdio',
        command: process.execPath,
        args: [bin, '--tool=create_models_predictions', '--tool=get_predictions'],
        env: { REPLICATE_API_TOKEN: SERVERS.replicate, PATH: process.env.PATH || '' }
      }
    },
    throwOnLoadError: true,
    prefixToolNameWithServerName: false
  });

  const tools = await client.getTools('replicate');
  const byName = (name: string) => {
    const found = tools.find((t) => t.name === name);
    if (!found) throw new Error(`Replicate MCP did not expose ${name}`);
    return found;
  };

  return {
    createPrediction: byName('create_models_predictions'),
    getPrediction: byName('get_predictions'),
    close: () => client.close()
  };
}
