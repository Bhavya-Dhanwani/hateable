/**
 * Turns raw container output into the short, useful log a deployment owner wants to read:
 *
 * - drops dev-server chatter (vite/next/nodemon banners, HMR, "compiled", npm script echoes)
 * - strips ANSI colours and k8s timestamps (kept as `at`)
 * - tags every line error / warn / info
 * - folds stack traces into the error they belong to (first frames only)
 * - collapses repeated lines into one with a count
 */

export type LogLevel = 'error' | 'warn' | 'info';

export type LogLine = {
  at: string | null; // ISO time when the container wrote it, if known
  level: LogLevel;
  message: string;
  count: number; // > 1 when the same line repeated back to back
  stack?: string[]; // first frames of a stack trace
};

// eslint-disable-next-line no-control-regex
const ANSI = /\x1b\[[0-9;?]*[ -/]*[@-~]/g;
const K8S_TIMESTAMP = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z)\s?/;

// lines that only matter to someone watching a dev server boot
const NOISE = [
  /^>\s/, // npm script echo: "> app@1.0.0 dev"
  /^\s*vite v\d/i,
  /ready in \d+\s*ms/i,
  /^\s*(➜|->)?\s*(local|network):/i,
  /press h \+ enter/i,
  /\[vite\] (hmr|page reload|connected|server restarted)/i,
  /hmr update/i,
  /^\s*▲ next\.js/i,
  /^\s*[✓-]\s*(ready|starting|compiled|compiling)/i,
  /(wait|event)\s+-\s+compil/i,
  /\[nodemon\]/i,
  /watching (for )?file changes/i,
  /^npm (notice|warn using)/i,
  /^\s*$/
];

const ERROR =
  /\b(error|exception|unhandled|uncaught|failed|fatal|ECONNREFUSED|EADDRINUSE|ENOENT|TypeError|ReferenceError|SyntaxError|RangeError)\b/i;
const WARN = /\b(warn(ing)?|deprecat\w*)\b/i;
const STACK_FRAME = /^\s+at\s/;
const MAX_FRAMES = 3;
const STACK_LOOKBACK = 3;

const levelOf = (message: string): LogLevel =>
  ERROR.test(message) ? 'error' : WARN.test(message) ? 'warn' : 'info';

export function optimizeLogs(raw: string[]): LogLine[] {
  const out: LogLine[] = [];

  for (const original of raw) {
    let line = original.replace(ANSI, '').replace(/\r/g, '');
    const stamp = K8S_TIMESTAMP.exec(line);
    const at = stamp ? stamp[1] : null;
    if (stamp) line = line.slice(stamp[0].length);

    const previous = out.at(-1);

    // "    at fn (file.js:1:2)" belongs to the error above it; stdout and stderr reach the log
    // through separate pipes, so a stdout line can land in between: look back a few entries
    if (STACK_FRAME.test(line)) {
      const owner = out
        .slice(-STACK_LOOKBACK)
        .reverse()
        .find((entry) => entry.level !== 'info');
      if (owner) {
        owner.stack ??= [];
        if (owner.stack.length < MAX_FRAMES) owner.stack.push(line.trim());
      }
      continue;
    }

    if (NOISE.some((pattern) => pattern.test(line))) continue;

    const message = line.trimEnd();
    if (previous && previous.message === message) {
      previous.count++;
      continue;
    }

    out.push({ at, level: levelOf(message), message, count: 1 });
  }

  return out;
}
