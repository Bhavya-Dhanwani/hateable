// Importing modules
import { Request, Response } from 'express';
import { z } from 'zod';
import { ask } from '../../shared/agents/llm.js';
import { prompt } from '../../shared/agents/prompts.js';
import { callProjectService } from '../../shared/services/projectService.service.js';
import BadRequest from '../../shared/errors/BadRequest.error.js';
import Ok from '../../shared/responses/Ok.response.js';

// the slices of projectService's deployment responses this module reads
type LogLine = {
  at: string | null;
  level: string;
  message: string;
  count: number;
  stack?: string[];
};
type DeploymentLogs = {
  source: string;
  app: LogLine[];
  events: Array<{ at: string; level: string; message: string }>;
};
type DeploymentAnalytics = {
  url: string;
  status: string;
  idleRemainingMs: number;
  deployment: { slug: string; version: number; deployedAt: string; projectType: string };
  analytics: Record<string, unknown>;
};

const SiteAnswer = z.object({
  answer: z.string(),
  health: z.enum(['healthy', 'degraded', 'down']),
  fixTask: z.string()
});

// how much of the logs goes into the prompt: errors first, then the most recent lines
const MAX_LOG_LINES = 300;

// function to render log lines compactly for the model
const renderLogs = (lines: LogLine[]) =>
  lines
    .map(
      (l) =>
        `${l.at ?? ''} ${l.level.toUpperCase()} ${l.message}${l.count > 1 ? ` (x${l.count})` : ''}` +
        (l.stack?.length ? `\n    ${l.stack.join('\n    ')}` : '')
    )
    .join('\n');

// function to keep every error plus the newest lines, in their original order
function pickLogs(lines: LogLine[]) {
  if (lines.length <= MAX_LOG_LINES) return lines;
  const keep = new Set(lines.filter((l) => l.level !== 'info'));
  for (let i = lines.length - 1; i >= 0 && keep.size < MAX_LOG_LINES; i--) keep.add(lines[i]);
  return lines.filter((l) => keep.has(l));
}

// class to answer questions about a deployed site from its own logs and analytics
class InsightsController {
  // ask the site AI a question about a deployment
  ask = async (req: Request, res: Response) => {
    // getting the question from the request body
    const { projectId, question, history } = req.body as {
      projectId?: string;
      question?: string;
      history?: Array<{ role: string; content: string }>;
    };

    if (!projectId || !question?.trim()) {
      throw new BadRequest('projectId and question are required');
    }

    // reading the site's data as the user (projectService checks they own it)
    const auth = req.headers.authorization || '';
    const [site, logs] = await Promise.all([
      callProjectService<DeploymentAnalytics>(auth, `/${projectId}/deployment/analytics?days=7`),
      callProjectService<DeploymentLogs>(auth, `/${projectId}/deployment/logs`)
    ]);

    const context = [
      `## Deployment\n${site.url}, ${site.status}, v${site.deployment.version} (${site.deployment.projectType}), deployed ${site.deployment.deployedAt}` +
        (site.status === 'live'
          ? `, sleeps in ${Math.round(site.idleRemainingMs / 1000)}s without visitors`
          : ''),
      `## Analytics (last 7 days)\n${JSON.stringify(site.analytics)}`,
      `## Lifecycle events (newest first)\n${logs.events.map((e) => `${e.at} ${e.level.toUpperCase()} ${e.message}`).join('\n') || '(none)'}`,
      `## Application logs (${logs.source})\n${renderLogs(pickLogs(logs.app)) || '(none)'}`,
      history?.length &&
        `## Conversation so far\n${history
          .slice(-8)
          .map((m) => `${m.role}: ${m.content}`)
          .join('\n')}`,
      `## Question\n${question.trim()}`
    ]
      .filter(Boolean)
      .join('\n\n');

    // answering from that data only
    const answer = await ask(SiteAnswer, prompt('site-ai'), context, 'site-ai');

    return Ok(res, 'Answered', answer);
  };
}

export default InsightsController;
