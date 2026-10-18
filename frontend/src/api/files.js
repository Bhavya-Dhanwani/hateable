import { apiRequest } from './client.js';
import { fileKind, normalizeFilePath } from '../utils/fileTree.js';

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
  // the file's real bytes, for <img src> and downloads (the text API would garble binaries)
  rawUrl: (projectId, path) =>
    `/runtime/${encodeURIComponent(projectId)}/raw?${new URLSearchParams({ path })}`,
  async readAsDataUrl(projectId, path) {
    const response = await fetch(this.rawUrl(projectId, path));
    if (!response.ok) throw new Error(`Could not read ${path} (${response.status})`);
    const blob = await response.blob();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
  },
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

    // text files move as text; images and other binaries move as bytes (a data URL the file
    // server decodes), reading them as utf8 text would corrupt them
    const textPaths = affected.filter((p) => fileKind(p) === 'text');
    const binaryPaths = affected.filter((p) => fileKind(p) !== 'text');
    const current = {
      ...(textPaths.length ? await this.read(projectId, textPaths) : {}),
      ...Object.fromEntries(
        await Promise.all(binaryPaths.map(async (p) => [p, await this.readAsDataUrl(projectId, p)]))
      )
    };
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
