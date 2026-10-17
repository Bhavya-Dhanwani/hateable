import { motion } from 'motion/react';
import { ArrowRight, Code2, MessageSquareHeart, Rocket } from 'lucide-react';
import { Link } from 'react-router';
import { useAuth } from '../auth/auth-context.js';
import HeroGlow from '../components/bits/HeroGlow.jsx';
import BlurText from '../components/bits/BlurText.jsx';
import RotatingText from '../components/bits/RotatingText.jsx';
import SpotlightCard from '../components/bits/SpotlightCard.jsx';
import { TransitionLink } from '../components/HeartbreakTransition.jsx';
import { useHeartbreak } from '../components/heartbreak-context.js';
import { Logo } from '../components/Logo.jsx';
import { PromptBox } from '../components/PromptBox.jsx';
import { savePendingPrompt } from '../utils/pendingPrompt.js';

const FEATURES = [
  {
    icon: MessageSquareHeart,
    title: 'Talk, it builds',
    body: 'An AI agent that reads, writes and refactors real files in your project — and streams every step.'
  },
  {
    icon: Code2,
    title: 'A real editor',
    body: 'Monaco, a live file tree and full control. Take the wheel whenever the AI gets too confident.'
  },
  {
    icon: Rocket,
    title: 'Live in seconds',
    body: 'Every project gets its own isolated runtime and preview URL, spun up on demand.'
  }
];

const rise = { hidden: { opacity: 0, y: 24 }, show: { opacity: 1, y: 0 } };

export function LandingPage() {
  const { user } = useAuth();
  const { go } = useHeartbreak();

  // Projects are always created through the name + stack dialog; the prompt rides along.
  function start({ prompt, projectType }) {
    savePendingPrompt({ prompt, projectType });
    go(user ? '/projects' : '/signup');
  }

  return (
    <main className="grain relative min-h-svh overflow-hidden bg-ink">
      <div className="grid-fade absolute inset-0" />

      <nav className="relative z-10 mx-auto flex h-18 max-w-6xl items-center justify-between px-5">
        <Link to="/" aria-label="Hateable home">
          <Logo />
        </Link>
        <div className="flex items-center gap-2">
          {user ? (
            <TransitionLink
              to="/projects"
              className="flex items-center gap-1.5 rounded-full bg-white px-4 py-2 text-sm font-medium text-ink transition hover:bg-white/90"
            >
              Your projects <ArrowRight className="size-3.5" />
            </TransitionLink>
          ) : (
            <>
              <TransitionLink
                to="/login"
                className="rounded-full px-4 py-2 text-sm text-white/70 transition hover:text-white"
              >
                Log in
              </TransitionLink>
              <TransitionLink
                to="/signup"
                className="rounded-full bg-white px-4 py-2 text-sm font-medium text-ink transition hover:bg-white/90"
              >
                Get started
              </TransitionLink>
            </>
          )}
        </div>
      </nav>

      <section className="relative z-10 mx-auto flex max-w-3xl flex-col items-center px-5 pt-[12svh] text-center">
        <motion.a
          href="#features"
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8 flex items-center gap-2 rounded-full border border-line bg-white/[0.03] py-1 pr-3 pl-1 text-xs text-white/70 backdrop-blur"
        >
          <span className="rounded-full bg-white px-2 py-0.5 font-medium text-black">New</span>
          <span className="shiny-text">AI agent now edits your files live</span>
        </motion.a>

        <BlurText
          text="Build something you'll"
          className="text-4xl font-semibold tracking-tight text-white sm:text-6xl"
        />
        <h1 className="mt-1 font-serif text-5xl italic tracking-tight sm:text-7xl">
          <RotatingText texts={['hate to love', 'ship tonight', 'never debug', 'brag about']} />
        </h1>
        <motion.p
          initial="hidden"
          animate="show"
          variants={rise}
          transition={{ delay: 0.5, duration: 0.6 }}
          className="mt-5 max-w-lg text-base text-white/55 sm:text-lg"
        >
          Describe an app. Hateable writes the code, runs it and hands you the keys. Brutally fast.
        </motion.p>

        <motion.div
          initial="hidden"
          animate="show"
          variants={rise}
          transition={{ delay: 0.7, duration: 0.7 }}
          className="relative mt-10 w-full"
        >
          <HeroGlow className="absolute inset-x-[-25%] -top-[30%] -z-10 h-[220%]" />
          <PromptBox onSubmit={start} />
        </motion.div>
      </section>

      <section
        id="features"
        className="relative z-10 mx-auto grid max-w-6xl gap-4 px-5 pt-32 pb-24 md:grid-cols-3"
      >
        {FEATURES.map(({ icon: Icon, title, body }, i) => (
          <motion.div
            key={title}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true }}
            variants={rise}
            transition={{ delay: i * 0.1, duration: 0.6 }}
          >
            <SpotlightCard className="h-full rounded-2xl border border-line bg-panel/70 p-6 backdrop-blur">
              <span className="mb-5 grid size-10 place-items-center rounded-xl bg-white/[0.06] text-white/80">
                <Icon className="size-5" />
              </span>
              <h3 className="text-lg font-medium text-white">{title}</h3>
              <p className="mt-2 text-sm leading-6 text-white/50">{body}</p>
            </SpotlightCard>
          </motion.div>
        ))}
      </section>

      <footer className="relative z-10 border-t border-line">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-8 text-xs text-white/35">
          <Logo size={20} />
          <span>Made with mild contempt.</span>
        </div>
      </footer>
    </main>
  );
}
