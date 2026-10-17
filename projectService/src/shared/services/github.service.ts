// Importing modules
import env from '../config/env.config.js';
import ApiError from '../utils/ApiError.util.js';

/**
 * GitHub for hateable projects, through the REST API only (no git binary, no clone):
 *
 * - push: the project's S3 mirror (what the sync container uploads, node_modules never included)
 *   becomes one commit: blobs -> a tree with exactly those files -> a commit on the branch head.
 *   The token stays in projectService; it never enters the user's pod, where their code runs.
 * - pull: the files that changed on GitHub since the last synced commit (compare API) are
 *   written into / deleted from the workspace through the pod's file server.
 */

export type RepoLink = { owner: string; repo: string; branch: string; sha?: string | null };
export type ProjectFile = { path: string; body: Buffer };

// GitHub repository names: letters, digits, '.', '-', '_' (max 100)
export const REPO_NAME = /^[A-Za-z0-9._-]{1,100}$/;

// blobs are uploaded this many at a time
const CONCURRENCY = 8;

// paths that never belong in a repo or a workspace sync
const SKIPPED = /(^|\/)(node_modules|\.git|\.next|dist|build)\//;

// function to call the GitHub REST API with a user's token
async function gh<T = any>(token: string, method: string, path: string, body?: unknown) {
  const res = await fetch(`https://api.github.com${path}`, {
    method,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'hateable',
      ...(body ? { 'Content-Type': 'application/json' } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  });
  const json = (await res.json().catch(() => ({}))) as T & { message?: string };
  return { status: res.status, json };
}

// function to fail with GitHub's own message, which usually says exactly what is wrong
function expect<T>(
  r: { status: number; json: T & { message?: string } },
  ok: number[],
  what: string
) {
  if (!ok.includes(r.status)) {
    throw new ApiError(
      r.status === 401 ? 401 : 502,
      `GitHub ${what} failed (${r.status}): ${r.json.message ?? 'unknown error'}`
    );
  }
  return r.json;
}

// function to run async work over a list with limited parallelism, keeping the order
async function mapLimit<I, O>(items: I[], limit: number, fn: (item: I) => Promise<O>) {
  const out: O[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i]);
      }
    })
  );
  return out;
}

// ---- OAuth ----

// function to build the "Authorize hateable" page URL
export function authorizeUrl(state: string) {
  const params = new URLSearchParams({
    client_id: env.GITHUB_CLIENT_ID,
    redirect_uri: `${env.APP_URL}/api/projects/github/callback`,
    scope: 'repo', // create repos and push to private ones
    state
  });
  return `https://github.com/login/oauth/authorize?${params}`;
}

// function to trade the callback code for an access token and the account it belongs to
export async function exchangeCode(code: string) {
  const res = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: env.GITHUB_CLIENT_ID,
      client_secret: env.GITHUB_CLIENT_SECRET,
      code
    })
  });
  const body = (await res.json()) as { access_token?: string; error_description?: string };
  if (!body.access_token) {
    throw new ApiError(
      400,
      `GitHub sign-in failed: ${body.error_description ?? 'no token returned'}`
    );
  }

  const user = expect(
    await gh<{ login: string }>(body.access_token, 'GET', '/user'),
    [200],
    'user lookup'
  );
  return { token: body.access_token, login: user.login };
}

// ---- repos ----

// function to return the head commit of a branch, creating a first commit if the repo is empty
async function headOf(token: string, link: RepoLink) {
  const ref = await gh(
    token,
    'GET',
    `/repos/${link.owner}/${link.repo}/git/ref/heads/${link.branch}`
  );
  if (ref.status === 200) return ref.json.object.sha as string;

  // an empty repo has no branch yet, and the Git Data API refuses to work on it
  expect(
    await gh(token, 'PUT', `/repos/${link.owner}/${link.repo}/contents/README.md`, {
      message: 'Initial commit',
      content: Buffer.from(`# ${link.repo}\n\nBuilt with hateable.\n`).toString('base64'),
      branch: link.branch
    }),
    [201],
    'initial commit'
  );
  const created = await gh(
    token,
    'GET',
    `/repos/${link.owner}/${link.repo}/git/ref/heads/${link.branch}`
  );
  return expect(created, [200], 'branch lookup').object.sha as string;
}

/**
 * Finds `login/name`, or creates it as a private repo when it does not exist yet.
 */
export async function ensureRepo(token: string, login: string, name: string) {
  const found = await gh(token, 'GET', `/repos/${login}/${name}`);
  if (found.status === 200) {
    return {
      owner: login,
      repo: name,
      branch: found.json.default_branch as string,
      created: false
    };
  }
  expect(found, [404], 'repo lookup');

  const created = expect(
    await gh(token, 'POST', '/user/repos', {
      name,
      private: true,
      auto_init: true,
      description: 'Built with hateable'
    }),
    [201],
    'repo creation'
  );
  return { owner: login, repo: name, branch: created.default_branch as string, created: true };
}

/**
 * Pushes the project's files as one commit on top of the branch head. The commit's tree is
 * exactly `files`, so files deleted in the workspace are deleted in the repo as well.
 *
 * @returns the new commit sha, or the current head with changed=false when nothing differs
 */
export async function pushFiles(
  token: string,
  link: RepoLink,
  files: ProjectFile[],
  message: string
) {
  const base = `/repos/${link.owner}/${link.repo}`;
  const head = await headOf(token, link);
  const headTree = expect(
    await gh(token, 'GET', `${base}/git/commits/${head}`),
    [200],
    'head lookup'
  ).tree.sha;

  const kept = files.filter((f) => !SKIPPED.test(f.path));
  const blobs = await mapLimit(
    kept,
    CONCURRENCY,
    async (file) =>
      expect(
        await gh(token, 'POST', `${base}/git/blobs`, {
          content: file.body.toString('base64'),
          encoding: 'base64'
        }),
        [201],
        `upload of ${file.path}`
      ).sha as string
  );

  const tree = expect(
    await gh(token, 'POST', `${base}/git/trees`, {
      tree: kept.map((file, i) => ({
        path: file.path,
        mode: '100644',
        type: 'blob',
        sha: blobs[i]
      }))
    }),
    [201],
    'tree creation'
  ).sha as string;

  if (tree === headTree) return { sha: head, changed: false };

  const commit = expect(
    await gh(token, 'POST', `${base}/git/commits`, { message, tree, parents: [head] }),
    [201],
    'commit'
  ).sha as string;

  // fast-forward only: if someone pushed meanwhile GitHub refuses, and nothing is lost
  expect(
    await gh(token, 'PATCH', `${base}/git/refs/heads/${link.branch}`, {
      sha: commit,
      force: false
    }),
    [200],
    'branch update'
  );
  return { sha: commit, changed: true };
}

/**
 * The changes on GitHub since `link.sha`, as files to write (with their bytes) and paths to delete.
 * Falls back to every file of the head when the history cannot be compared (force push, 300+ files).
 */
export async function changesSince(token: string, link: RepoLink) {
  const base = `/repos/${link.owner}/${link.repo}`;
  const head = await headOf(token, link);
  if (head === link.sha) return { head, write: [] as ProjectFile[], remove: [] as string[] };

  const blob = async (sha: string) =>
    Buffer.from(
      expect(await gh(token, 'GET', `${base}/git/blobs/${sha}`), [200], 'blob download').content,
      'base64'
    );

  const compare = link.sha ? await gh(token, 'GET', `${base}/compare/${link.sha}...${head}`) : null;
  const diffable = compare?.status === 200 && (compare.json.files?.length ?? 0) < 300;

  let toWrite: Array<{ path: string; sha: string }>;
  const remove: string[] = [];

  if (diffable) {
    toWrite = [];
    for (const f of compare!.json.files as Array<{
      filename: string;
      status: string;
      sha: string;
      previous_filename?: string;
    }>) {
      if (f.status === 'removed') remove.push(f.filename);
      else toWrite.push({ path: f.filename, sha: f.sha });
      if (f.status === 'renamed' && f.previous_filename) remove.push(f.previous_filename);
    }
  } else {
    // ponytail: full fallback writes every file but cannot know which local files to delete
    const tree = expect(
      await gh(token, 'GET', `${base}/git/trees/${head}?recursive=1`),
      [200],
      'tree download'
    );
    toWrite = (tree.tree as Array<{ path: string; type: string; sha: string }>)
      .filter((entry) => entry.type === 'blob')
      .map((entry) => ({ path: entry.path, sha: entry.sha }));
  }

  const kept = toWrite.filter((f) => !SKIPPED.test(f.path));
  const write = await mapLimit(kept, CONCURRENCY, async (f) => ({
    path: f.path,
    body: await blob(f.sha)
  }));

  return { head, write, remove: remove.filter((p) => !SKIPPED.test(p)) };
}
