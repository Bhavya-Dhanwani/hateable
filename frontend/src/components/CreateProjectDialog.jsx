import { AnimatePresence, motion } from 'motion/react';
import { ArrowRight, Atom, Layers, LoaderCircle, Server, Triangle, X } from 'lucide-react';
import { useState } from 'react';

// Maps onto projectService's projectType enum: `${stack}-${lang}`.
const STACKS = [
  { id: 'react', name: 'React', blurb: 'Vite SPA', icon: Atom },
  { id: 'next', name: 'Next.js', blurb: 'Full-stack React', icon: Triangle },
  { id: 'mern', name: 'MERN', blurb: 'Mongo · Express · React', icon: Layers },
  { id: 'node', name: 'Node', blurb: 'Express API', icon: Server }
];

export function CreateProjectDialog({
  open,
  onClose,
  onCreate,
  busy,
  error,
  defaultName = '',
  defaultType = 'react-ts'
}) {
  const [name, setName] = useState(defaultName);
  const [stack, setStack] = useState(defaultType.split('-')[0]);
  const [lang, setLang] = useState(defaultType.split('-')[1]);

  function submit(event) {
    event.preventDefault();
    if (name.trim() && !busy) onCreate({ name: name.trim(), projectType: `${stack}-${lang}` });
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-40 grid place-items-center overflow-y-auto bg-black/60 p-5 backdrop-blur-md"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onMouseDown={() => !busy && onClose()}
        >
          <motion.form
            onSubmit={submit}
            className="relative w-full max-w-lg overflow-hidden rounded-3xl border border-white/10 bg-panel p-6 shadow-2xl shadow-black/60 sm:p-8"
            initial={{ scale: 0.94, y: 20 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.96, y: 10 }}
            transition={{ type: 'spring', damping: 22, stiffness: 300 }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="hero-glow pointer-events-none absolute -top-40 left-1/2 -z-0 h-56 w-[120%] -translate-x-1/2 opacity-30" />

            <div className="relative flex items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-semibold text-white">New project</h2>
                <p className="mt-1 text-sm text-white/45">
                  Name it, pick a stack. We'll spin up the runtime.
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                disabled={busy}
                className="grid size-8 shrink-0 place-items-center rounded-full text-white/50 hover:bg-white/10 hover:text-white disabled:opacity-30"
                aria-label="Close"
              >
                <X className="size-4" />
              </button>
            </div>

            <label className="relative mt-8 block">
              <span className="mb-2 block text-xs font-medium text-white/60">Project name</span>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={60}
                placeholder="My next big regret"
                autoFocus
                required
                className="h-12 w-full rounded-xl border border-white/10 bg-ink/70 px-4 text-sm text-white outline-none transition placeholder:text-white/30 hover:border-white/20 focus:border-white/35"
              />
            </label>

            <fieldset className="relative mt-7">
              <div className="mb-2 flex items-center justify-between">
                <legend className="text-xs font-medium text-white/60">Stack</legend>
                <div
                  className="flex rounded-full border border-line bg-ink p-0.5"
                  role="radiogroup"
                  aria-label="Language"
                >
                  {[
                    ['ts', 'TypeScript'],
                    ['js', 'JavaScript']
                  ].map(([id, label]) => (
                    <button
                      key={id}
                      type="button"
                      role="radio"
                      aria-checked={lang === id}
                      onClick={() => setLang(id)}
                      className="relative h-7 rounded-full px-3 text-[11px] font-medium"
                    >
                      {lang === id && (
                        <motion.span
                          layoutId="lang-pill"
                          className="absolute inset-0 rounded-full bg-white"
                          transition={{ type: 'spring', damping: 26, stiffness: 400 }}
                        />
                      )}
                      <span className={`relative ${lang === id ? 'text-black' : 'text-white/55'}`}>
                        {label}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3" role="radiogroup" aria-label="Stack">
                {STACKS.map(({ id, name: label, blurb, icon: Icon }) => {
                  const active = stack === id;
                  return (
                    <button
                      key={id}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      onClick={() => setStack(id)}
                      className={`group relative rounded-2xl border p-4 text-left transition ${active ? 'border-white/40 bg-white/[0.07]' : 'border-line bg-ink/50 hover:border-white/20 hover:bg-white/[0.03]'}`}
                    >
                      <Icon
                        className={`size-5 transition ${active ? 'text-white' : 'text-white/45 group-hover:text-white/70'}`}
                      />
                      <p className="mt-3 text-sm font-medium text-white">{label}</p>
                      <p className="mt-0.5 text-xs text-white/40">{blurb}</p>
                      {active && (
                        <motion.span
                          layoutId="stack-dot"
                          className="absolute top-4 right-4 size-2 rounded-full bg-accent shadow-[0_0_10px_2px] shadow-accent/60"
                        />
                      )}
                    </button>
                  );
                })}
              </div>
            </fieldset>

            {error && (
              <p
                role="alert"
                className="relative mt-5 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200"
              >
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={!name.trim() || busy}
              className="group relative mt-8 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-white text-sm font-medium text-black transition hover:bg-white/90 active:scale-[0.99] disabled:opacity-40"
            >
              {busy ? (
                <>
                  <LoaderCircle className="size-4 animate-spin" /> Spinning up your runtime…
                </>
              ) : (
                <>
                  Create project{' '}
                  <ArrowRight className="size-4 transition group-hover:translate-x-0.5" />
                </>
              )}
            </button>
          </motion.form>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
