import { AnimatePresence, motion } from 'motion/react';
import {
  BarChart3,
  Check,
  Copy,
  ExternalLink,
  LoaderCircle,
  Moon,
  RefreshCw,
  Rocket,
  Trash2
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { deploymentsApi } from '../../api/projects.js';
import { withIngressPort } from '../../utils/ingressUrl.js';

const clock = (ms) => {
  const seconds = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
};

// One click: snapshot the workspace and serve it at <slug>.<DEPLOY_DOMAIN>.
export function DeployButton({ projectId }) {
  const [info, setInfo] = useState(null); // GET /deployment payload, { deployment: null } when never deployed
  const [isOpen, setIsOpen] = useState(false);
  const [busy, setBusy] = useState(''); // 'deploy' | 'remove'
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const rootRef = useRef(null);

  // the server sends "ms left", pin it to a wall-clock time so the countdown can tick locally
  const load = (payload) =>
    setInfo({ ...payload, sleepsAt: Date.now() + (payload.idleRemainingMs || 0) });

  useEffect(() => {
    deploymentsApi
      .get(projectId)
      .then(load)
      .catch(() => load({ deployment: null }));
  }, [projectId]);

  // tick the "sleeps in" countdown, refetch the status whenever the popover opens
  useEffect(() => {
    if (!isOpen) return undefined;
    deploymentsApi
      .get(projectId)
      .then(load)
      .catch(() => {});
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [isOpen, projectId]);

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

  async function deploy() {
    setBusy('deploy');
    setError('');
    try {
      load(await deploymentsApi.deploy(projectId));
      setIsOpen(true);
    } catch (e) {
      setError(e.message);
      setIsOpen(true);
    } finally {
      setBusy('');
    }
  }

  async function remove() {
    if (
      !window.confirm('Unpublish this site? The link stops working and its analytics are deleted.')
    )
      return;
    setBusy('remove');
    setError('');
    try {
      await deploymentsApi.remove(projectId);
      load({ deployment: null });
      setIsOpen(false);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy('');
    }
  }

  async function copy(url) {
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  const deployment = info?.deployment;
  const url = withIngressPort(info?.url);
  const remaining = info ? info.sleepsAt - now : 0;
  const isLive = info?.status === 'live' && remaining > 0;

  if (!info) return null;

  if (!deployment) {
    return (
      <div ref={rootRef} className="relative">
        <button
          type="button"
          onClick={deploy}
          disabled={Boolean(busy)}
          className="flex h-8 items-center gap-1.5 rounded-full bg-gradient-to-r from-[#ff7a45] via-accent to-[#8b5cf6] px-3.5 text-xs font-medium text-white shadow-lg shadow-accent/20 transition hover:brightness-110 active:scale-95 disabled:opacity-70"
        >
          {busy ? (
            <LoaderCircle className="size-3.5 animate-spin" />
          ) : (
            <Rocket className="size-3.5" />
          )}
          {busy ? 'Deploying…' : 'Deploy'}
        </button>
        {error && isOpen && (
          <p
            role="alert"
            className="absolute top-10 right-0 z-30 w-64 rounded-xl border border-red-500/30 bg-panel px-3 py-2 text-xs text-red-200 shadow-xl"
          >
            {error}
          </p>
        )}
      </div>
    );
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setIsOpen((open) => !open)}
        aria-expanded={isOpen}
        className="flex h-8 items-center gap-1.5 rounded-full border border-line bg-ink px-3 text-xs text-white/80 transition hover:bg-white/5"
      >
        {busy ? (
          <LoaderCircle className="size-3.5 animate-spin" />
        ) : isLive ? (
          <span className="size-1.5 animate-pulse rounded-full bg-emerald-400" />
        ) : (
          <Moon className="size-3.5 text-white/40" />
        )}
        {busy === 'deploy' ? 'Deploying…' : isLive ? 'Live' : 'Asleep'}
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.97 }}
            transition={{ type: 'spring', damping: 26, stiffness: 400 }}
            className="absolute top-10 right-0 z-30 w-80 overflow-hidden rounded-2xl border border-white/10 bg-panel p-4 shadow-2xl shadow-black/60"
          >
            <div className="hero-glow pointer-events-none absolute -top-24 left-1/2 h-32 w-[120%] -translate-x-1/2 opacity-20" />

            <div className="relative">
              <p className="text-[11px] tracking-wide text-white/40 uppercase">
                Deployed · v{deployment.version}
              </p>
              <div className="mt-2 flex items-center gap-1 rounded-lg border border-line bg-ink py-1 pr-1 pl-3">
                <a
                  href={url}
                  target="_blank"
                  rel="noreferrer"
                  className="min-w-0 flex-1 truncate font-mono text-[11px] text-white/80 hover:text-white"
                >
                  {url.replace(/^https?:\/\//, '')}
                </a>
                <button
                  type="button"
                  onClick={() => copy(url)}
                  className="grid size-7 place-items-center rounded text-white/45 hover:bg-white/8 hover:text-white"
                  aria-label="Copy link"
                  title="Copy link"
                >
                  {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
                </button>
                <a
                  href={url}
                  target="_blank"
                  rel="noreferrer"
                  className="grid size-7 place-items-center rounded text-white/45 hover:bg-white/8 hover:text-white"
                  aria-label="Open site"
                  title="Open site"
                >
                  <ExternalLink className="size-3.5" />
                </a>
              </div>

              <p className="mt-3 flex items-center gap-2 text-xs text-white/55">
                {isLive ? (
                  <>
                    <span className="size-1.5 rounded-full bg-emerald-400" />
                    Live · naps in{' '}
                    <span className="font-mono text-white/80">{clock(remaining)}</span> without
                    visitors
                  </>
                ) : (
                  <>
                    <Moon className="size-3 text-white/40" /> Asleep · wakes on the next visit
                  </>
                )}
              </p>
              <p className="mt-1 text-[11px] text-white/30">
                Every visit resets the {Math.round(info.idleTimeoutMs / 60000)} minute timer.
              </p>

              {error && (
                <p role="alert" className="mt-3 text-xs text-red-300">
                  {error}
                </p>
              )}

              <div className="mt-4 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={deploy}
                  disabled={Boolean(busy)}
                  className="flex h-8 items-center justify-center gap-1.5 rounded-full bg-white text-xs font-medium text-black transition hover:bg-white/90 disabled:opacity-60"
                >
                  <RefreshCw className={`size-3.5 ${busy === 'deploy' ? 'animate-spin' : ''}`} />
                  {busy === 'deploy' ? 'Deploying…' : 'Redeploy'}
                </button>
                <Link
                  to={`/projects/${projectId}/analytics`}
                  className="flex h-8 items-center justify-center gap-1.5 rounded-full border border-line text-xs text-white/80 transition hover:bg-white/5"
                >
                  <BarChart3 className="size-3.5" /> Analytics
                </Link>
              </div>
              <button
                type="button"
                onClick={remove}
                disabled={Boolean(busy)}
                className="mt-3 flex w-full items-center justify-center gap-1.5 text-[11px] text-white/35 transition hover:text-red-300 disabled:opacity-60"
              >
                <Trash2 className="size-3" /> {busy === 'remove' ? 'Unpublishing…' : 'Unpublish'}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
