// Dynamic hierarchical multi-agent system.
// Every agent runs this same graph: it triages its task, then either does it itself (work <-> review loop)
// or plans/splits it and hires child agents that run this graph again, all in parallel.

// Importing modules
import { randomUUID } from 'node:crypto';
import { Annotation, END, START, Send, StateGraph } from '@langchain/langgraph';
import { z } from 'zod';
import env from '../config/env.config.js';
import { ask } from './llm.js';
import { listSkills, prompt, skillsText } from './prompts.js';
import { checkInBrowser } from './browserQa.js';
import { hasMcpServer } from '../services/mcp.service.js';
import { describeResult, runCommand } from '../services/terminal.service.js';
import {
  applyImageTokens,
  createImageResolver,
  ImageAspects,
  type ImageRequest
} from '../services/image.service.js';

type Files = Record<string, string>;
type Subtask = { role: string; task: string; files: string[] };

export type AgentEvent = { path: string; depth: number; message: string };

// per-request things that can't live in graph state (functions, counters shared by the whole tree)
type RunCtx = {
  fileServerUrl: string;
  tree: Set<string>; // files that exist in the project
  agents: number;
  cancelled: boolean;
  emit: (e: AgentEvent) => void;
  images: ReturnType<typeof createImageResolver>; // stock photos + generated images, shared by the tree
};
const runs = new Map<string, RunCtx>();

const State = Annotation.Root({
  runId: Annotation<string>,
  task: Annotation<string>,
  role: Annotation<string>,
  path: Annotation<string>, // "Boss > Backend Lead > Auth API"
  context: Annotation<string>, // plan + contracts inherited from ancestors
  depth: Annotation<number>,
  owned: Annotation<string[]>, // files this agent is responsible for
  readFiles: Annotation<string[]>, // existing files this agent wants to see
  skills: Annotation<string[]>, // skills (prompts/skills/*.md) this agent works and is reviewed by
  complexity: Annotation<'small' | 'medium' | 'large'>,
  plan: Annotation<string>,
  contracts: Annotation<string>,
  subtasks: Annotation<Subtask[]>,
  draft: Annotation<Files>, // this agent's current code
  images: Annotation<ImageRequest[]>, // images its code refers to with {{img:<id>}} tokens
  commands: Annotation<Array<{ command: string; cwd?: string }>>, // shell commands to run after saving
  review: Annotation<{ score: number; issues: string[] }>,
  round: Annotation<number>,
  // merged up from every descendant
  files: Annotation<Files>({ reducer: (a, b) => ({ ...a, ...b }), default: () => ({}) }),
  reports: Annotation<string[]>({ reducer: (a, b) => a.concat(b), default: () => [] })
});
type S = typeof State.State;

function ctxOf(s: S): RunCtx {
  const ctx = runs.get(s.runId);
  if (!ctx || ctx.cancelled) throw new Error('Agent run cancelled');
  return ctx;
}

const log = (s: S, message: string) => ctxOf(s).emit({ path: s.path, depth: s.depth, message });

const brief = (s: S) =>
  [
    `Your role: ${s.role}`,
    `Position in hierarchy: ${s.path} (depth ${s.depth})`,
    s.context && `## Shared context from your leads (source of truth)\n${s.context}`,
    `## Your task\n${s.task}`
  ]
    .filter(Boolean)
    .join('\n\n');

// at most this many skills per agent: each one is a page of prompt
const MAX_SKILLS = 4;

// the chosen skills as a prompt section; the worker follows them and the reviewer scores against them
const skillBlock = (s: S) => {
  const text = s.skills?.length ? skillsText(s.skills) : '';
  return (
    text && `## Skills for this task (follow them; they are part of the quality bar)\n\n${text}`
  );
};

const showFiles = (files: Files) =>
  Object.entries(files)
    .map(([p, c]) => `=== ${p} ===\n${c}`)
    .join('\n\n');

async function fileServer(ctx: RunCtx, route: string, init?: RequestInit) {
  let res = await fetch(`${ctx.fileServerUrl}${route}`, init);
  // 503 = the pod is still restoring the workspace from S3 (fresh pod): wait up to a minute
  for (let i = 0; res.status === 503 && i < 30; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    res = await fetch(`${ctx.fileServerUrl}${route}`, init);
  }
  if (!res.ok) throw new Error(`File server ${route} failed: ${res.status} ${await res.text()}`);
  return res.json();
}

// ---- nodes ----

async function triage(s: S): Promise<Partial<S>> {
  const ctx = ctxOf(s);
  if (++ctx.agents > env.MAX_AGENTS || s.depth >= env.MAX_DEPTH) {
    return { complexity: 'small', readFiles: [] };
  }
  const available = listSkills();
  const r = await ask(
    z.object({
      complexity: z.enum(['small', 'medium', 'large']),
      reason: z.string(),
      readFiles: z
        .array(z.string())
        .describe('existing project files you must see to do this task well (max 15)'),
      skills: z
        .array(z.string())
        .describe(
          'skills to load if you end up writing the code yourself (max 4), only those this task needs:\n' +
            available.map((k) => `- ${k.name}: ${k.description}`).join('\n')
        )
    }),
    prompt('triage'),
    brief(s),
    `${s.role}:triage`
  );
  // planning happens once; below a plan, "large" means "split it"
  const complexity = r.complexity === 'large' && s.depth > 0 ? 'medium' : r.complexity;
  const known = new Set(available.map((k) => k.name));
  const skills = (r.skills ?? []).filter((name) => known.has(name)).slice(0, MAX_SKILLS);
  log(s, `${complexity}: ${r.reason}${skills.length ? ` (skills: ${skills.join(', ')})` : ''}`);
  return { complexity, readFiles: r.readFiles.slice(0, 15), skills };
}

async function plan(s: S): Promise<Partial<S>> {
  log(s, 'planning architecture...');
  const r = await ask(
    z.object({ plan: z.string().describe('full markdown architecture plan') }),
    prompt('planner'),
    brief(s),
    `${s.role}:plan`
  );
  return { plan: r.plan };
}

async function split(s: S): Promise<Partial<S>> {
  const r = await ask(
    z.object({
      contracts: z
        .string()
        .describe('markdown: ownership map + every shared interface siblings must agree on'),
      subtasks: z
        .array(z.object({ role: z.string(), task: z.string(), files: z.array(z.string()) }))
        .max(8)
    }),
    prompt('splitter'),
    [brief(s), s.plan && `## Architecture plan (now split by it)\n${s.plan}`]
      .filter(Boolean)
      .join('\n\n'),
    `${s.role}:split`
  );
  if (r.subtasks.length >= 2)
    log(s, `hired ${r.subtasks.length} agents: ${r.subtasks.map((t) => t.role).join(', ')}`);
  return { contracts: r.contracts, subtasks: r.subtasks };
}

function fanOut(s: S) {
  if (s.subtasks.length < 2) return 'work'; // nothing worth splitting, do it yourself
  const team = s.subtasks
    .map((t) => `- ${t.role}: owns ${t.files.join(', ') || '(see contracts)'}`)
    .join('\n');
  const context = [
    s.context,
    s.plan && `## Architecture plan\n${s.plan}`,
    `## Contracts from ${s.role}\n${s.contracts}`,
    `## Parallel team under ${s.role}\n${team}`
  ]
    .filter(Boolean)
    .join('\n\n');
  return s.subtasks.map(
    (t) =>
      new Send('child', {
        runId: s.runId,
        task: `${t.task}\n\nFiles you own: ${t.files.join(', ') || 'as defined in contracts'}`,
        role: t.role,
        path: `${s.path} > ${t.role}`,
        context,
        depth: s.depth + 1,
        owned: t.files
      })
  );
}

// every child is a full agent: it triages, plans, splits or works on its own
async function child(s: S): Promise<Partial<S>> {
  const out: S = await graph.invoke(s, { runName: s.role, recursionLimit: 100 });
  return { files: out.files, reports: out.reports };
}

async function work(s: S): Promise<Partial<S>> {
  const ctx = ctxOf(s);
  const round = (s.round ?? 0) + 1;
  log(
    s,
    round === 1
      ? 'writing code...'
      : `revising (round ${round}, last score ${s.review.score}/10)...`
  );

  // show the current content of existing files it owns or asked for, so edits don't clobber code
  const wanted = [...new Set([...(s.owned ?? []), ...(s.readFiles ?? [])])].filter((f) =>
    ctx.tree.has(f)
  );
  const existing: Files =
    round === 1 && wanted.length
      ? (await fileServer(ctx, `/files?filenames=${encodeURIComponent(wanted.join(','))}`)).files
      : {};

  const r = await ask(
    z.object({
      files: z.array(
        z.object({ path: z.string(), content: z.string().describe('full file content') })
      ),
      images: z
        .array(
          z.object({
            id: z.string().describe('token name used in the code as {{img:<id>}}, e.g. hero'),
            kind: z.enum(['photo', 'generated']),
            description: z
              .string()
              .describe('photo: short stock search query; generated: detailed image prompt'),
            aspect: z.enum(ImageAspects),
            path: z
              .string()
              .optional()
              .describe('generated only: file to save it as, e.g. public/images/logo.webp')
          })
        )
        .describe('every image referenced by an {{img:<id>}} token in your files; [] if none'),
      commands: z
        .array(
          z.object({
            command: z.string().describe('e.g. npm install zod'),
            cwd: z.string().optional().describe('folder to run in, e.g. client or server for MERN')
          })
        )
        .describe(
          'shell commands to run after your files are saved, e.g. installing new deps; [] if none'
        ),
      notes: z.string()
    }),
    prompt('worker'),
    [
      brief(s),
      skillBlock(s),
      Object.keys(existing).length &&
        `## Current content of existing files\n${showFiles(existing)}`,
      s.review &&
        `## Your previous version\n${showFiles(s.draft)}\n\n## Reviewer score: ${s.review.score}/10. Fix ALL of these:\n${s.review.issues.map((i) => `- ${i}`).join('\n')}`
    ]
      .filter(Boolean)
      .join('\n\n'),
    `${s.role}:work#${round}`
  );
  return {
    draft: Object.fromEntries(r.files.map((f) => [f.path.replace(/^\/+/, ''), f.content])),
    images: r.images ?? [],
    commands: r.commands ?? [],
    round
  };
}

async function review(s: S): Promise<Partial<S>> {
  const r = await ask(
    z.object({ score: z.number().min(0).max(10), issues: z.array(z.string()) }),
    prompt('reviewer'),
    [brief(s), skillBlock(s), `## Code to review\n${showFiles(s.draft)}`]
      .filter(Boolean)
      .join('\n\n'),
    `${s.role}:review#${s.round}`
  );
  log(s, `review ${r.score}/10`);
  return { review: r };
}

const afterReview = (s: S) =>
  s.review.score >= env.MIN_SCORE || s.round >= env.MAX_REVIEW_ROUNDS ? 'save' : 'work';

// write straight to the project's file server (it validates paths) as soon as this agent is done
async function save(s: S): Promise<Partial<S>> {
  const ctx = ctxOf(s);

  // turning {{img:<id>}} tokens into real URLs; generated images become files of their own
  const resolved = s.images?.length ? await ctx.images.resolve(s.images) : {};
  const code: Files = Object.fromEntries(
    Object.entries(s.draft).map(([p, c]) => [p, applyImageTokens(c, resolved)])
  );
  const imageFiles: Files = Object.fromEntries(
    Object.values(resolved).flatMap((img) => (img.file ? [[img.file.path, img.file.dataUrl]] : []))
  );
  if (Object.keys(resolved).length) {
    log(s, `added ${Object.keys(resolved).length} image(s)`);
  }

  const n = Object.keys(code).length;
  const payload = { ...code, ...imageFiles };
  if (Object.keys(payload).length) {
    await fileServer(ctx, '/files', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    Object.keys(payload).forEach((f) => ctx.tree.add(f));
  }
  log(s, `saved ${n} file(s), final score ${s.review.score}/10`);

  // running what the agent asked for (installing the deps its code imports), in order
  const failed: string[] = [];
  for (const { command, cwd } of s.commands ?? []) {
    log(s, `$ ${command}${cwd ? `  (in ${cwd})` : ''}`);
    try {
      const r = await runCommand(ctx.fileServerUrl, command, cwd);
      log(s, describeResult(command, r));
      if (r.exitCode !== 0) failed.push(describeResult(command, r));
    } catch (err) {
      failed.push(`$ ${command} -> ${(err as Error).message}`);
    }
  }
  return {
    files: { ...code, ...Object.fromEntries(Object.keys(imageFiles).map((f) => [f, '(image)'])) },
    reports: [
      `${s.path}: ${s.review.score}/10 after ${s.round} round(s), ${n} file(s)`,
      ...failed.map((f) => `${s.path}: command failed: ${f}`)
    ]
  };
}

const graph = new StateGraph(State)
  .addNode('triage', triage)
  .addNode('planner', plan)
  .addNode('split', split)
  .addNode('child', child)
  .addNode('work', work)
  .addNode('reviewer', review)
  .addNode('save', save)
  .addEdge(START, 'triage')
  .addConditionalEdges(
    'triage',
    (s) => ({ small: 'work', medium: 'split', large: 'planner' })[s.complexity],
    ['work', 'split', 'planner']
  )
  .addEdge('planner', 'split')
  .addConditionalEdges('split', fanOut, ['child', 'work'])
  .addEdge('child', END)
  .addEdge('work', 'reviewer')
  .addConditionalEdges('reviewer', afterReview, ['work', 'save'])
  .addEdge('save', END)
  .compile();

// entry point used by the chat controller
export async function runAgents(opts: {
  task: string;
  history: string; // recent conversation, for follow-up requests
  fileServerUrl: string;
  previewUrl?: string; // in-cluster preview origin; enables the browser check when Playwright MCP is set up
  extras?: boolean; // plan gate for AI image generation and the browser check (default on)
  emit: (e: AgentEvent) => void;
  signal?: AbortSignal;
}): Promise<{ files: string[]; reports: string[] }> {
  const runId = randomUUID();
  const ctx: RunCtx = {
    fileServerUrl: opts.fileServerUrl,
    tree: new Set(),
    agents: 0,
    cancelled: false,
    emit: opts.emit,
    images: createImageResolver((message) => opts.emit({ path: 'Images', depth: 0, message }), {
      generate: opts.extras !== false
    })
  };
  runs.set(runId, ctx);
  opts.signal?.addEventListener('abort', () => (ctx.cancelled = true));

  try {
    const { tree } = (await fileServer(ctx, '/file-tree')) as { tree: string };
    tree
      .split('\n')
      .filter(Boolean)
      .forEach((f) => ctx.tree.add(f));

    const context = [
      opts.history && `## Conversation so far\n${opts.history}`,
      `## Current project files\n${tree || '(empty project)'}`
    ]
      .filter(Boolean)
      .join('\n\n');

    const out = await graph.invoke(
      { runId, task: opts.task, role: 'Boss', path: 'Boss', context, depth: 0, owned: [] },
      { runName: 'Boss', recursionLimit: 100 }
    );
    const files = { ...out.files };
    const reports = [...out.reports];

    // open the result in a real browser; hand anything broken to one more agent, then re-check
    if (
      opts.extras !== false &&
      opts.previewUrl &&
      hasMcpServer('playwright') &&
      Object.keys(files).length
    ) {
      const qa = (message: string) => opts.emit({ path: 'Browser QA', depth: 0, message });

      for (let round = 0; round <= env.MAX_BROWSER_FIX_ROUNDS; round++) {
        let report;
        try {
          qa(round ? 're-checking the preview...' : 'opening the preview in Chromium...');
          report = await checkInBrowser(opts.previewUrl, opts.task, Object.keys(files), {
            fileServerUrl: opts.fileServerUrl,
            onRun: qa
          });
        } catch (err) {
          // QA is a bonus: a browser or MCP failure must never fail the user's run
          qa(`browser check skipped: ${(err as Error).message.slice(0, 120)}`);
          break;
        }

        qa(report.ok ? `looks good: ${report.summary}` : `found ${report.issues.length} issue(s)`);
        reports.push(
          `Browser QA: ${report.ok ? 'passed' : `${report.issues.length} issue(s)`}, ${report.summary}`
        );
        if (report.ok || round === env.MAX_BROWSER_FIX_ROUNDS) break;

        const fix = await graph.invoke(
          {
            runId,
            task: [
              'A QA engineer opened the app in a real browser after your team finished and found these problems.',
              'Fix every one of them:',
              ...report.issues.map((i) => `- ${i}`)
            ].join('\n'),
            role: 'Browser Fixer',
            path: 'Boss > Browser Fixer',
            context: [
              `## Original request\n${opts.task}`,
              `## Current project files\n${[...ctx.tree].join('\n')}`
            ].join('\n\n'),
            depth: 1, // a focused fix: it may split, but never re-plan the whole app
            owned: []
          },
          { runName: 'Browser Fixer', recursionLimit: 100 }
        );
        Object.assign(files, fix.files);
        reports.push(...fix.reports);
      }
    }

    return { files: Object.keys(files), reports };
  } finally {
    runs.delete(runId);
    await ctx.images.close();
  }
}
