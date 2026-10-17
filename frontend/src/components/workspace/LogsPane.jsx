import { ArrowDownToLine, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { streamEvents } from '../../api/ai.js';

const MAX_LINES = 2000;
// eslint-disable-next-line no-control-regex
const ANSI = /\x1b\[[0-9;?]*[ -/]*[@-~]/g;

// Live, unfiltered output of the preview's dev server: what you would see in your own terminal.
export function LogsPane({ projectId }) {
  const [lines, setLines] = useState([]);
  const [error, setError] = useState('');
  const [follow, setFollow] = useState(true);
  const scrollRef = useRef(null);

  useEffect(() => {
    const abort = new AbortController();
    streamEvents(`/api/projects/${projectId}/logs`, {
      signal: abort.signal,
      onEvent: (_type, line) =>
        setLines((current) => [...current, String(line).replace(ANSI, '')].slice(-MAX_LINES))
    }).catch((e) => {
      if (!abort.signal.aborted) setError(e.message);
    });
    return () => abort.abort();
  }, [projectId]);

  useEffect(() => {
    if (follow) scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [lines, follow]);

  return (
    <div className="relative h-full min-h-0 bg-ink">
      <div className="absolute top-2 right-3 z-10 flex gap-1">
        <button
          type="button"
          onClick={() => setFollow((f) => !f)}
          aria-pressed={follow}
          title={follow ? 'Following new lines' : 'Follow new lines'}
          className={`grid size-6 place-items-center rounded ${follow ? 'text-white' : 'text-white/35'} hover:bg-white/10`}
        >
          <ArrowDownToLine className="size-3.5" />
        </button>
        <button
          type="button"
          onClick={() => setLines([])}
          title="Clear"
          className="grid size-6 place-items-center rounded text-white/35 hover:bg-white/10 hover:text-white"
        >
          <Trash2 className="size-3.5" />
        </button>
      </div>
      <pre
        ref={scrollRef}
        onWheel={(e) => e.deltaY < 0 && setFollow(false)}
        className="ide-scroll h-full overflow-auto px-3 py-2 font-mono text-[11.5px] leading-5 text-zinc-300"
      >
        {lines.length ? lines.join('\n') : error || 'Waiting for output...'}
      </pre>
    </div>
  );
}
