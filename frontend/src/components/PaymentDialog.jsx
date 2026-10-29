import { AnimatePresence, motion } from 'motion/react';
import { QRCodeSVG } from 'qrcode.react';
import { Check, Copy, LoaderCircle, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { paymentsApi, usePublicConfig } from '../api/payments.js';
import { authApi } from '../api/auth.js';
import { useAuth } from '../auth/auth-context.js';

const PAID_PLANS = [
  { key: 'pro', name: 'Pro' },
  { key: 'team', name: 'Team' }
];

// Manual UPI checkout: show a QR for the amount, user pays in any UPI app, then submits for the
// admin to approve. The plan flips (on their next token refresh) once approved.
export function PaymentDialog({ open, onClose, plan = 'pro' }) {
  const config = usePublicConfig();
  const { setUser } = useAuth();
  const [selected, setSelected] = useState(plan);
  const [reference, setReference] = useState('');
  const [state, setState] = useState('idle'); // idle | submitting | pending | approved | error
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => (alive.current = false);
  }, []);

  // on open, reset and reflect any request already awaiting approval (state set in the async
  // callback, not synchronously in the effect body)
  useEffect(() => {
    if (!open) return;
    paymentsApi
      .mine()
      .then(({ payments }) => {
        if (!alive.current) return;
        const p = payments?.find((x) => x.status === 'pending');
        setSelected(p ? p.plan : plan);
        setState(p ? 'pending' : 'idle');
        setError('');
      })
      .catch(() => {
        if (!alive.current) return;
        setSelected(plan);
        setState('idle');
        setError('');
      });
  }, [open, plan]);

  const amount = config?.prices?.[selected];
  const upiUri =
    config?.upi && amount
      ? `upi://pay?pa=${encodeURIComponent(config.upi)}&pn=${encodeURIComponent(
          config.payeeName || 'Hateable'
        )}&am=${amount}&cu=INR&tn=${encodeURIComponent(`Hateable ${selected}`)}`
      : '';

  async function submit() {
    setState('submitting');
    setError('');
    try {
      await paymentsApi.create(selected, reference.trim());
      if (!alive.current) return;
      setState('pending');
      pollApproval();
    } catch (e) {
      if (alive.current) {
        setState('error');
        setError(e.message);
      }
    }
  }

  // after submitting, watch for the admin's approval and refresh the session when it lands
  async function pollApproval() {
    for (let i = 0; i < 40 && alive.current; i++) {
      await new Promise((r) => setTimeout(r, 4000));
      if (!alive.current) return;
      try {
        const { payments } = await paymentsApi.mine();
        const latest = payments?.find((x) => x.plan === selected) || payments?.[0];
        if (latest?.status === 'approved') {
          const session = await authApi.refresh();
          if (!alive.current) return;
          setUser(session.user);
          setState('approved');
          return;
        }
        if (latest?.status === 'rejected') {
          setState('error');
          setError('Payment was rejected. Reach out if this is a mistake.');
          return;
        }
      } catch {
        /* keep polling */
      }
    }
  }

  const copy = () => {
    navigator.clipboard?.writeText(config.upi).then(() => {
      setCopied(true);
      setTimeout(() => alive.current && setCopied(false), 1500);
    });
  };

  return (
    <AnimatePresence>
      {open && config?.upiEnabled && (
        <motion.div
          className="fixed inset-0 z-40 grid place-items-center overflow-y-auto bg-black/60 p-5 backdrop-blur-md"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onMouseDown={onClose}
        >
          <motion.div
            className="relative w-full max-w-md overflow-hidden rounded-3xl border border-white/10 bg-panel p-6 shadow-2xl shadow-black/60 sm:p-8"
            initial={{ scale: 0.94, y: 20 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.96, y: 10 }}
            transition={{ type: 'spring', damping: 22, stiffness: 300 }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="hero-glow pointer-events-none absolute -top-40 left-1/2 -z-0 h-56 w-[120%] -translate-x-1/2 opacity-30" />

            <div className="relative flex items-start justify-between gap-4">
              <h2 className="text-xl font-semibold text-white">Upgrade your plan</h2>
              <button
                type="button"
                onClick={onClose}
                className="grid size-8 shrink-0 place-items-center rounded-full text-white/50 hover:bg-white/10 hover:text-white"
                aria-label="Close"
              >
                <X className="size-4" />
              </button>
            </div>

            {state === 'approved' ? (
              <div className="relative mt-8 text-center">
                <div className="mx-auto grid size-14 place-items-center rounded-full bg-emerald-500/15 text-emerald-300">
                  <Check className="size-7" />
                </div>
                <p className="mt-4 text-lg font-medium text-white">You're on {selected} now.</p>
                <p className="mt-1 text-sm text-white/50">Your new limits are already live.</p>
                <button
                  type="button"
                  onClick={onClose}
                  className="mt-6 h-11 w-full rounded-xl bg-white text-sm font-medium text-black hover:bg-white/90"
                >
                  Done
                </button>
              </div>
            ) : state === 'pending' ? (
              <div className="relative mt-8 text-center">
                <LoaderCircle className="mx-auto size-7 animate-spin text-white/60" />
                <p className="mt-4 text-lg font-medium text-white">Waiting for approval</p>
                <p className="mt-1 text-sm text-white/50">
                  We're confirming your payment. Your {selected} plan switches on the moment it's
                  approved — you can keep this open or check back later.
                </p>
                <button
                  type="button"
                  onClick={onClose}
                  className="mt-6 h-11 w-full rounded-xl border border-line text-sm font-medium text-white/70 hover:bg-white/5"
                >
                  Close
                </button>
              </div>
            ) : (
              <>
                <div className="relative mt-5 flex rounded-full border border-line bg-ink p-0.5">
                  {PAID_PLANS.map((p) => (
                    <button
                      key={p.key}
                      type="button"
                      onClick={() => setSelected(p.key)}
                      className={`relative h-8 flex-1 rounded-full text-xs font-medium ${selected === p.key ? 'text-black' : 'text-white/55'}`}
                    >
                      {selected === p.key && (
                        <motion.span
                          layoutId="pay-plan-pill"
                          className="absolute inset-0 rounded-full bg-white"
                          transition={{ type: 'spring', damping: 26, stiffness: 400 }}
                        />
                      )}
                      <span className="relative">
                        {p.name} · ₹{config.prices?.[p.key]}
                      </span>
                    </button>
                  ))}
                </div>

                <div className="relative mt-6 grid place-items-center">
                  <div className="rounded-2xl bg-white p-3">
                    {upiUri && <QRCodeSVG value={upiUri} size={168} />}
                  </div>
                  <p className="mt-4 text-sm text-white/60">
                    Scan with any UPI app and pay <b className="text-white">₹{amount}</b>
                  </p>
                  <button
                    type="button"
                    onClick={copy}
                    className="mt-2 inline-flex items-center gap-1.5 text-xs text-white/40 hover:text-white"
                  >
                    {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
                    {config.upi}
                  </button>
                </div>

                <label className="relative mt-6 block">
                  <span className="mb-2 block text-xs font-medium text-white/60">
                    UPI reference / UTR (optional, speeds up approval)
                  </span>
                  <input
                    value={reference}
                    onChange={(e) => setReference(e.target.value)}
                    placeholder="e.g. 4871xxxxxxx"
                    className="h-11 w-full rounded-xl border border-white/10 bg-ink/70 px-4 text-sm text-white outline-none placeholder:text-white/30 focus:border-white/35"
                  />
                </label>

                {error && (
                  <p
                    role="alert"
                    className="relative mt-4 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200"
                  >
                    {error}
                  </p>
                )}

                <button
                  type="button"
                  onClick={submit}
                  disabled={state === 'submitting'}
                  className="relative mt-6 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-white text-sm font-medium text-black transition hover:bg-white/90 active:scale-[0.99] disabled:opacity-40"
                >
                  {state === 'submitting' ? (
                    <LoaderCircle className="size-4 animate-spin" />
                  ) : (
                    "I've paid — submit for approval"
                  )}
                </button>
                <p className="relative mt-3 text-center text-xs text-white/35">
                  Manual approval for now. We check the payment and switch your plan on.
                </p>
              </>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
