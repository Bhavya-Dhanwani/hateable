import { AnimatePresence, motion } from 'motion/react';
import { ArrowRight, ArrowUpRight, Check } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { useAuth } from '../auth/auth-context.js';
import { TransitionLink } from '../components/HeartbreakTransition.jsx';
import { useHeartbreak } from '../components/heartbreak-context.js';
import { Logo } from '../components/Logo.jsx';
import { PromptBox } from '../components/PromptBox.jsx';
import {
  BounceCards,
  FlexCarousel,
  FlowingMenu,
  Photo,
  PinnedSteps
} from '../components/landing/effects.jsx';
import { savePendingPrompt } from '../utils/pendingPrompt.js';
import { usePublicConfig } from '../api/payments.js';
import { PaymentDialog } from '../components/PaymentDialog.jsx';

// photos: free Unsplash images (ids), hotlinked from their CDN

// the hero: one image at a time, full screen
const SLIDES = [
  { id: '1650943574955-ac02c65cfc71', alt: 'A spiral of dark blades with glowing teal edges' },
  { id: '1643139863038-7355941e9e89', alt: 'Glass rings glowing purple against black' },
  { id: '1622737133809-d95047b9e673', alt: 'Dark floating cubes and two glowing yellow spheres' },
  { id: '1627637819794-fba32f82be16', alt: 'Blue layered waves blooming out of the dark' }
];
const SLIDE_MS = 6500;

const STRIP = [
  {
    id: '1603189343302-e603f7add05a',
    label: 'Portfolio',
    alt: 'A person in a wide-sleeved black jacket in silhouette'
  },
  { id: '1542291026-7eec264c27ff', label: 'Store', alt: 'A red sneaker on a red background' },
  {
    id: '1545418314-7ce0b9b53901',
    label: 'Café',
    alt: 'An espresso machine below a chalkboard menu'
  },
  {
    id: '1631125915902-d8abe9225ff2',
    label: 'Maker shop',
    alt: 'Three clay vases on a white concrete table'
  },
  {
    id: '1498075702571-ecb018f3752d',
    label: 'Studio',
    alt: 'Hand lettering on tracing paper with a pencil'
  },
  { id: '1666621630026-862eea07236c', label: 'Launch', alt: 'A perfume bottle in soft light' },
  {
    id: '1574015974293-817f0ebebb74',
    label: 'Lookbook',
    alt: 'A black-and-white portrait in a long-sleeved shirt'
  },
  {
    id: '1770739538932-433941c1267e',
    label: 'Booking',
    alt: 'A modern café interior with tables and chairs'
  }
];

// the flowing menu: click a row to start a project from that prompt
const STARTERS = [
  {
    label: 'Portfolio',
    prompt: 'a portfolio that feels like a Mac desktop',
    images: ['1595065820514-a4181d40f2c6', '1558683018-e0e6e20f2bdb']
  },
  {
    label: 'Online store',
    prompt: 'a sneaker store with a cart and checkout',
    images: ['1780832000120-23892cd70642', '1789520482092-bf7a66ef8281']
  },
  {
    label: 'Café',
    prompt: 'a café site with a menu and table booking',
    images: ['1610632380989-680fe40816c6', '1596098823457-74e360fcd023']
  },
  {
    label: 'Product launch',
    prompt: 'a launch page with a waitlist for a new perfume',
    images: ['1608528577891-eb055944f2e7', '1608721279136-cd41b752fa41']
  }
];

// the close: a fan of product shots, the kind of thing people ship from here
const CARDS = [
  { id: '1601784551446-20c9e07cdbdb', alt: 'A phone showing an app on a dark surface' },
  { id: '1525547719571-a2d4ac8945e2', alt: 'A laptop glowing in a dark room' },
  { id: '1597740985671-2a8a3b80502e', alt: 'A phone app lit in purple' },
  { id: '1547119957-637f8679db1e', alt: 'A desk with dashboards on screen' },
  { id: '1502783167913-8e718e555a06', alt: 'A laptop with a purple glow in the dark' }
];

// pricing: `key` matches the user's `plan` field in authService (free | pro | team)
const PLANS = [
  {
    key: 'free',
    name: 'Hobby',
    price: '₹0',
    per: 'forever',
    blurb: 'For trying it out and building things you only half hate.',
    features: [
      '2 projects: 2 frontend, 2 backend, 1 of each, or 1 full‑stack',
      '2 AI messages every 24 hours, runs of up to 40 agents',
      'Custom domains',
      'GitHub push and pull',
      'Image generation in 1 project',
      'Agents test your app in a real browser, in 1 project',
      'Ask AI about your live site’s logs and traffic, in 1 project',
      'Deploys that nap when nobody visits'
    ],
    cta: 'Start free'
  },
  {
    key: 'pro',
    name: 'Pro',
    price: '₹999',
    per: 'per month',
    blurb: 'For people shipping every week who want it to stay awake.',
    features: [
      'Everything in Hobby',
      '10 projects, any stack',
      '100 AI messages a day, longer runs (up to 200 agents)',
      'Always-on deployments',
      'Image generation, real-browser testing and live-site AI in every project'
    ],
    cta: 'Go Pro',
    featured: true
  },
  {
    key: 'team',
    name: 'Team',
    price: '₹1,999',
    per: 'per seat / month',
    blurb: 'For studios and teams building together, under one bill.',
    features: [
      'Everything in Pro',
      'Shared workspaces',
      'Roles and access control',
      '500 AI messages a day, pooled across the team',
      'Usage analytics per member and project',
      'Priority support'
    ],
    cta: 'Start a team'
  }
];

const STEPS = [
  {
    id: '1620121692029-d088224ddc74',
    alt: 'Deep blue layered waves glowing in the dark',
    title: 'Describe it',
    tags: ['Planner', 'Coder', 'Live files'],
    body: 'One sentence is enough. Agents plan it, split the work and write real files into a live workspace while you watch.'
  },
  {
    id: '1620641788421-7a1c342ea42e',
    alt: 'Dark purple folds with a hot pink glow',
    title: 'Shape it',
    tags: ['Code editor', 'Terminal', 'Browser QA'],
    body: 'Step into the code, a real terminal, the live preview. Agents review each other and check it in a real browser.'
  },
  {
    id: '1614851099511-773084f6911d',
    alt: 'Dark red and magenta light bleeding through black',
    title: 'Ship it',
    tags: ['One click', 'Custom domain', 'Idle sleep'],
    body: 'One click puts it on its own address or your domain. It naps when nobody visits and wakes for the next person.'
  }
];

const EASE = [0.22, 1, 0.36, 1];

/**
 * The hero image: fades in on load, then crossfades to the next slide every few seconds.
 * A thin progress line and 01/04 counter keep time.
 */
function HeroSlides() {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return undefined;
    const id = setInterval(() => setIndex((i) => (i + 1) % SLIDES.length), SLIDE_MS);
    return () => clearInterval(id);
  }, []);

  return (
    <>
      <motion.div
        className="absolute inset-0 overflow-hidden bg-[#050507]"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 1.2, delay: 0.1, ease: 'easeOut' }}
      >
        <AnimatePresence initial={false}>
          <motion.div
            key={index}
            className="absolute inset-0"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 1.4, ease: 'easeInOut' }}
          >
            <Photo
              id={SLIDES[index].id}
              alt={SLIDES[index].alt}
              sizes="100vw"
              loading={index === 0 ? 'eager' : 'lazy'}
              fetchPriority={index === 0 ? 'high' : 'auto'}
            />
          </motion.div>
        </AnimatePresence>
        {/* shade the corner the words sit in, keep the rest of the image untouched */}
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_top,rgb(5_5_7/0.85),rgb(5_5_7/0.15)_45%,transparent_70%)]" />
      </motion.div>

      <div className="absolute top-24 right-5 z-10 hidden w-40 sm:right-8 sm:block lg:right-12">
        <div className="flex justify-between font-mono text-[11px] text-white/60 tabular-nums">
          <span>{String(index + 1).padStart(2, '0')}</span>
          <span className="text-white/35">{String(SLIDES.length).padStart(2, '0')}</span>
        </div>
        <div className="mt-2 h-px overflow-hidden bg-white/15">
          <motion.div
            key={index}
            className="h-full origin-left bg-white"
            initial={{ scaleX: 0 }}
            animate={{ scaleX: 1 }}
            transition={{ duration: SLIDE_MS / 1000, ease: 'linear' }}
          />
        </div>
      </div>
    </>
  );
}

// every section opens the same way: a rule, a small index on the left, a big title on the right
function SectionHead({ index, label, title, note }) {
  return (
    <header className="mb-14 grid grid-cols-1 gap-6 border-t border-white/10 pt-6 sm:mb-20 lg:grid-cols-12">
      <span className="font-mono text-[11px] tracking-wide text-white/40 uppercase tabular-nums lg:col-span-3">
        {index} / 06 &nbsp;·&nbsp; {label}
      </span>
      <h2 className="text-[clamp(2.5rem,6vw,6.5rem)] leading-[0.95] font-medium tracking-[-0.045em] lg:col-span-7">
        {title}
      </h2>
      {note && (
        <p className="max-w-xs text-sm leading-6 text-white/45 lg:col-span-2 lg:self-end">{note}</p>
      )}
    </header>
  );
}

const GUTTER = 'px-5 sm:px-8 lg:px-12';

export function LandingPage() {
  const { user } = useAuth();
  const { go } = useHeartbreak();
  const config = usePublicConfig();
  const [payPlan, setPayPlan] = useState(null); // open the UPI dialog for this plan

  // Projects are always created through the name + stack dialog; the prompt rides along.
  function start({ prompt, projectType }) {
    savePendingPrompt({ prompt, projectType });
    go(user ? '/projects' : '/signup');
  }

  return (
    <main className="min-h-svh bg-ink text-white">
      <nav className="fixed inset-x-0 top-0 z-30 border-b border-white/[0.06] bg-ink/55 backdrop-blur-xl backdrop-saturate-150">
        <div className={`flex h-16 items-center justify-between ${GUTTER}`}>
          <Link to="/" aria-label="Hateable home">
            <Logo size={22} />
          </Link>
          <div className="flex items-center gap-1 text-sm">
            {user ? (
              <TransitionLink
                to="/projects"
                className="flex items-center gap-1.5 rounded-full bg-white/10 px-4 py-2 text-white backdrop-blur-md transition hover:bg-white/20"
              >
                Your projects <ArrowRight className="size-3.5" />
              </TransitionLink>
            ) : (
              <>
                <TransitionLink
                  to="/login"
                  className="rounded-full px-4 py-2 text-white/70 transition hover:text-white"
                >
                  Log in
                </TransitionLink>
                <TransitionLink
                  to="/signup"
                  className="rounded-full bg-white/10 px-4 py-2 text-white backdrop-blur-md transition hover:bg-white/20"
                >
                  Start building
                </TransitionLink>
              </>
            )}
          </div>
        </div>
      </nav>

      {/* hero: the headline owns the screen, the prompt sits bottom right, details bottom left */}
      <section className="relative h-svh min-h-[40rem]">
        <HeroSlides />
        <div className={`relative z-10 flex h-full flex-col justify-end pb-8 sm:pb-12 ${GUTTER}`}>
          <motion.h1
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 1.1, delay: 0.5, ease: EASE }}
            className="text-[clamp(3rem,8.6vw,10rem)] leading-[0.9] font-medium tracking-[-0.055em]"
          >
            Build something you&rsquo;ll
            <br />
            <span className="font-serif font-normal tracking-[-0.02em] italic">hate to love.</span>
          </motion.h1>
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 1, delay: 0.75, ease: EASE }}
            className="mt-10 grid grid-cols-1 items-end gap-8 lg:grid-cols-12"
          >
            <p className="max-w-xs text-sm leading-6 text-white/55 lg:col-span-4">
              One sentence in. Agents write, test and ship a real app, live on its own address.
            </p>
            <div className="min-w-0 lg:col-span-6 lg:col-start-7 xl:col-span-5 xl:col-start-8">
              <PromptBox onSubmit={start} />
            </div>
          </motion.div>
        </div>
      </section>

      {/* ideas: a flex carousel across the full width */}
      <section className={`py-28 sm:py-40 ${GUTTER}`}>
        <SectionHead
          index="02"
          label="Ideas"
          title="Things you could build tonight."
          note="Hover a panel. Every one of these started as a single sentence."
        />
        <FlexCarousel items={STRIP.slice(0, 6)} />
      </section>

      {/* how it works: pinned while scrolling stacks one image per step */}
      <section className={`pb-28 sm:pb-40 ${GUTTER}`}>
        <SectionHead
          index="03"
          label="Process"
          title="From a sentence to a site."
          note="Keep scrolling. It stays put while the steps play."
        />
        <PinnedSteps steps={STEPS} />
      </section>

      {/* start from: a flowing menu, each row starts a project */}
      <section className={`pb-28 sm:pb-40 ${GUTTER}`}>
        <SectionHead
          index="04"
          label="Start"
          title="Or start from one of these."
          note="Click a row and it becomes your first prompt."
        />
        <FlowingMenu
          items={STARTERS}
          onPick={(prompt) => start({ prompt: `Build ${prompt}`, projectType: 'react-ts' })}
        />
      </section>

      {/* pricing: three plans side by side, the middle one carries the weight. Hidden in free mode. */}
      {!config?.freeMode && (
        <section className={`pb-28 sm:pb-40 ${GUTTER}`}>
          <SectionHead
            index="05"
            label="Pricing"
            title="Pick how much you want to hate it."
            note="Start free. Upgrade when your side project stops being one."
          />
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
            {PLANS.map((plan) => {
              const current = user && (user.plan ?? 'free') === plan.key;
              return (
                <article
                  key={plan.key}
                  className={`flex flex-col rounded-[8px] border p-6 sm:p-8 ${plan.featured ? 'border-white bg-white text-black' : 'border-white/10 bg-white/[0.03]'}`}
                >
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-medium tracking-[-0.02em]">{plan.name}</h3>
                    {(current || plan.featured) && (
                      <span
                        className={`rounded-full px-2.5 py-1 font-mono text-[10px] tracking-wide uppercase ${plan.featured ? 'bg-black text-white' : 'bg-white/10 text-white/70'}`}
                      >
                        {current ? 'Your plan' : 'Most picked'}
                      </span>
                    )}
                  </div>
                  <div className="mt-10 flex items-baseline gap-2">
                    <span className="text-[clamp(3rem,5vw,4.5rem)] leading-none font-medium tracking-[-0.05em]">
                      {plan.price}
                    </span>
                    <span
                      className={`text-sm ${plan.featured ? 'text-black/50' : 'text-white/40'}`}
                    >
                      {plan.per}
                    </span>
                  </div>
                  <p
                    className={`mt-4 max-w-xs text-sm leading-6 ${plan.featured ? 'text-black/60' : 'text-white/50'}`}
                  >
                    {plan.blurb}
                  </p>
                  <ul
                    className={`mt-8 flex-1 space-y-3 border-t pt-8 text-sm ${plan.featured ? 'border-black/10' : 'border-white/10'}`}
                  >
                    {plan.features.map((feature) => (
                      <li key={feature} className="flex items-start gap-3 leading-5">
                        <Check
                          className={`mt-0.5 size-4 shrink-0 ${plan.featured ? 'text-black' : 'text-white/60'}`}
                        />
                        {feature}
                      </li>
                    ))}
                  </ul>
                  {(() => {
                    const cls = `group mt-10 inline-flex h-12 items-center justify-between rounded-full px-6 text-sm font-medium transition ${plan.featured ? 'bg-black text-white hover:bg-black/85' : 'bg-white/10 text-white hover:bg-white/20'}`;
                    const arrow = (
                      <ArrowUpRight className="size-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                    );
                    // logged-in, upgrading to a paid plan, payments on -> open the UPI dialog
                    if (user && !current && plan.key !== 'free' && config?.upiEnabled) {
                      return (
                        <button type="button" onClick={() => setPayPlan(plan.key)} className={cls}>
                          {plan.cta}
                          {arrow}
                        </button>
                      );
                    }
                    return (
                      <TransitionLink to={user ? '/projects' : '/signup'} className={cls}>
                        {current ? 'Open your projects' : plan.cta}
                        {arrow}
                      </TransitionLink>
                    );
                  })()}
                </article>
              );
            })}
          </div>
        </section>
      )}

      {/* the close: the headline on the left, a fan of bounce cards on the right */}
      <section className={`overflow-x-clip pt-6 pb-28 sm:pb-40 ${GUTTER}`}>
        <div className="grid grid-cols-1 items-center gap-16 border-t border-white/10 pt-6 lg:grid-cols-12">
          <div className="lg:col-span-6">
            <span className="font-mono text-[11px] tracking-wide text-white/40 uppercase tabular-nums">
              06 / 06 &nbsp;·&nbsp; Go
            </span>
            <h2 className="mt-10 text-[clamp(2.75rem,7vw,8rem)] leading-[0.9] font-medium tracking-[-0.05em]">
              Your next app is one <span className="font-serif font-normal italic">sentence</span>{' '}
              away.
            </h2>
            <TransitionLink
              to={user ? '/projects' : '/signup'}
              className="group mt-10 inline-flex h-12 items-center gap-2 rounded-full bg-white px-6 text-sm font-medium text-black transition hover:bg-white/90"
            >
              {user ? 'Open your projects' : 'Start building'}
              <ArrowUpRight className="size-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
            </TransitionLink>
          </div>
          <BounceCards items={CARDS} className="h-[22rem] sm:h-[30rem] lg:col-span-6" />
        </div>
      </section>

      <footer
        className={`grid grid-cols-1 items-center gap-4 py-10 font-mono text-[11px] text-white/35 sm:grid-cols-3 ${GUTTER}`}
      >
        <Logo size={18} />
        <span className="sm:text-center">Imagery from Unsplash</span>
        <span className="sm:text-right">Made with mild contempt</span>
      </footer>

      <PaymentDialog open={!!payPlan} plan={payPlan || 'pro'} onClose={() => setPayPlan(null)} />
    </main>
  );
}
