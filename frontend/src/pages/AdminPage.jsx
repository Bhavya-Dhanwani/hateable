import { Check, LoaderCircle, LogOut, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { paymentsApi } from '../api/payments.js';
import { Logo } from '../components/Logo.jsx';

const KEY_STORE = 'hateable_admin_key';

// Admin panel for the manual UPI flow: unlock with the admin key, then approve/reject the
// payments users submitted. Approving flips their plan. Reached at /admin (not linked in nav).
export function AdminPage() {
  const [key, setKey] = useState(() => {
    try {
      return localStorage.getItem(KEY_STORE) || '';
    } catch {
      return '';
    }
  });
  const [unlocked, setUnlocked] = useState(false);
  const [payments, setPayments] = useState(null);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState('');

  const load = (k) =>
    paymentsApi
      .adminList(k)
      .then(({ payments }) => {
        setPayments(payments);
        setUnlocked(true);
        setError('');
        try {
          localStorage.setItem(KEY_STORE, k);
        } catch {
          /* ignore */
        }
      })
      .catch((e) => {
        setError(e.message);
        setUnlocked(false);
      });

  // auto-unlock if a key is already saved
  useEffect(() => {
    if (key) load(key);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function decide(id, action) {
    setBusyId(id);
    try {
      await paymentsApi.adminDecide(key, id, action);
      await load(key);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusyId('');
    }
  }

  function lock() {
    try {
      localStorage.removeItem(KEY_STORE);
    } catch {
      /* ignore */
    }
    setUnlocked(false);
    setPayments(null);
    setKey('');
  }

  const pending = (payments || []).filter((p) => p.status === 'pending');
  const decided = (payments || []).filter((p) => p.status !== 'pending');

  return (
    <main className="grain min-h-svh bg-ink px-5 py-10">
      <div className="mx-auto max-w-3xl">
        <header className="flex items-center justify-between">
          <Link to="/">
            <Logo size={22} />
          </Link>
          <span className="font-mono text-xs tracking-wide text-white/40 uppercase">
            Admin · payments
          </span>
        </header>

        {!unlocked ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (key.trim()) load(key.trim());
            }}
            className="mx-auto mt-20 max-w-sm"
          >
            <h1 className="text-xl font-semibold text-white">Enter admin key</h1>
            <input
              value={key}
              onChange={(e) => setKey(e.target.value)}
              type="password"
              autoFocus
              placeholder="x-admin-key"
              className="mt-4 h-12 w-full rounded-xl border border-white/10 bg-panel px-4 text-sm text-white outline-none focus:border-white/35"
            />
            {error && <p className="mt-3 text-sm text-red-300">{error}</p>}
            <button
              type="submit"
              className="mt-4 h-11 w-full rounded-xl bg-white text-sm font-medium text-black hover:bg-white/90"
            >
              Unlock
            </button>
          </form>
        ) : (
          <>
            <div className="mt-10 flex items-center justify-between">
              <h1 className="text-2xl font-semibold text-white">
                Pending payments <span className="text-white/40">({pending.length})</span>
              </h1>
              <button
                type="button"
                onClick={lock}
                className="flex items-center gap-1.5 text-sm text-white/40 hover:text-white"
              >
                <LogOut className="size-4" /> Lock
              </button>
            </div>
            {error && <p className="mt-4 text-sm text-red-300">{error}</p>}

            <div className="mt-6 space-y-3">
              {payments === null && <div className="h-20 animate-pulse rounded-xl bg-panel" />}
              {pending.length === 0 && payments !== null && (
                <p className="text-sm text-white/40">Nothing waiting. All caught up.</p>
              )}
              {pending.map((p) => (
                <div
                  key={p._id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-panel px-4 py-4"
                >
                  <div className="min-w-0">
                    <p className="text-sm text-white">
                      {p.email} → <b className="uppercase">{p.plan}</b> · ₹{p.amount}
                    </p>
                    <p className="mt-0.5 text-xs text-white/40">
                      {p.reference ? `ref ${p.reference} · ` : ''}
                      {new Date(p.createdAt).toLocaleString()}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={busyId === p._id}
                      onClick={() => decide(p._id, 'approve')}
                      className="flex h-9 items-center gap-1.5 rounded-full bg-emerald-500/15 px-4 text-sm font-medium text-emerald-300 hover:bg-emerald-500/25 disabled:opacity-40"
                    >
                      {busyId === p._id ? (
                        <LoaderCircle className="size-4 animate-spin" />
                      ) : (
                        <Check className="size-4" />
                      )}
                      Approve
                    </button>
                    <button
                      type="button"
                      disabled={busyId === p._id}
                      onClick={() => decide(p._id, 'reject')}
                      className="flex h-9 items-center gap-1.5 rounded-full border border-line px-4 text-sm text-white/60 hover:bg-white/5 disabled:opacity-40"
                    >
                      <X className="size-4" /> Reject
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {decided.length > 0 && (
              <>
                <h2 className="mt-10 text-sm font-medium tracking-wide text-white/40 uppercase">
                  Recent
                </h2>
                <div className="mt-3 space-y-2">
                  {decided.map((p) => (
                    <div
                      key={p._id}
                      className="flex items-center justify-between gap-3 rounded-xl border border-line bg-ink/50 px-4 py-3 text-sm"
                    >
                      <span className="truncate text-white/60">
                        {p.email} → {p.plan} · ₹{p.amount}
                      </span>
                      <span
                        className={p.status === 'approved' ? 'text-emerald-300' : 'text-white/40'}
                      >
                        {p.status}
                      </span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </>
        )}
      </div>
    </main>
  );
}
