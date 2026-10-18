import { LogOut, Phone } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { authApi } from '../api/auth.js';
import { useAuth } from '../auth/auth-context.js';
import { Logo } from './Logo.jsx';

const POLL_MS = 3000;
const POLL_TRIES = 200; // ~10 minutes, the request's lifetime on the backend
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Telegram verification: the link opens our bot (phone app, desktop app or web), the user taps
// Start, and we poll until the bot's webhook has linked their Telegram account.
export function VerifyPhone() {
  const { user, setUser } = useAuth();
  const [state, setState] = useState('idle'); // idle | waiting | error
  const [message, setMessage] = useState('');
  const [request, setRequest] = useState(null); // { requestNonce, link }, fetched ahead
  const alive = useRef(true);
  const attempt = useRef(0); // bumps on cancel so a stale poll loop stops

  useEffect(() => () => void (alive.current = false), []);

  // fetch the link before the click so it opens as a plain link (no popup blocker)
  useEffect(() => {
    if (request || user.phoneVerified) return;
    authApi
      .telegramStart()
      .then(setRequest)
      .catch((e) => {
        setState('error');
        setMessage(e.message);
      });
  }, [request, user.phoneVerified]);

  if (user.phoneVerified) return null;

  async function poll() {
    const { requestNonce } = request;
    setRequest(null); // a request is single-use; the effect fetches the next one
    const mine = ++attempt.current;
    const current = () => alive.current && attempt.current === mine;
    setState('waiting');
    setMessage('');
    try {
      for (let i = 0; i < POLL_TRIES && current(); i++) {
        await wait(POLL_MS);
        if (!current()) return;
        const result = await authApi.phoneStatus(requestNonce);
        if (result.status === 'verified') {
          const session = await authApi.refresh(); // new access token carries the phone
          setUser(session.user);
          return;
        }
      }
      if (current()) throw new Error('Verification timed out, please try again.');
    } catch (e) {
      if (!current()) return;
      setState('error');
      setMessage(e.message);
    }
  }

  return (
    <div className="mt-8 rounded-2xl border border-line bg-panel p-6">
      <p className="flex items-center gap-2 text-lg font-medium text-white">
        <Phone className="size-5" /> Verify your account to start building
      </p>
      <p className="mt-2 text-sm text-white/45">
        Free and instant with Telegram, on your phone or computer. Open our bot and tap{' '}
        <b className="text-white/70">Start</b>. We never see your number, and each Telegram account
        can be linked to one Hateable account.
      </p>
      {message && (
        <p role="alert" className="mt-3 text-sm text-red-300">
          {message}
        </p>
      )}
      {state === 'waiting' ? (
        <>
          <p className="mt-5 text-sm text-white/70">Waiting for you to tap Start in Telegram…</p>
          <button
            type="button"
            onClick={() => {
              attempt.current++;
              setState('idle');
            }}
            className="mt-3 text-sm text-white/40 underline transition hover:text-white"
          >
            Cancel and get a new link
          </button>
        </>
      ) : (
        <a
          href={request?.link}
          target="_blank"
          rel="noreferrer"
          onClick={(e) => (request ? poll() : e.preventDefault())}
          aria-disabled={!request}
          className={`mt-5 inline-flex h-11 items-center justify-center rounded-full bg-white px-6 text-sm font-medium text-black transition hover:bg-white/90 ${request ? '' : 'pointer-events-none opacity-60'}`}
        >
          Verify with Telegram
        </a>
      )}
    </div>
  );
}

// full-page step shown after signup/login until the account has a verified phone
export function PhoneOnboarding() {
  const { user, logout } = useAuth();
  return (
    <main className="grain grid min-h-svh place-items-center bg-ink px-5">
      <div className="w-full max-w-md">
        <Logo size={24} />
        <h1 className="mt-8 text-2xl font-semibold tracking-tight text-white">
          One last step, {user.name?.split(' ')[0] || 'there'}
        </h1>
        <VerifyPhone />
        <button
          type="button"
          onClick={logout}
          className="mt-6 flex items-center gap-2 text-sm text-white/40 transition hover:text-white"
        >
          <LogOut className="size-4" /> Log out ({user.email})
        </button>
      </div>
    </main>
  );
}
