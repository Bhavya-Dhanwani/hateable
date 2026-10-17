// System prompts for every agent, kept as plain Markdown in aiService/prompts/ so they can be
// edited without touching code. Files are read on every call: an edit applies to the next agent
// run, no restart needed (the OS caches the reads, so this costs nothing next to an LLM call).

// Importing modules
import { readFileSync } from 'node:fs';
import path from 'node:path';

// aiService/prompts, resolved from the working directory so it works from src (tsx) and dist (node)
const PROMPTS_DIR = path.join(process.cwd(), 'prompts');

// prompts that sit inside the engineering team get the shared team rules prepended
const TEAM_ROLES = new Set(['triage', 'planner', 'splitter', 'worker', 'reviewer']);

export type PromptName =
  'triage' | 'planner' | 'splitter' | 'worker' | 'reviewer' | 'browser-qa' | 'site-ai';

const read = (name: string) => readFileSync(path.join(PROMPTS_DIR, `${name}.md`), 'utf8').trim();

// function to get the system prompt of an agent, e.g. prompt('worker')
export function prompt(name: PromptName) {
  return TEAM_ROLES.has(name) ? `${read('shared')}\n\n${read(name)}` : read(name);
}
