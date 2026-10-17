import { motion } from 'motion/react';
import { ArrowRight, Eye, EyeOff, LoaderCircle } from 'lucide-react';
import { useState } from 'react';
import { useAuth } from '../auth/auth-context.js';
import BlurText from '../components/bits/BlurText.jsx';
import HeroGlow from '../components/bits/HeroGlow.jsx';
import { TransitionLink } from '../components/HeartbreakTransition.jsx';
import { useHeartbreak } from '../components/heartbreak-context.js';
import { Logo, LogoMark } from '../components/Logo.jsx';

const field =
  'h-12 w-full rounded-xl border border-white/10 bg-ink/60 px-4 text-sm text-white outline-none backdrop-blur transition placeholder:text-white/30 hover:border-white/20 focus:border-white/35 focus:bg-ink/80';

export function AuthPage({ mode }) {
  const isSignup = mode === 'signup';
  const { login, signup, setUser } = useAuth();
  const { go } = useHeartbreak();
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');
    setBusy(true);
    const form = Object.fromEntries(new FormData(event.currentTarget));
    try {
      const session = await (isSignup ? signup(form) : login(form));
      go('/projects', { replace: true, onCovered: () => setUser(session.user) });
    } catch (e) {
      setError(e.message || 'Something broke. Try again.');
      setBusy(false);
    }
  }

  return (
    <main className="grain relative isolate min-h-svh overflow-hidden bg-ink lg:grid lg:grid-cols-[1.1fr_1fr]">
      {/* form-side glow — the only glow on mobile, a second bloom on desktop */}
      <HeroGlow className="absolute -top-[22%] left-1/2 -z-10 h-[55%] w-[150%] -translate-x-1/2 opacity-70 lg:left-auto lg:-right-[25%] lg:w-[70%] lg:translate-x-0 lg:opacity-45" />

      <section className="relative hidden overflow-hidden border-r border-line lg:flex lg:flex-col lg:p-10">
        <HeroGlow className="absolute inset-x-[-20%] bottom-[-35%] h-[80%]" />
        <div className="grid-fade absolute inset-0" />
        <TransitionLink to="/" className="relative z-10 w-fit">
          <Logo />
        </TransitionLink>
        <div className="relative z-10 my-auto max-w-md">
          <motion.div
            initial={{ scale: 0.6, opacity: 0, rotate: -12 }}
            animate={{ scale: 1, opacity: 1, rotate: 0 }}
            transition={{ type: 'spring', damping: 12 }}
          >
            <LogoMark size={96} beat className="mb-10" />
          </motion.div>
          <BlurText
            as="h2"
            text="Your ideas deserve better than a blank editor."
            className="text-4xl leading-tight font-semibold tracking-tight text-white"
          />
          <p className="mt-5 text-white/55">
            Prompt it. Watch it build. Break it. Fix it. Ship it.
          </p>
        </div>
        <p className="relative z-10 text-xs text-white/35">© Hateable — love is overrated.</p>
      </section>

      <section className="flex min-h-svh items-center justify-center px-6 py-12">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="w-full max-w-sm"
        >
          <TransitionLink to="/" className="mb-14 block w-fit lg:hidden">
            <Logo />
          </TransitionLink>
          <h1 className="text-3xl font-semibold tracking-tight text-white">
            {isSignup ? 'Create your account' : 'Welcome back'}
          </h1>
          <p className="mt-2 text-sm text-white/50">
            {isSignup ? 'Start building in under a minute.' : 'Your projects missed you. Sort of.'}
          </p>

          <form className="mt-10 flex flex-col gap-4" onSubmit={handleSubmit}>
            {isSignup && (
              <input
                className={field}
                name="name"
                autoComplete="name"
                minLength={3}
                placeholder="Name"
                aria-label="Name"
                required
              />
            )}
            <input
              className={field}
              name="email"
              type="email"
              autoComplete="email"
              placeholder="Email"
              aria-label="Email"
              required
            />
            <div className="relative">
              <input
                className={`${field} pr-12`}
                name="password"
                type={showPassword ? 'text' : 'password'}
                autoComplete={isSignup ? 'new-password' : 'current-password'}
                minLength={isSignup ? 6 : undefined}
                placeholder="Password"
                aria-label="Password"
                required
              />
              <button
                type="button"
                className="absolute top-3 right-3 grid size-6 place-items-center text-white/40 hover:text-white"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>

            {error && (
              <motion.p
                initial={{ opacity: 0, x: -6 }}
                animate={{ opacity: 1, x: [0, -6, 6, -3, 0] }}
                role="alert"
                className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200"
              >
                {error}
              </motion.p>
            )}

            <button
              type="submit"
              disabled={busy}
              className="group mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-white text-sm font-medium text-black transition hover:bg-white/90 active:scale-[0.99] disabled:opacity-60"
            >
              {busy ? (
                <LoaderCircle className="size-4 animate-spin" />
              ) : (
                <>
                  {isSignup ? 'Create account' : 'Log in'}
                  <ArrowRight className="size-4 transition group-hover:translate-x-0.5" />
                </>
              )}
            </button>
          </form>

          <p className="mt-10 text-center text-sm text-white/45">
            {isSignup ? 'Already have an account? ' : 'New here? '}
            <TransitionLink
              className="font-medium text-white underline decoration-white/20 underline-offset-4 hover:decoration-white"
              to={isSignup ? '/login' : '/signup'}
            >
              {isSignup ? 'Log in' : 'Create an account'}
            </TransitionLink>
          </p>
        </motion.div>
      </section>
    </main>
  );
}
