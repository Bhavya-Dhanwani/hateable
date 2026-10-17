import { ArrowUpRight } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';
import { deploymentsApi } from '../../api/projects.js';
import { withIngressPort } from '../../utils/ingressUrl.js';
import { PageHeader } from './DeploymentLayout.jsx';
import { useDeployment } from './deployment-context.js';

const number = new Intl.NumberFormat();
const LEVEL_DOT = { error: 'bg-red-400', warn: 'bg-amber-400', info: 'bg-white/20' };
const when = (at) =>
  new Date(at).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
const clock = (ms) => {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

function Fact({ label, children }) {
  return (
    <div className="py-3">
      <dt className="text-xs text-white/40">{label}</dt>
      <dd className="mt-1 text-sm text-white/85">{children}</dd>
    </div>
  );
}

// The deployment at a glance: where it lives, its state, today's numbers, what happened last.
export function OverviewPage() {
  const { projectId } = useParams();
  const { info, url } = useDeployment();
  const [domains, setDomains] = useState([]);
  const [stats, setStats] = useState(null);
  const [events, setEvents] = useState([]);

  useEffect(() => {
    deploymentsApi
      .domains(projectId)
      .then(setDomains)
      .catch(() => {});
    deploymentsApi
      .analytics(projectId, 1)
      .then((d) => setStats(d.analytics))
      .catch(() => {});
    deploymentsApi
      .logs(projectId)
      .then((d) => setEvents(d.events.slice(0, 6)))
      .catch(() => {});
  }, [projectId]);

  const live = domains.filter((d) => d.verified);
  const today = stats?.daily.at(-1);

  return (
    <>
      <PageHeader title="Overview" description="Your site at a glance." />

      <dl className="mt-6 grid gap-x-10 border-y border-line sm:grid-cols-2">
        <Fact label="Status">
          {info.status === 'live' ? (
            <>
              Live · naps in <span className="font-mono">{clock(info.idleRemainingMs)}</span>{' '}
              without visitors
            </>
          ) : (
            'Asleep · wakes on the next visit'
          )}
        </Fact>
        <Fact label="Deployed">
          v{info.deployment.version} · {when(info.deployment.deployedAt)}
        </Fact>
        <Fact label="Addresses">
          <ul className="space-y-1">
            {[url, ...live.map((d) => withIngressPort(d.url))].map((address) => (
              <li key={address}>
                <a
                  href={address}
                  target="_blank"
                  rel="noreferrer"
                  className="group inline-flex items-center gap-1 font-mono text-xs hover:text-white"
                >
                  {address.replace(/^https?:\/\//, '')}
                  <ArrowUpRight className="size-3 opacity-40 group-hover:opacity-100" />
                </a>
              </li>
            ))}
          </ul>
          <Link to="domains" className="mt-2 inline-block text-xs text-white/40 hover:text-white">
            {domains.length > live.length
              ? `${domains.length - live.length} domain(s) waiting for DNS`
              : 'Connect your own domain'}
          </Link>
        </Fact>
        <Fact label="Today">
          {today ? (
            <>
              {number.format(today.visitors)} visitors · {number.format(today.views)} views ·{' '}
              {number.format(stats.liveVisitors)} live now
            </>
          ) : (
            '—'
          )}
          <Link to="analytics" className="mt-2 block text-xs text-white/40 hover:text-white">
            See analytics
          </Link>
        </Fact>
      </dl>

      <section className="mt-10">
        <h2 className="flex justify-between border-b border-line pb-2 text-xs text-white/40">
          <span>Recent activity</span>
          <Link to="logs" className="hover:text-white">
            All logs
          </Link>
        </h2>
        {events.length === 0 ? (
          <p className="py-3 text-xs text-white/25">No activity yet</p>
        ) : (
          <ul className="mt-1">
            {events.map((e, i) => (
              <li key={`${e.at}-${i}`} className="flex gap-2.5 py-1.5 text-[13px]">
                <span className={`mt-1.5 size-1.5 shrink-0 rounded-full ${LEVEL_DOT[e.level]}`} />
                <span className="min-w-0 flex-1 text-white/75">{e.message}</span>
                <span className="shrink-0 text-[11px] text-white/25 tabular-nums">
                  {when(e.at)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
