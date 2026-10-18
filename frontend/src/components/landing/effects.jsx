import {
  motion,
  useAnimate,
  useInView,
  useMotionValueEvent,
  useScroll,
  useTransform
} from 'motion/react';
import { useRef, useState } from 'react';

// Image effects for the landing page. Every image is a free Unsplash photo, hotlinked from their
// CDN (as Unsplash asks) and sized with srcset so phones never download desktop-sized files.

const unsplash = (id, width) =>
  `https://images.unsplash.com/photo-${id}?w=${width}&q=80&auto=format&fit=crop`;

export function Photo({ id, alt, sizes = '50vw', className = '', ...props }) {
  return (
    <img
      src={unsplash(id, 1200)}
      srcSet={[480, 800, 1200, 1800].map((w) => `${unsplash(id, w)} ${w}w`).join(', ')}
      sizes={sizes}
      alt={alt}
      loading="lazy"
      decoding="async"
      className={`h-full w-full object-cover ${className}`}
      {...props}
    />
  );
}

/**
 * Flex carousel: a row of photo panels; the one hovered, focused or tapped grows, the rest
 * shrink to slivers. On phones it turns into a vertical accordion: labelled strips stacked
 * top to bottom, the tapped one opens tall.
 */
export function FlexCarousel({ items }) {
  const [open, setOpen] = useState(0);
  return (
    <div className="flex h-[38rem] flex-col gap-1.5 md:h-[min(78svh,48rem)] md:flex-row md:gap-2">
      {items.map((item, i) => (
        <button
          key={item.id}
          type="button"
          aria-label={item.label}
          aria-pressed={open === i}
          onPointerEnter={() => setOpen(i)}
          onFocus={() => setOpen(i)}
          onClick={() => setOpen(i)}
          className={`relative min-h-0 min-w-0 basis-0 overflow-hidden rounded-[6px] bg-white/[0.04] text-left transition-[flex-grow] duration-700 ease-[cubic-bezier(.22,1,.36,1)] ${open === i ? 'grow-[7]' : 'grow'}`}
        >
          <Photo
            id={item.id}
            alt={item.alt}
            sizes="(min-width: 768px) 50vw, 80vw"
            className="absolute inset-0"
          />
          {/* phones: a collapsed strip still says what it is */}
          <span
            className={`absolute inset-0 flex items-center justify-between bg-black/45 px-4 transition-opacity duration-500 md:hidden ${open === i ? 'opacity-0' : 'opacity-100'}`}
          >
            <span className="text-sm font-medium">{item.label}</span>
            <span className="font-mono text-[11px] text-white/60 tabular-nums">
              {String(i + 1).padStart(2, '0')}
            </span>
          </span>
          <div
            className={`absolute inset-x-0 bottom-0 flex items-end justify-between gap-4 bg-gradient-to-t from-black/70 to-transparent p-4 pt-16 transition-opacity duration-500 sm:p-5 ${open === i ? 'opacity-100 delay-200' : 'opacity-0'}`}
          >
            <span className="truncate text-lg font-medium tracking-[-0.02em] sm:text-xl">
              {item.label}
            </span>
            <span className="font-mono text-[11px] text-white/60 tabular-nums">
              {String(i + 1).padStart(2, '0')}
            </span>
          </div>
        </button>
      ))}
    </div>
  );
}

const EASE_OUT = [0.22, 1, 0.36, 1];

/**
 * One row of the flowing menu: on hover a band slides in from the edge the cursor came through
 * (its contents slide the opposite way) carrying an endless strip of the label and photos.
 */
function FlowingRow({ item, index, onPick }) {
  const [band, animate] = useAnimate();
  const inner = useRef(null);
  const edge = (event) => {
    const r = event.currentTarget.getBoundingClientRect();
    return event.clientY - r.top < r.height / 2 ? -101 : 101;
  };
  const strip = Array.from({ length: 4 }, (_, n) => (
    <span key={n} className="flex shrink-0 items-center gap-6 pr-6">
      <span className="text-[clamp(1.75rem,4vw,3.25rem)] font-medium tracking-[-0.035em] whitespace-nowrap">
        {item.label}
      </span>
      <Photo
        id={item.images[n % item.images.length]}
        alt=""
        sizes="12rem"
        className="!h-[clamp(2.75rem,5vw,4.25rem)] !w-[clamp(6rem,11vw,9.5rem)] rounded-full"
      />
    </span>
  ));

  return (
    <li className="relative overflow-hidden border-t border-white/10 last:border-b">
      <button
        type="button"
        onClick={() => onPick(item.prompt)}
        onPointerEnter={(event) => {
          const from = edge(event);
          animate(band.current, { y: [`${from}%`, '0%'] }, { duration: 0.6, ease: EASE_OUT });
          animate(inner.current, { y: [`${-from}%`, '0%'] }, { duration: 0.6, ease: EASE_OUT });
        }}
        onPointerLeave={(event) => {
          const to = edge(event);
          animate(band.current, { y: `${to}%` }, { duration: 0.6, ease: EASE_OUT });
          animate(inner.current, { y: `${-to}%` }, { duration: 0.6, ease: EASE_OUT });
        }}
        className="flex w-full items-center justify-between gap-6 py-6 text-left sm:py-8"
      >
        <span className="flex items-baseline gap-5">
          <span className="font-mono text-[11px] text-white/35 tabular-nums">
            {String(index + 1).padStart(2, '0')}
          </span>
          <span className="text-[clamp(1.75rem,4vw,3.25rem)] leading-none font-medium tracking-[-0.035em]">
            {item.label}
          </span>
        </span>
        <span className="hidden max-w-xs truncate text-sm text-white/40 sm:block">
          {item.prompt}
        </span>
      </button>
      <div
        ref={band}
        aria-hidden
        // a plain transform (not Tailwind's translate property) so motion's y replaces it
        style={{ transform: 'translateY(101%)' }}
        className="pointer-events-none absolute inset-0 overflow-hidden bg-white text-black"
      >
        <div ref={inner} className="flex h-full items-center">
          <div className="flex w-max animate-[marquee_22s_linear_infinite] motion-reduce:animate-none">
            {strip}
            {strip}
          </div>
        </div>
      </div>
    </li>
  );
}

export function FlowingMenu({ items, onPick }) {
  return (
    <ul>
      {items.map((item, i) => (
        <FlowingRow key={item.label} item={item} index={i} onPick={onPick} />
      ))}
    </ul>
  );
}

// one stacked image: slides up over the one before it during its slice of the scroll,
// and dims once the next one starts covering it
function StackImage({ step, i, count, progress }) {
  const w = 1 / (count - 1);
  // clamped to 0..1: motion runs these on native scroll timelines, which reject other offsets
  const at = (n) => Math.min(1, Math.max(0, n));
  const enter = [at((i - 1) * w + 0.15 * w), at((i - 1) * w + 0.85 * w)];
  const leave = [at(i * w + 0.15 * w), at(i * w + 0.85 * w)];
  const y = useTransform(progress, enter, ['100%', '0%']);
  const dim = useTransform(progress, leave, [0, i === count - 1 ? 0 : 0.6]);
  return (
    <motion.div
      style={i === 0 ? undefined : { y }}
      className="absolute inset-0 overflow-hidden bg-panel"
    >
      {/* black and white until hovered, then full color; nothing moves */}
      <Photo
        id={step.id}
        alt={step.alt}
        sizes="(min-width: 1024px) 60vw, 100vw"
        className="grayscale transition-[filter] duration-700 ease-out group-hover:grayscale-0"
      />
      <motion.div style={{ opacity: dim }} className="absolute inset-0 bg-black" />
    </motion.div>
  );
}

/**
 * Pinned process: the section sticks for a few screens while scrolling stacks each step's image
 * over the last and swaps the text beside it. Thumbnails jump straight to a step.
 */
export function PinnedSteps({ steps }) {
  const track = useRef(null);
  const { scrollYProgress } = useScroll({ target: track, offset: ['start start', 'end end'] });
  const [active, setActive] = useState(0);
  const last = steps.length - 1;
  useMotionValueEvent(scrollYProgress, 'change', (p) => setActive(Math.round(p * last)));
  const bar = useTransform(scrollYProgress, [0, 1], ['0%', '100%']);

  function jump(i) {
    const el = track.current;
    const top = el.getBoundingClientRect().top + window.scrollY;
    window.scrollTo({
      top: top + (i / last) * (el.offsetHeight - window.innerHeight),
      behavior: 'smooth'
    });
  }

  return (
    <div ref={track} style={{ height: `${steps.length * 100}svh` }} className="relative">
      <div className="sticky top-0 flex h-svh flex-col justify-center gap-8 py-20 lg:grid lg:grid-cols-12 lg:items-center lg:gap-12">
        <div className="lg:col-span-4">
          <div className="flex items-end gap-4">
            <span className="text-[clamp(4.5rem,11vw,11rem)] leading-[0.8] font-medium tracking-[-0.06em] tabular-nums">
              {String(active + 1).padStart(2, '0')}
            </span>
            <span className="mb-2 font-mono text-[11px] text-white/35">
              / {String(steps.length).padStart(2, '0')}
            </span>
          </div>
          <div className="relative mt-8 min-h-[12rem] sm:min-h-[13rem]">
            {steps.map((step, i) => (
              <motion.div
                key={step.title}
                className="absolute inset-0"
                initial={false}
                animate={{
                  opacity: active === i ? 1 : 0,
                  y: active === i ? 0 : active > i ? -16 : 16
                }}
                transition={{ duration: 0.5, ease: EASE_OUT }}
                aria-hidden={active !== i}
              >
                <h3 className="text-[clamp(2.25rem,4vw,4rem)] leading-none font-medium tracking-[-0.04em]">
                  {step.title}
                </h3>
                <p className="mt-5 max-w-sm text-[15px] leading-7 text-white/55">{step.body}</p>
                <div className="mt-5 flex flex-wrap gap-2">
                  {step.tags.map((tag) => (
                    <span
                      key={tag}
                      className="rounded-full border border-white/10 px-3 py-1 font-mono text-[11px] text-white/50"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </motion.div>
            ))}
          </div>
          <div className="mt-8 hidden gap-2 sm:flex">
            {steps.map((step, i) => (
              <button
                key={step.title}
                type="button"
                onClick={() => jump(i)}
                aria-label={`Go to ${step.title}`}
                className={`h-14 w-20 overflow-hidden rounded-[4px] transition-opacity duration-300 ${active === i ? 'opacity-100 ring-1 ring-white' : 'opacity-40 hover:opacity-70'}`}
              >
                <Photo id={step.id} alt="" sizes="5rem" />
              </button>
            ))}
          </div>
          <div className="mt-6 h-px w-full max-w-xs bg-white/10">
            <motion.div style={{ width: bar }} className="h-full bg-white" />
          </div>
        </div>
        <div className="group relative h-[46svh] overflow-hidden rounded-[6px] lg:col-span-8 lg:h-[76svh]">
          {steps.map((step, i) => (
            <StackImage
              key={step.id}
              step={step}
              i={i}
              count={steps.length}
              progress={scrollYProgress}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

const SPRING = { type: 'spring', stiffness: 260, damping: 16 };

/**
 * Bounce cards: a fanned stack of photos that springs in, and spreads apart around the one
 * you hover, which straightens and lifts.
 */
export function BounceCards({ items, className = '' }) {
  const [hovered, setHovered] = useState(null);
  // watched on the wrapper: the cards start at scale 0, and a zero-size box never intersects
  const box = useRef(null);
  const shown = useInView(box, { once: true, amount: 0.4 });
  const mid = (items.length - 1) / 2;
  return (
    <div
      ref={box}
      className={`relative flex items-center justify-center ${className}`}
      onPointerLeave={() => setHovered(null)}
    >
      {items.map((item, i) => {
        const k = i - mid;
        const push = hovered === null || hovered === i ? 0 : Math.sign(i - hovered) * 28;
        return (
          <motion.div
            key={item.id}
            className="absolute aspect-[3/4] w-[clamp(6.5rem,13vw,14rem)] overflow-hidden rounded-[8px] border-4 border-white bg-panel shadow-2xl shadow-black/60"
            style={{ zIndex: hovered === i ? 20 : 10 - Math.abs(Math.round(k)) }}
            initial={{ scale: 0, x: '0%', rotate: 0 }}
            animate={{
              scale: shown ? 1 : 0,
              x: `${k * 52 + push}%`,
              y: hovered === i ? '-6%' : `${Math.abs(k) * 5}%`,
              rotate: hovered === i ? 0 : k * 7
            }}
            transition={{ ...SPRING, scale: { ...SPRING, delay: 0.15 + i * 0.07 } }}
            onPointerEnter={() => setHovered(i)}
          >
            <Photo id={item.id} alt={item.alt} sizes="14rem" />
          </motion.div>
        );
      })}
    </div>
  );
}
