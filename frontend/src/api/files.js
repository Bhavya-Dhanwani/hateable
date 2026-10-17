import { apiRequest } from './client.js';
import { normalizeFilePath } from '../utils/fileTree.js';

// Pod file server (express-file-server), reached through the Vite /runtime proxy.
const runtime = (projectId, path, options) =>
  apiRequest(`/runtime/${encodeURIComponent(projectId)}${path}`, { ...options, auth: false });

const filesQuery = (paths) => `?${new URLSearchParams({ filenames: paths.join(',') })}`;

export const filesApi = {
  async tree(projectId) {
    const { tree } = await runtime(projectId, '/file-tree');
    return tree
      .split('\n')
      .map((p) => p.trim())
      .filter(Boolean)
      .map(normalizeFilePath);
  },
  read: (projectId, paths) => runtime(projectId, `/files${filesQuery(paths)}`).then((r) => r.files),
  create: (projectId, files) =>
    runtime(projectId, '/files', { method: 'POST', body: JSON.stringify(files) }),
  update: (projectId, files) =>
    runtime(projectId, '/files', { method: 'PATCH', body: JSON.stringify(files) }),
  remove: (projectId, paths) =>
    runtime(projectId, `/files${filesQuery(paths)}`, { method: 'DELETE' }),
  createFolder(projectId, path) {
    return this.create(projectId, { [`${normalizeFilePath(path)}/.gitkeep`]: '' });
  },
  async relocate(projectId, sourcePath, destinationPath, allPaths) {
    const source = normalizeFilePath(sourcePath);
    const destination = normalizeFilePath(destinationPath);
    const affected = allPaths.filter((p) => p === source || p.startsWith(`${source}/`));
    if (!affected.length) throw new Error(`No files found at ${source}`);

    const current = await this.read(projectId, affected);
    const moved = Object.fromEntries(
      Object.entries(current).map(([p, content]) => [
        `${destination}${p.slice(source.length)}`,
        content
      ])
    );
    await this.create(projectId, moved);
    await this.remove(projectId, affected);
  }
};
