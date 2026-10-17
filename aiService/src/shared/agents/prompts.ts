// System prompts for every agent, kept as plain Markdown in aiService/prompts/ so they can be
// edited without touching code. Files are read on every call: an edit applies to the next agent
// run, no restart needed (the OS caches the reads, so this costs nothing next to an LLM call).

// Importing modules
import { readdirSync, readFileSync } from 'node:fs';
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

// ---- skills ----
// Focused know-how an agent loads only when its task needs it (aiService/prompts/skills/*.md).
// The first line of each file is "description: ..."; triage reads the descriptions and picks.

const SKILLS_DIR = path.join(PROMPTS_DIR, 'skills');

export type Skill = { name: string; description: string };

// function to list every available skill, e.g. [{ name: 'accessibility', description: '...' }]
export function listSkills(): Skill[] {
  return readdirSync(SKILLS_DIR)
    .filter((file) => file.endsWith('.md'))
    .map((file) => {
      const firstLine = readFileSync(path.join(SKILLS_DIR, file), 'utf8').split('\n', 1)[0];
      return {
        name: file.slice(0, -'.md'.length),
        description: firstLine.replace(/^description:\s*/i, '').trim()
      };
    });
}

// function to get the full text of the chosen skills, ready to paste into a prompt ('' if none)
export function skillsText(names: string[]) {
  const known = new Set(listSkills().map((s) => s.name));
  return names
    .filter((name) => known.has(name))
    .map((name) =>
      readFileSync(path.join(SKILLS_DIR, `${name}.md`), 'utf8')
        .replace(/^description:.*\n/i, '') // the description is for choosing, not for following
        .trim()
    )
    .join('\n\n---\n\n');
}
