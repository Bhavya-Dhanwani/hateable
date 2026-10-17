import { useEffect, useState } from 'react';
import { deploymentsApi } from '../../api/projects.js';

const REFRESH_MS = 15_000;
const LEVEL_DOT = { error: 'bg-red-400', warn: 'bg-amber-400', info: 'bg-white/20' };
const clock = (at) =>
  at
    ? new Date(at).toLocaleTimeString(undefined, {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      })
    : '';

const SOURCE = {
  live: 'live',
  'last-run': 'from the last run, before the site went to sleep',
  none: 'nothing yet'
};

// The optimized deployment log: lifecycle activity + the app's own output, noise removed.
export function DeploymentLogs({ projectId }) {
  const [logs, setLogs] = useState(null);
  const [onlyProblems, setOnlyProblems] = useState(false);

  useEffect(() => {
    let active = true;
    const load = () =>
      deploymentsApi
        .logs(projectId)
        .then((next) => active && setLogs(next))
        .catch(() => {});
    load();
    const timer = setInterval(load, REFRESH_MS);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [projectId]);

  if (!logs) return null;

  const lines = onlyProblems ? logs.app.filter((l) => l.level !== 'info') : logs.app;

  return (
    <div className="grid gap-10 sm:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
      <section>
        <h2 className="border-b border-line pb-2 text-xs text-white/40">Activity</h2>
        {logs.events.length === 0 ? (
          <p className="py-3 text-xs text-white/25">No activity yet</p>
        ) : (
          <ul className="ide-scroll mt-1 max-h-80 overflow-auto">
            {logs.events.slice(0, 40).map((e, i) => (
              <li key={`${e.at}-${i}`} className="flex gap-2.5 py-1.5 text-[13px]">
                <span className={`mt-1.5 size-1.5 shrink-0 rounded-full ${LEVEL_DOT[e.level]}`} />
                <span className="min-w-0 flex-1 text-white/75">{e.message}</span>
                <span className="shrink-0 text-[11px] text-white/25 tabular-nums">
                  {clock(e.at)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="min-w-0">
        <h2 className="flex items-center justify-between border-b border-line pb-2 text-xs text-white/40">
          <span>
            Logs <span className="text-white/25">· {SOURCE[logs.source]}</span>
          </span>
          <button
            type="button"
            onClick={() => setOnlyProblems((v) => !v)}
            aria-pressed={onlyProblems}
            className={onlyProblems ? 'text-white' : 'hover:text-white'}
          >
            Errors only
          </button>
        </h2>
        {lines.length === 0 ? (
          <p className="py-3 text-xs text-white/25">
            {onlyProblems ? 'No errors or warnings' : 'No output yet'}
          </p>
        ) : (
          <ul className="ide-scroll mt-1 max-h-80 overflow-auto font-mono text-[11.5px] leading-5">
            {lines.map((l, i) => (
              <li key={i} className="flex gap-2.5 py-0.5">
                <span className={`mt-2 size-1.5 shrink-0 rounded-full ${LEVEL_DOT[l.level]}`} />
                <div className="min-w-0 flex-1">
                  <span
                    className={
                      l.level === 'info'
                        ? 'text-zinc-300'
                        : l.level === 'warn'
                          ? 'text-amber-200'
                          : 'text-red-200'
                    }
                  >
                    {l.message}
                  </span>
                  {l.count > 1 && <span className="ml-2 text-white/30">×{l.count}</span>}
                  {l.stack?.map((frame) => (
                    <div key={frame} className="truncate pl-3 text-white/30">
                      {frame}
                    </div>
                  ))}
                </div>
                <span className="shrink-0 text-white/20 tabular-nums">{clock(l.at)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
