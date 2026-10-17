import {
  ArrowLeft,
  ArrowUpRight,
  BarChart3,
  Globe,
  KeyRound,
  LayoutDashboard,
  ScrollText,
  Sparkles
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useParams } from 'react-router';
import { deploymentsApi } from '../../api/projects.js';
import { LoadingScreen } from '../../components/LoadingScreen.jsx';
import { withIngressPort } from '../../utils/ingressUrl.js';

// every deployment page, in sidebar order: one job per page
const SECTIONS = [
  { to: '', label: 'Overview', icon: LayoutDashboard, end: true },
  { to: 'analytics', label: 'Analytics', icon: BarChart3 },
  { to: 'logs', label: 'Logs', icon: ScrollText },
  { to: 'domains', label: 'Domains', icon: Globe },
  { to: 'environment', label: 'Environment', icon: KeyRound },
  { to: 'assistant', label: 'Ask AI', icon: Sparkles }
];

// the title row every deployment page starts with
export function PageHeader({ title, description, children }) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-lg font-medium tracking-tight">{title}</h1>
        {description && <p className="mt-1 text-sm text-white/40">{description}</p>}
      </div>
      {children}
    </header>
  );
}

// a quiet loading / error line inside a page
export const PageMessage = ({ children }) => (
  <p className="py-10 text-sm text-white/40">{children}</p>
);

export function DeploymentLayout() {
  const { projectId } = useParams();
  const [info, setInfo] = useState(null);
  const [error, setError] = useState('');

  const reload = useCallback(
    () =>
      deploymentsApi
        .get(projectId)
        .then((next) => {
          setInfo(next);
          setError('');
        })
        .catch((e) => setError(e.message)),
    [projectId]
  );

  // status changes on its own (sleep / wake), so keep it fresh
  useEffect(() => {
    reload();
    const timer = setInterval(reload, 15_000);
    return () => clearInterval(timer);
  }, [reload]);

  if (!info && !error) return <LoadingScreen label="Loading your deployment" />;

  if (!info?.deployment) {
    return (
      <main className="grid min-h-svh place-items-center bg-ink px-5 text-center text-sm">
        <div>
          <p className="text-white">
            {error ? 'Could not load the deployment' : 'Not deployed yet'}
          </p>
          <p className="mt-1 text-white/40">
            {error || 'Use the Deploy button in the workspace first.'}
          </p>
          <Link
            to={`/projects/${projectId}`}
            className="mt-4 inline-block text-white/60 underline decoration-white/20 underline-offset-4 hover:text-white"
          >
            Back to the workspace
          </Link>
        </div>
      </main>
    );
  }

  const url = withIngressPort(info.url);
  const isLive = info.status === 'live';

  return (
    <main className="min-h-svh bg-ink text-white">
      <div className="mx-auto max-w-5xl px-5 py-8 sm:py-12">
        <header className="border-b border-line pb-6">
          <Link
            to={`/projects/${projectId}`}
            className="inline-flex items-center gap-1.5 text-xs text-white/40 transition-colors hover:text-white"
          >
            <ArrowLeft className="size-3.5" /> Workspace
          </Link>
          <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1">
            <h1 className="text-xl font-medium tracking-tight">{info.deployment.slug}</h1>
            <span className="flex items-center gap-1.5 text-xs text-white/45">
              <span
                className={`size-1.5 rounded-full ${isLive ? 'bg-emerald-400' : 'bg-white/25'}`}
              />
              {isLive ? 'Live' : 'Asleep'} · v{info.deployment.version}
            </span>
          </div>
          <a
            href={url}
            target="_blank"
            rel="noreferrer"
            className="group mt-1 inline-flex max-w-full items-center gap-1 font-mono text-xs text-white/40 transition-colors hover:text-white"
          >
            <span className="truncate">{url.replace(/^https?:\/\//, '')}</span>
            <ArrowUpRight className="size-3 opacity-0 transition-opacity group-hover:opacity-100" />
          </a>
        </header>

        <div className="mt-6 gap-10 sm:grid sm:grid-cols-[10rem_minmax(0,1fr)]">
          {/* a sidebar on desktop, a scrollable tab row on phones */}
          <nav
            aria-label="Deployment"
            className="-mx-5 flex gap-1 overflow-x-auto px-5 pb-4 [scrollbar-width:none] sm:mx-0 sm:flex-col sm:px-0"
          >
            {SECTIONS.map(({ to, label, icon: Icon, end }) => (
              <NavLink
                key={label}
                to={to}
                end={end}
                className={({ isActive }) =>
                  `flex h-8 shrink-0 items-center gap-2 rounded-md px-2.5 text-[13px] transition-colors ${
                    isActive ? 'bg-white/[0.08] text-white' : 'text-white/45 hover:text-white'
                  }`
                }
              >
                <Icon className="size-3.5" />
                {label}
              </NavLink>
            ))}
          </nav>

          <div className="min-w-0">
            <Outlet context={{ info, reload, url }} />
          </div>
        </div>
      </div>
    </main>
  );
}
