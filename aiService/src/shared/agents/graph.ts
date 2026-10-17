// Dynamic hierarchical multi-agent system.
// Every agent runs this same graph: it triages its task, then either does it itself (work <-> review loop)
// or plans/splits it and hires child agents that run this graph again, all in parallel.

// Importing modules
import { randomUUID } from 'node:crypto';
import { Annotation, END, START, Send, StateGraph } from '@langchain/langgraph';
import { z } from 'zod';
import env from '../config/env.config.js';
import { ask } from './llm.js';
import { PLANNER, REVIEWER, SPLITTER, TRIAGE, WORKER } from './prompts.js';

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
  complexity: Annotation<'small' | 'medium' | 'large'>,
  plan: Annotation<string>,
  contracts: Annotation<string>,
  subtasks: Annotation<Subtask[]>,
  draft: Annotation<Files>, // this agent's current code
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

const showFiles = (files: Files) =>
  Object.entries(files)
    .map(([p, c]) => `=== ${p} ===\n${c}`)
    .join('\n\n');

async function fileServer(ctx: RunCtx, route: string, init?: RequestInit) {
  const res = await fetch(`${ctx.fileServerUrl}${route}`, init);
  if (!res.ok) throw new Error(`File server ${route} failed: ${res.status} ${await res.text()}`);
  return res.json();
}

// ---- nodes ----

async function triage(s: S): Promise<Partial<S>> {
  const ctx = ctxOf(s);
  if (++ctx.agents > env.MAX_AGENTS || s.depth >= env.MAX_DEPTH) {
    return { complexity: 'small', readFiles: [] };
  }
  const r = await ask(
    z.object({
      complexity: z.enum(['small', 'medium', 'large']),
      reason: z.string(),
      readFiles: z
        .array(z.string())
        .describe('existing project files you must see to do this task well (max 15)')
    }),
    TRIAGE,
    brief(s),
    `${s.role}:triage`
  );
  // planning happens once; below a plan, "large" means "split it"
  const complexity = r.complexity === 'large' && s.depth > 0 ? 'medium' : r.complexity;
  log(s, `${complexity}: ${r.reason}`);
  return { complexity, readFiles: r.readFiles.slice(0, 15) };
}

async function plan(s: S): Promise<Partial<S>> {
  log(s, 'planning architecture...');
  const r = await ask(
    z.object({ plan: z.string().describe('full markdown architecture plan') }),
    PLANNER,
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
    SPLITTER,
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
      notes: z.string()
    }),
    WORKER,
    [
      brief(s),
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
    round
  };
}

async function review(s: S): Promise<Partial<S>> {
  const r = await ask(
    z.object({ score: z.number().min(0).max(10), issues: z.array(z.string()) }),
    REVIEWER,
    `${brief(s)}\n\n## Code to review\n${showFiles(s.draft)}`,
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
  const n = Object.keys(s.draft).length;
  if (n) {
    await fileServer(ctx, '/files', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(s.draft)
    });
    Object.keys(s.draft).forEach((f) => ctx.tree.add(f));
  }
  log(s, `saved ${n} file(s), final score ${s.review.score}/10`);
  return {
    files: s.draft,
    reports: [`${s.path}: ${s.review.score}/10 after ${s.round} round(s), ${n} file(s)`]
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
  emit: (e: AgentEvent) => void;
  signal?: AbortSignal;
}): Promise<{ files: string[]; reports: string[] }> {
  const runId = randomUUID();
  const ctx: RunCtx = {
    fileServerUrl: opts.fileServerUrl,
    tree: new Set(),
    agents: 0,
    cancelled: false,
    emit: opts.emit
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
    return { files: Object.keys(out.files), reports: out.reports };
  } finally {
    runs.delete(runId);
  }
}
