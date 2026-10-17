import { spawn } from 'node:child_process';
import { WORK_FOLDER } from '../config/env.js';
import { HttpError, toAbsolutePath } from '../utils/path.util.js';

// a command may run this long before it is killed (npm install on a cold cache takes a while)
const DEFAULT_TIMEOUT_MS = 120_000;
const MAX_TIMEOUT_MS = 300_000;

// only the tail is kept: the end of a build or install is where the error is
const MAX_OUTPUT_CHARS = 20_000;

export type ExecResult = {
  exitCode: number | null;
  output: string; // stdout + stderr interleaved, as a terminal would show it
  timedOut: boolean;
  durationMs: number;
};

/**
 * Runs one shell command inside the project (this container mounts the whole workspace and has
 * node + npm), e.g. `npm install axios` or `npm run build`. Non-interactive: stdin is closed so
 * a prompt fails fast instead of hanging until the timeout.
 */
export function runCommand(
  command: string,
  cwd = '',
  timeoutMs = DEFAULT_TIMEOUT_MS
): Promise<ExecResult> {
  if (!command.trim()) throw new HttpError(400, 'command is required');

  const dir = cwd ? toAbsolutePath(cwd) : WORK_FOLDER;
  const limit = Math.min(Math.max(1000, timeoutMs), MAX_TIMEOUT_MS);
  const started = Date.now();

  return new Promise((resolve) => {
    const child = spawn('sh', ['-c', command], {
      cwd: dir,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, CI: 'true', FORCE_COLOR: '0', npm_config_yes: 'true' },
      detached: true // own process group, so a timeout kills the whole tree (npm -> node -> ...)
    });

    let output = '';
    const collect = (chunk: Buffer) => {
      output = (output + chunk.toString()).slice(-MAX_OUTPUT_CHARS);
    };
    child.stdout.on('data', collect);
    child.stderr.on('data', collect);

    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      try {
        process.kill(-child.pid!, 'SIGKILL');
      } catch {
        child.kill('SIGKILL');
      }
    }, limit);

    const finish = (exitCode: number | null) => {
      clearTimeout(timer);
      resolve({ exitCode, output, timedOut, durationMs: Date.now() - started });
    };
    child.on('close', finish);
    child.on('error', (error) => {
      collect(Buffer.from(String(error.message)));
      finish(null);
    });
  });
}
