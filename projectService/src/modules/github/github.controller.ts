// Importing modules
import { Request, Response } from 'express';
import { randomBytes } from 'node:crypto';
import jwt from 'jsonwebtoken';
import env from '../../shared/config/env.config.js';
import { findProjectFor } from '../../shared/utils/access.util.js';
import GithubAccount from '../../shared/models/githubAccount.model.js';
import Forbidden from '../../shared/errors/Forbidden.error.js';
import BadRequest from '../../shared/errors/BadRequest.error.js';
import Unauthorized from '../../shared/errors/Unauthorized.error.js';
import Ok from '../../shared/responses/Ok.response.js';
import NoContent from '../../shared/responses/NoContent.response.js';
import { decrypt, encrypt } from '../../shared/utils/crypto.util.js';
import { readPrefix } from '../../shared/services/s3.service.js';
import {
  authorizeUrl,
  changesSince,
  ensureRepo,
  exchangeCode,
  pushFiles,
  REPO_NAME
} from '../../shared/services/github.service.js';

// function to read the user id the auth middleware put on the request
const currentUserId = (req: Request) => {
  const user = (req as Request & { user?: { userId?: string; _id?: string } }).user;
  return user?.userId || user?._id || '';
};

// where the OAuth callback may send the browser back to: an in-app path only (no open redirect)
const safeReturnTo = (value: unknown) =>
  typeof value === 'string' && value.startsWith('/') && !value.startsWith('//')
    ? value
    : '/projects';

// cookie holding the nonce of an in-flight GitHub connect
const STATE_COOKIE = 'githubOAuthNonce';

// files are written into the workspace in batches so a request stays under the file server's 10mb limit
const WRITE_BATCH = 20;

// class to handle the GitHub connection and pushing / pulling projects
class GithubController {
  // function to load a project the caller may push and pull (editor and up)
  private findOwnedProject = (req: Request) => findProjectFor(req, 'editor');

  // function to get the caller's GitHub token, or fail with a clear "connect first"
  private tokenOf = async (req: Request) => {
    const account = await GithubAccount.findOne({ userId: currentUserId(req) });

    if (!account) {
      throw new Unauthorized('Connect your GitHub account first');
    }

    return { login: account.login, token: decrypt(account.token) };
  };

  // get whether GitHub is set up on this server and connected for the user
  status = async (req: Request, res: Response) => {
    const account = await GithubAccount.findOne({ userId: currentUserId(req) });

    return Ok(res, 'GitHub status fetched successfully', {
      configured: Boolean(env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET),
      connected: Boolean(account),
      login: account?.login ?? null
    });
  };

  // get the GitHub authorize URL; the browser goes there, GitHub comes back to `callback`
  connect = async (req: Request, res: Response) => {
    if (!env.GITHUB_CLIENT_ID || !env.GITHUB_CLIENT_SECRET) {
      throw new BadRequest(
        'GitHub is not configured on this server (GITHUB_CLIENT_ID / GITHUB_CLIENT_SECRET)'
      );
    }

    // the callback carries no Authorization header, so who is connecting rides in a signed state;
    // the nonce cookie ties that state to this browser, so a link someone else started is useless
    const nonce = randomBytes(16).toString('hex');
    const state = jwt.sign(
      { userId: currentUserId(req), returnTo: safeReturnTo(req.query.returnTo), nonce },
      env.ACCESS_TOKEN_SECRET,
      { expiresIn: '10m' }
    );

    res.cookie(STATE_COOKIE, nonce, {
      httpOnly: true,
      secure: env.NODE_ENV === 'production',
      sameSite: 'lax', // sent on GitHub's top-level redirect back
      path: '/api/projects/github',
      maxAge: 10 * 60 * 1000
    });

    return Ok(res, 'Redirect to GitHub', { url: authorizeUrl(state) });
  };

  // GitHub's redirect after the user approved: store the token, send the browser back
  callback = async (req: Request, res: Response) => {
    let state: { userId: string; returnTo: string; nonce: string };
    try {
      state = jwt.verify(String(req.query.state), env.ACCESS_TOKEN_SECRET) as typeof state;
    } catch {
      throw new BadRequest('GitHub sign-in expired, please try again');
    }

    // only the browser that started this connect may finish it
    const nonce = (req.cookies as Record<string, string> | undefined)?.[STATE_COOKIE];
    res.clearCookie(STATE_COOKIE, { path: '/api/projects/github' });
    if (!nonce || nonce !== state.nonce) {
      throw new Forbidden(
        'This GitHub sign-in was not started from this browser, please try again'
      );
    }

    const back = new URL(safeReturnTo(state.returnTo), env.APP_URL);

    if (!req.query.code) {
      back.searchParams.set('github', 'cancelled');
      return res.redirect(back.toString());
    }

    const { token, login } = await exchangeCode(String(req.query.code));
    await GithubAccount.findOneAndUpdate(
      { userId: state.userId },
      { login, token: encrypt(token) },
      { upsert: true }
    );

    back.searchParams.set('github', 'connected');
    return res.redirect(back.toString());
  };

  // disconnect the user's GitHub account (the repos stay on GitHub)
  disconnect = async (req: Request, res: Response) => {
    await GithubAccount.deleteOne({ userId: currentUserId(req) });
    return NoContent(res);
  };

  // get the repo a project is linked to
  getLink = async (req: Request, res: Response) => {
    const project = await this.findOwnedProject(req);
    const link = project.github?.repo ? project.github : null;

    return Ok(res, 'GitHub link fetched successfully', {
      link,
      url: link ? `https://github.com/${link.owner}/${link.repo}` : null
    });
  };

  // push the project to GitHub in one click, creating the repo when it does not exist
  push = async (req: Request, res: Response) => {
    const project = await this.findOwnedProject(req);
    const { login, token } = await this.tokenOf(req);
    const projectId = project._id.toString();

    // the linked repo by default; a name in the body (re)links the project to that repo
    const name = String(req.body?.repo ?? project.github?.repo ?? '').trim();
    if (!REPO_NAME.test(name)) {
      throw new BadRequest('Repository name may only contain letters, digits, ".", "-" and "_"');
    }

    const repo = await ensureRepo(token, login, name);
    const files = await readPrefix(`${projectId}/`);

    if (!files.length) {
      throw new BadRequest('Nothing to push yet, open the workspace once so its files are saved');
    }

    const message = String(
      req.body?.message ||
        `Update from hateable (${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC)`
    );
    const pushed = await pushFiles(token, repo, files, message);

    project.github = { owner: repo.owner, repo: repo.repo, branch: repo.branch, sha: pushed.sha };
    await project.save();

    return Ok(res, pushed.changed ? `Pushed to ${repo.owner}/${repo.repo}` : 'Already up to date', {
      url: `https://github.com/${repo.owner}/${repo.repo}`,
      commitUrl: `https://github.com/${repo.owner}/${repo.repo}/commit/${pushed.sha}`,
      created: repo.created,
      changed: pushed.changed,
      files: files.length
    });
  };

  // pull what changed on GitHub into the workspace (aiService calls this before every agent run)
  pull = async (req: Request, res: Response) => {
    const project = await this.findOwnedProject(req);
    const link = project.github;

    if (!link?.repo || !link.owner || !link.branch) {
      return Ok(res, 'Not linked to GitHub', { linked: false, written: 0, deleted: 0 });
    }

    const { token } = await this.tokenOf(req);
    const changes = await changesSince(token, {
      owner: link.owner,
      repo: link.repo,
      branch: link.branch,
      sha: link.sha
    });

    // writing through the pod's file server, so the dev server reloads and the sync mirrors it
    const fileServer = `http://${project.serviceName}:8000`;
    for (let i = 0; i < changes.write.length; i += WRITE_BATCH) {
      const batch = changes.write.slice(i, i + WRITE_BATCH);
      const body = Object.fromEntries(
        batch.map((f) => [
          f.path,
          `data:application/octet-stream;base64,${f.body.toString('base64')}`
        ])
      );
      const r = await fetch(`${fileServer}/files`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      if (!r.ok)
        throw new BadRequest(`Could not write pulled files into the workspace (${r.status})`);
    }
    if (changes.remove.length) {
      await fetch(`${fileServer}/files?filenames=${encodeURIComponent(changes.remove.join(','))}`, {
        method: 'DELETE'
      });
    }

    project.github = { ...link, sha: changes.head };
    await project.save();

    return Ok(res, 'Pulled from GitHub', {
      linked: true,
      written: changes.write.length,
      deleted: changes.remove.length,
      sha: changes.head
    });
  };
}

export default GithubController;
