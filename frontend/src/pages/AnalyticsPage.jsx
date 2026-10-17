import { ArrowLeft, ArrowUpRight } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';
import { deploymentsApi } from '../api/projects.js';
import { LoadingScreen } from '../components/LoadingScreen.jsx';
import { withIngressPort } from '../utils/ingressUrl.js';

const RANGES = [7, 14, 30];
const REFRESH_MS = 10_000;
const number = new Intl.NumberFormat();
const compact = new Intl.NumberFormat(undefined, { notation: 'compact' });
const shortDate = (date) =>
  new Date(`${date}T00:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

function Metric({ label, value, live = false }) {
  return (
    <div className="py-4 sm:px-5 sm:first:pl-0">
      <dt className="flex items-center gap-1.5 text-xs text-white/40">
        {live && <span className="size-1.5 rounded-full bg-emerald-400" />}
        {label}
      </dt>
      <dd className="mt-1 text-2xl font-medium tracking-tight tabular-nums">{value}</dd>
    </div>
  );
}

// Page views per day: one series, so the heading names it and there is no legend.
function DailyChart({ daily }) {
  const [hovered, setHovered] = useState(null);
  const max = Math.max(1, ...daily.map((d) => d.views));
  const active = daily[hovered ?? daily.length - 1];

  return (
    <section>
      <div className="flex items-baseline justify-between text-xs">
        <h2 className="text-white/40">Page views</h2>
        {/* the readout doubles as the tooltip: hovered day, or today */}
        <p className="text-white/40 tabular-nums">
          <span className="text-white">{number.format(active.views)}</span> views ·{' '}
          {number.format(active.visitors)} visitors · {shortDate(active.date)}
        </p>
      </div>

      <div
        className="mt-4 flex h-40 items-end gap-[2px]"
        onMouseLeave={() => setHovered(null)}
        role="img"
        aria-label={`Page views per day, ${daily.length} days, peak ${max}`}
      >
        {daily.map((d, i) => (
          // the whole column is the hit target, not just the bar
          <div
            key={d.date}
            className="flex h-full flex-1 items-end"
            onMouseEnter={() => setHovered(i)}
          >
            <div
              className={`w-full rounded-t-[3px] transition-colors duration-150 ${
                hovered === i ? 'bg-white' : 'bg-white/15'
              }`}
              style={{ height: `${(d.views / max) * 100}%`, minHeight: d.views ? 2 : 1 }}
            />
          </div>
        ))}
      </div>

      <div className="mt-2 flex justify-between text-[11px] text-white/25 tabular-nums">
        <span>{shortDate(daily[0].date)}</span>
        <span>{shortDate(daily.at(-1).date)}</span>
      </div>

      {/* table view of the same numbers for screen readers */}
      <table className="sr-only">
        <caption>Page views per day</caption>
        <thead>
          <tr>
            <th>Day</th>
            <th>Views</th>
            <th>Visitors</th>
          </tr>
        </thead>
        <tbody>
          {daily.map((d) => (
            <tr key={d.date}>
              <td>{d.date}</td>
              <td>{d.views}</td>
              <td>{d.visitors}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

// Plausible-style list: the share sits as a faint bar behind each row, the number stays in text ink.
function List({ title, rows, empty }) {
  const max = Math.max(1, ...rows.map((r) => r.count));

  return (
    <section>
      <h2 className="flex justify-between border-b border-line pb-2 text-xs text-white/40">
        <span>{title}</span>
        <span>Views</span>
      </h2>
      {rows.length === 0 ? (
        <p className="py-3 text-xs text-white/25">{empty}</p>
      ) : (
        <ul className="mt-1">
          {rows.slice(0, 6).map((row) => (
            <li
              key={row.name}
              className="relative flex h-8 items-center justify-between gap-3 px-2 text-[13px]"
            >
              <span
                className="absolute inset-y-1 left-0 rounded-[4px] bg-white/[0.05]"
                style={{ width: `${(row.count / max) * 100}%` }}
              />
              <span className="relative truncate text-white/80">{row.name}</span>
              <span className="relative text-white/50 tabular-nums">
                {compact.format(row.count)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

const fromCounts = (counts) =>
  Object.entries(counts)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);

export function AnalyticsPage() {
  const { projectId } = useParams();
  const [days, setDays] = useState(14);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  // poll so "live" and today's numbers move while the page is open
  useEffect(() => {
    let active = true;
    const load = () =>
      deploymentsApi
        .analytics(projectId, days)
        .then((next) => {
          if (!active) return;
          setData(next);
          setError('');
        })
        .catch((e) => active && setError(e.message));
    load();
    const timer = setInterval(load, REFRESH_MS);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [projectId, days]);

  if (!data && !error) return <LoadingScreen label="Loading analytics" />;

  if (!data) {
    return (
      <main className="grid min-h-svh place-items-center bg-ink px-5 text-center text-sm">
        <div>
          <p className="text-white">No analytics yet</p>
          <p className="mt-1 text-white/40">{error}</p>
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

  const { analytics, deployment, status } = data;
  const { totals, statusCodes } = analytics;
  const url = withIngressPort(data.url);
  const errors = (statusCodes['4xx'] || 0) + (statusCodes['5xx'] || 0);

  return (
    <main className="min-h-svh bg-ink text-white">
      <div className="mx-auto max-w-3xl px-5 py-10 sm:py-16">
        <header className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <Link
              to={`/projects/${projectId}`}
              className="inline-flex items-center gap-1.5 text-xs text-white/40 transition-colors hover:text-white"
            >
              <ArrowLeft className="size-3.5" /> Workspace
            </Link>
            <h1 className="mt-4 text-xl font-medium tracking-tight">{deployment.slug}</h1>
            <a
              href={url}
              target="_blank"
              rel="noreferrer"
              className="group mt-1 inline-flex max-w-full items-center gap-1 text-xs text-white/40 transition-colors hover:text-white"
            >
              <span
                className={`mr-1 size-1.5 rounded-full ${status === 'live' ? 'bg-emerald-400' : 'bg-white/25'}`}
              />
              <span className="truncate font-mono">{url.replace(/^https?:\/\//, '')}</span>
              <ArrowUpRight className="size-3 opacity-0 transition-opacity group-hover:opacity-100" />
            </a>
          </div>

          <div className="flex gap-1 text-xs" role="tablist" aria-label="Range">
            {RANGES.map((range) => (
              <button
                key={range}
                type="button"
                role="tab"
                aria-selected={days === range}
                onClick={() => setDays(range)}
                className={`h-7 rounded-md px-2.5 tabular-nums transition-colors ${
                  days === range ? 'bg-white/10 text-white' : 'text-white/40 hover:text-white'
                }`}
              >
                {range}d
              </button>
            ))}
          </div>
        </header>

        <dl className="mt-10 grid grid-cols-2 divide-line border-y border-line sm:grid-cols-4 sm:divide-x">
          <Metric label="Visitors" value={compact.format(totals.visitors)} />
          <Metric label="Page views" value={compact.format(totals.views)} />
          <Metric
            label="Live now"
            value={number.format(analytics.liveVisitors)}
            live={analytics.liveVisitors > 0}
          />
          <Metric label="Response" value={`${number.format(totals.avgResponseMs)}ms`} />
        </dl>

        <div className="mt-10">
          <DailyChart daily={analytics.daily} />
        </div>

        <div className="mt-12 grid gap-10 sm:grid-cols-2">
          <List title="Pages" rows={analytics.topPages} empty="No page views yet" />
          <List title="Referrers" rows={analytics.topReferrers} empty="No referrers yet" />
          <List title="Browsers" rows={fromCounts(analytics.browsers)} empty="No visitors yet" />
          <List title="Devices" rows={fromCounts(analytics.devices)} empty="No visitors yet" />
        </div>

        <p className="mt-14 text-xs text-white/25 tabular-nums">
          {number.format(totals.requests)} requests · {number.format(totals.wakes)} wake-ups ·{' '}
          {number.format(errors)} errors · v{deployment.version}
          {error && <span className="text-red-300/70"> · {error}</span>}
        </p>
      </div>
    </main>
  );
}
