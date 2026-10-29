import { AnimatePresence, motion } from 'motion/react';
import { KeyRound, LoaderCircle, Plus, Trash2, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { keysApi } from '../api/keys.js';

// BYOK settings: add your own provider keys. When your plan's daily allowance runs out, runs fall
// back to these keys automatically — so free users with their own keys get unlimited projects.
export function ApiKeysDialog({ open, onClose }) {
  const [providers, setProviders] = useState([]);
  const [keys, setKeys] = useState(null);
  const [provider, setProvider] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    keysApi
      .list()
      .then(({ providers, keys }) => {
        setError('');
        setProviders(providers);
        setKeys(keys);
        setProvider((p) => p || providers[0]?.id || '');
      })
      .catch((e) => setError(e.message));
  }, [open]);

  async function add(event) {
    event.preventDefault();
    if (!provider || !apiKey.trim() || busy) return;
    setBusy(true);
    setError('');
    try {
      const { keys } = await keysApi.add(provider, apiKey.trim(), model.trim());
      setKeys(keys);
      setApiKey('');
      setModel('');
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function remove(id) {
    try {
      const { keys } = await keysApi.remove(id);
      setKeys(keys);
    } catch (e) {
      setError(e.message);
    }
  }

  const current = providers.find((p) => p.id === provider);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-40 grid place-items-center overflow-y-auto bg-black/60 p-5 backdrop-blur-md"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onMouseDown={onClose}
        >
          <motion.div
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
                <h2 className="flex items-center gap-2 text-xl font-semibold text-white">
                  <KeyRound className="size-5" /> Your API keys
                </h2>
                <p className="mt-1 text-sm text-white/45">
                  Add keys from any providers below. When your plan's daily allowance runs out, we
                  route runs through your keys — so you can keep building, unlimited. Add several
                  and we round-robin across all of them to dodge rate limits.
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="grid size-8 shrink-0 place-items-center rounded-full text-white/50 hover:bg-white/10 hover:text-white"
                aria-label="Close"
              >
                <X className="size-4" />
              </button>
            </div>

            <form onSubmit={add} className="relative mt-6 space-y-3">
              <div className="flex gap-3">
                <select
                  value={provider}
                  onChange={(e) => setProvider(e.target.value)}
                  aria-label="Provider"
                  className="h-11 w-40 shrink-0 rounded-xl border border-white/10 bg-ink/70 px-3 text-sm text-white outline-none focus:border-white/35"
                >
                  {providers.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label}
                    </option>
                  ))}
                </select>
                <input
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  type="password"
                  placeholder="Paste API key"
                  autoComplete="off"
                  className="h-11 min-w-0 flex-1 rounded-xl border border-white/10 bg-ink/70 px-4 text-sm text-white outline-none placeholder:text-white/30 focus:border-white/35"
                />
              </div>
              <input
                value={model}
                onChange={(e) => setModel(e.target.value)}
                placeholder={`Model (optional, default ${current?.defaultModel || '—'})`}
                autoComplete="off"
                className="h-11 w-full rounded-xl border border-white/10 bg-ink/70 px-4 text-sm text-white outline-none placeholder:text-white/30 focus:border-white/35"
              />
              <button
                type="submit"
                disabled={!apiKey.trim() || busy}
                className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-white text-sm font-medium text-black transition hover:bg-white/90 active:scale-[0.99] disabled:opacity-40"
              >
                {busy ? (
                  <LoaderCircle className="size-4 animate-spin" />
                ) : (
                  <>
                    <Plus className="size-4" /> Add key
                  </>
                )}
              </button>
            </form>

            {error && (
              <p
                role="alert"
                className="relative mt-4 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200"
              >
                {error}
              </p>
            )}

            <div className="relative mt-6 space-y-2">
              {keys === null && <div className="h-12 animate-pulse rounded-xl bg-white/5" />}
              {keys?.length === 0 && (
                <p className="text-sm text-white/35">No keys yet. Add one above.</p>
              )}
              {keys?.map((k) => (
                <div
                  key={k.id}
                  className="flex items-center justify-between gap-3 rounded-xl border border-line bg-ink/50 px-4 py-3"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm text-white">
                      {providers.find((p) => p.id === k.provider)?.label || k.provider}
                      <span className="ml-2 font-mono text-xs text-white/40">{k.masked}</span>
                    </p>
                    <p className="truncate text-xs text-white/35">{k.model}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => remove(k.id)}
                    className="grid size-8 shrink-0 place-items-center rounded-full text-white/40 hover:bg-red-500/15 hover:text-red-300"
                    aria-label="Remove key"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </div>
              ))}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
