import { Eye, EyeOff, LoaderCircle, Plus, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { deploymentsApi } from '../../api/projects.js';
import { parseDotEnv } from '../../utils/dotenv.js';

const toRows = (vars) => Object.entries(vars).map(([key, value]) => ({ key, value }));
const toVars = (rows) =>
  Object.fromEntries(rows.filter((r) => r.key.trim()).map((r) => [r.key.trim(), r.value]));

// Environment variables of the deployed site: stored encrypted, given to the app on every start.
export function EnvEditor({ projectId }) {
  const [rows, setRows] = useState(null);
  const [saved, setSaved] = useState('{}'); // what the server has, to know when there is something to save
  const [revealed, setRevealed] = useState(() => new Set());
  const [pasting, setPasting] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState({ text: '', error: false });

  useEffect(() => {
    deploymentsApi
      .env(projectId)
      .then((vars) => {
        setRows(toRows(vars));
        setSaved(JSON.stringify(vars));
      })
      .catch((e) => {
        setRows([]);
        setMessage({ text: e.message, error: true });
      });
  }, [projectId]);

  if (!rows) return null;

  const dirty = JSON.stringify(toVars(rows)) !== saved;
  const update = (i, patch) =>
    setRows((r) => r.map((row, j) => (j === i ? { ...row, ...patch } : row)));

  function importPaste() {
    // pasted values win over existing rows with the same name
    const merged = { ...toVars(rows), ...parseDotEnv(pasteText) };
    setRows(toRows(merged));
    setPasteText('');
    setPasting(false);
  }

  async function save() {
    setBusy(true);
    setMessage({ text: '', error: false });
    try {
      const result = await deploymentsApi.saveEnv(projectId, toVars(rows));
      setRows(toRows(result.vars));
      setSaved(JSON.stringify(result.vars));
      setMessage({
        text: result.restarted
          ? 'Saved. The site is restarting with the new values.'
          : 'Saved. Used from the next visit.',
        error: false
      });
    } catch (e) {
      setMessage({ text: e.message, error: true });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section>
      <h2 className="flex items-center justify-between border-b border-line pb-2 text-xs text-white/40">
        <span>Environment variables</span>
        <button type="button" onClick={() => setPasting((p) => !p)} className="hover:text-white">
          {pasting ? 'Cancel' : 'Paste .env'}
        </button>
      </h2>

      {pasting && (
        <div className="mt-3">
          <textarea
            value={pasteText}
            onChange={(e) => setPasteText(e.target.value)}
            rows={5}
            placeholder={'DATABASE_URL=postgres://...\nAPI_KEY=...'}
            aria-label="Paste a .env file"
            className="ide-scroll w-full resize-y rounded-lg border border-line bg-panel px-3 py-2 font-mono text-xs text-white outline-none placeholder:text-white/20 focus:border-white/20"
          />
          <button
            type="button"
            onClick={importPaste}
            disabled={!pasteText.trim()}
            className="mt-2 h-7 rounded-md bg-white/10 px-3 text-xs text-white hover:bg-white/15 disabled:opacity-40"
          >
            Add these variables
          </button>
        </div>
      )}

      <ul className="mt-2 space-y-1.5">
        {rows.map((row, i) => (
          <li key={i} className="flex items-center gap-1.5">
            <input
              value={row.key}
              onChange={(e) => update(i, { key: e.target.value })}
              placeholder="NAME"
              aria-label="Variable name"
              spellCheck={false}
              className="h-8 w-2/5 min-w-0 rounded-md border border-line bg-panel px-2.5 font-mono text-xs text-white outline-none placeholder:text-white/20 focus:border-white/20"
            />
            <input
              value={row.value}
              onChange={(e) => update(i, { value: e.target.value })}
              type={revealed.has(i) ? 'text' : 'password'}
              placeholder="value"
              aria-label={`Value of ${row.key || 'variable'}`}
              spellCheck={false}
              autoComplete="off"
              className="h-8 min-w-0 flex-1 rounded-md border border-line bg-panel px-2.5 font-mono text-xs text-white outline-none placeholder:text-white/20 focus:border-white/20"
            />
            <button
              type="button"
              onClick={() =>
                setRevealed((s) => {
                  const next = new Set(s);
                  next.has(i) ? next.delete(i) : next.add(i);
                  return next;
                })
              }
              aria-label={revealed.has(i) ? 'Hide value' : 'Show value'}
              className="grid size-8 shrink-0 place-items-center rounded-md text-white/35 hover:bg-white/5 hover:text-white"
            >
              {revealed.has(i) ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
            </button>
            <button
              type="button"
              onClick={() => setRows((r) => r.filter((_, j) => j !== i))}
              aria-label={`Remove ${row.key || 'variable'}`}
              className="grid size-8 shrink-0 place-items-center rounded-md text-white/35 hover:bg-white/5 hover:text-red-300"
            >
              <X className="size-3.5" />
            </button>
          </li>
        ))}
      </ul>

      <div className="mt-3 flex items-center gap-3">
        <button
          type="button"
          onClick={() => setRows((r) => [...r, { key: '', value: '' }])}
          className="flex h-7 items-center gap-1 rounded-md px-2 text-xs text-white/55 hover:bg-white/5 hover:text-white"
        >
          <Plus className="size-3.5" /> Add variable
        </button>
        <button
          type="button"
          onClick={save}
          disabled={!dirty || busy}
          className="ml-auto flex h-7 items-center gap-1.5 rounded-md bg-white px-3 text-xs font-medium text-black hover:bg-white/90 disabled:opacity-30"
        >
          {busy && <LoaderCircle className="size-3.5 animate-spin" />}
          Save
        </button>
      </div>

      {message.text && (
        <p
          role={message.error ? 'alert' : 'status'}
          className={`mt-2 text-xs ${message.error ? 'text-red-300' : 'text-white/45'}`}
        >
          {message.text}
        </p>
      )}
      <p className="mt-2 text-[11px] text-white/25">
        Encrypted at rest. Client-side code only sees variables your framework exposes (VITE_*,
        NEXT_PUBLIC_*).
      </p>
    </section>
  );
}
