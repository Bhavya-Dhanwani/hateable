import { ArrowUp, LoaderCircle } from 'lucide-react';
import { useEffect, useState } from 'react';
import { PROJECT_TYPES } from '../api/projects.js';

const IDEAS = [
  'a habit tracker that roasts me when I skip',
  'a SaaS dashboard with Stripe-style charts',
  'a portfolio that feels like a Mac desktop',
  'a recipe app that judges my fridge',
  'a kanban board with drag and drop'
];

// Typewriter placeholder that cycles through ideas.
function useTypedPlaceholder(active) {
  const [text, setText] = useState('');
  useEffect(() => {
    if (!active) return undefined;
    let idea = 0,
      i = 0,
      deleting = false,
      timer;
    const tick = () => {
      const full = IDEAS[idea];
      i += deleting ? -1 : 1;
      setText(full.slice(0, i));
      if (!deleting && i === full.length) {
        deleting = true;
        timer = setTimeout(tick, 1600);
        return;
      }
      if (deleting && i === 0) {
        deleting = false;
        idea = (idea + 1) % IDEAS.length;
      }
      timer = setTimeout(tick, deleting ? 22 : 45);
    };
    timer = setTimeout(tick, 400);
    return () => clearTimeout(timer);
  }, [active]);
  return text;
}

export function PromptBox({
  onSubmit,
  busy = false,
  defaultValue = '',
  defaultType = 'react-ts',
  autoFocus = false
}) {
  const [value, setValue] = useState(defaultValue);
  const [type, setType] = useState(defaultType);
  const placeholder = useTypedPlaceholder(!value);

  function submit(event) {
    event.preventDefault();
    if (value.trim() && !busy) onSubmit({ prompt: value.trim(), projectType: type });
  }

  return (
    <form
      onSubmit={submit}
      className="w-full rounded-3xl border border-white/10 bg-ink/75 p-3 shadow-2xl shadow-black/40 backdrop-blur-xl transition focus-within:border-white/20"
    >
      <textarea
        className="block min-h-24 w-full resize-none bg-transparent px-3 pt-2 text-[15px] leading-6 text-white outline-none placeholder:text-white/35"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            e.currentTarget.form.requestSubmit();
          }
        }}
        placeholder={`Ask Hateable to build ${placeholder}`}
        aria-label="Describe what you want to build"
        autoFocus={autoFocus}
      />
      <div className="mt-2 flex items-center justify-between gap-3">
        <div className="ide-scroll flex gap-1.5 overflow-x-auto">
          {PROJECT_TYPES.slice(0, 6).map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setType(t.id)}
              className={`shrink-0 rounded-full border px-3 py-1 text-xs font-medium transition ${
                type === t.id
                  ? 'border-white/25 bg-white/10 text-white'
                  : 'border-line text-white/50 hover:border-white/20 hover:text-white/80'
              }`}
            >
              {t.label} <span className="text-white/40">{t.lang}</span>
            </button>
          ))}
        </div>
        <button
          type="submit"
          disabled={!value.trim() || busy}
          className="grid size-10 shrink-0 place-items-center rounded-full bg-white text-black hover:bg-white/90 transition hover:scale-105 active:scale-95 disabled:opacity-25 disabled:hover:scale-100"
          aria-label="Start building"
        >
          {busy ? (
            <LoaderCircle className="size-4 animate-spin" />
          ) : (
            <ArrowUp className="size-4" strokeWidth={2.5} />
          )}
        </button>
      </div>
    </form>
  );
}
