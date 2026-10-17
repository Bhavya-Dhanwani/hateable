import { AnimatePresence, motion } from 'motion/react';
import { ExternalLink, Github, LoaderCircle, Unplug, UploadCloud } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { githubApi } from '../../api/projects.js';

// "My App!" -> "my-app": a valid GitHub repo name to suggest
const repoNameFrom = (name) =>
  (name || 'hateable-project')
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 100) || 'hateable-project';

// Connect GitHub once, then push the project to a repo (created if missing) in one click.
export function GitHubButton({ projectId, projectName }) {
  const [status, setStatus] = useState(null); // { configured, connected, login }
  const [link, setLink] = useState(null); // { link, url } of the repo this project pushes to
  const [isOpen, setIsOpen] = useState(false);
  const [repo, setRepo] = useState('');
  const [busy, setBusy] = useState('');
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const rootRef = useRef(null);

  useEffect(() => {
    Promise.all([githubApi.status(), githubApi.link(projectId)])
      .then(([s, l]) => {
        setStatus(s);
        setLink(l);
        setRepo(l.link?.repo || repoNameFrom(projectName));
        // back from GitHub's authorize page: open the popover so the push is one click away
        const params = new URLSearchParams(location.search);
        if (params.get('github')) {
          setIsOpen(true);
          if (params.get('github') === 'cancelled') setError('GitHub connection was cancelled.');
          params.delete('github');
          history.replaceState(null, '', `${location.pathname}${params.size ? `?${params}` : ''}`);
        }
      })
      .catch(() => setStatus({ configured: false, connected: false }));
  }, [projectId, projectName]);

  useEffect(() => {
    if (!isOpen) return undefined;
    const close = (event) => {
      if (
        event.key === 'Escape' ||
        (event.type === 'mousedown' && !rootRef.current?.contains(event.target))
      )
        setIsOpen(false);
    };
    window.addEventListener('mousedown', close);
    window.addEventListener('keydown', close);
    return () => {
      window.removeEventListener('mousedown', close);
      window.removeEventListener('keydown', close);
    };
  }, [isOpen]);

  async function connect() {
    setBusy('connect');
    setError('');
    try {
      window.location.href = await githubApi.connectUrl(`/projects/${projectId}`);
    } catch (e) {
      setError(e.message);
      setIsOpen(true);
      setBusy('');
    }
  }

  async function push(event) {
    event.preventDefault();
    setBusy('push');
    setError('');
    setResult(null);
    try {
      const pushed = await githubApi.push(projectId, repo.trim());
      setResult(pushed);
      setLink({ link: { repo: repo.trim() }, url: pushed.url });
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy('');
    }
  }

  async function disconnect() {
    if (!window.confirm('Disconnect GitHub? Your repositories stay on GitHub.')) return;
    await githubApi.disconnect().catch(() => {});
    setStatus((s) => ({ ...s, connected: false, login: null }));
    setResult(null);
  }

  if (!status) return null;

  const notConfigured = !status.configured;

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => (status.connected ? setIsOpen((o) => !o) : connect())}
        disabled={notConfigured || busy === 'connect'}
        title={
          notConfigured
            ? 'GitHub is not configured on this server (GITHUB_CLIENT_ID / GITHUB_CLIENT_SECRET)'
            : status.connected
              ? `Push to GitHub as ${status.login}`
              : 'Connect GitHub'
        }
        aria-expanded={isOpen}
        className="flex h-8 items-center gap-1.5 rounded-full border border-line bg-ink px-3 text-xs text-white/80 transition hover:bg-white/5 disabled:opacity-40"
      >
        {busy === 'connect' ? (
          <LoaderCircle className="size-3.5 animate-spin" />
        ) : (
          <Github className="size-3.5" />
        )}
        <span className="hidden sm:inline">{status.connected ? 'GitHub' : 'Connect'}</span>
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.97 }}
            transition={{ type: 'spring', damping: 26, stiffness: 400 }}
            className="absolute top-10 right-0 z-30 w-80 rounded-2xl border border-white/10 bg-panel p-4 text-xs shadow-2xl shadow-black/60"
          >
            {status.connected ? (
              <form onSubmit={push}>
                <p className="flex items-center justify-between text-white/40">
                  <span>
                    Signed in as <span className="text-white/80">{status.login}</span>
                  </span>
                  <button
                    type="button"
                    onClick={disconnect}
                    title="Disconnect GitHub"
                    className="grid size-6 place-items-center rounded text-white/35 hover:bg-white/8 hover:text-red-300"
                  >
                    <Unplug className="size-3.5" />
                  </button>
                </p>

                <label htmlFor="github-repo" className="mt-3 block text-white/55">
                  Repository
                </label>
                <div className="mt-1.5 flex items-center rounded-lg border border-line bg-ink pl-3 focus-within:border-white/25">
                  <span className="text-white/35">{status.login}/</span>
                  <input
                    id="github-repo"
                    value={repo}
                    onChange={(e) => setRepo(e.target.value)}
                    pattern="[A-Za-z0-9._\-]{1,100}"
                    required
                    className="h-8 min-w-0 flex-1 bg-transparent pr-3 font-mono text-white outline-none"
                  />
                </div>
                <p className="mt-1.5 text-[11px] text-white/30">
                  Pushes to it if it exists, otherwise creates it as a private repo.
                </p>

                {error && (
                  <p role="alert" className="mt-3 text-red-300">
                    {error}
                  </p>
                )}
                {result && (
                  <a
                    href={result.commitUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-3 flex items-center gap-1.5 text-emerald-300 hover:underline"
                  >
                    {result.changed
                      ? `${result.created ? 'Created and pushed' : 'Pushed'} ${result.files} files`
                      : 'Already up to date'}
                    <ExternalLink className="size-3" />
                  </a>
                )}

                <div className="mt-4 flex items-center gap-2">
                  <button
                    type="submit"
                    disabled={busy === 'push'}
                    className="flex h-8 flex-1 items-center justify-center gap-1.5 rounded-full bg-white font-medium text-black transition hover:bg-white/90 disabled:opacity-60"
                  >
                    {busy === 'push' ? (
                      <LoaderCircle className="size-3.5 animate-spin" />
                    ) : (
                      <UploadCloud className="size-3.5" />
                    )}
                    {busy === 'push' ? 'Pushing…' : 'Push to GitHub'}
                  </button>
                  {link?.url && (
                    <a
                      href={link.url}
                      target="_blank"
                      rel="noreferrer"
                      title="Open the repository"
                      className="grid size-8 place-items-center rounded-full border border-line text-white/60 hover:bg-white/5 hover:text-white"
                    >
                      <ExternalLink className="size-3.5" />
                    </a>
                  )}
                </div>
                <p className="mt-3 text-[11px] text-white/30">
                  Before every AI run, changes made on GitHub are pulled in first.
                </p>
              </form>
            ) : (
              <p role="alert" className="text-red-300">
                {error || 'Connect GitHub to push this project.'}
              </p>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
