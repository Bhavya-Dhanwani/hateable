import { motion } from 'motion/react';
import { useCallback, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { TransitionContext, useHeartbreak } from './heartbreak-context.js';
import { LogoMark } from './Logo.jsx';

// Route transition: two ink halves close along a hairline crack, the mark settles while the
// next page mounts underneath, then the halves crack apart and slide away. Transforms and
// opacity only (no filters, no blur) so it stays on the compositor and never drops a frame.
const CRACK = [
  [50.5, 0],
  [49, 22],
  [51, 41],
  [48.8, 63],
  [50.6, 82],
  [49.6, 100]
];
const CRACK_CSS = CRACK.map(([x, y]) => `${x}% ${y}%`).join(', ');
const LEFT = `polygon(0 0, ${CRACK_CSS}, 0 100%)`;
const RIGHT = `polygon(${CRACK_CSS}, 100% 100%, 100% 0)`;
const SEAM = CRACK.map(([x, y]) => `${x},${y}`).join(' ');

const EASE = [0.65, 0, 0.35, 1];
const COVER_S = 0.6;
const MIN_HOLD_MS = 260;

const nextFrame = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

const half = (side) => ({
  idle: { x: `${side * 101}%`, transition: { duration: 0 } },
  cover: { x: '0%', transition: { duration: COVER_S, ease: EASE } },
  // a short crack first, then the halves glide off
  reveal: {
    x: ['0%', `${side * 1.5}%`, `${side * 101}%`],
    transition: { duration: 0.85, times: [0, 0.22, 1], ease: ['easeOut', EASE] }
  }
});

function Half({ side, clip, onAnimationComplete }) {
  return (
    <motion.div
      className="absolute inset-0 bg-ink"
      variants={half(side)}
      onAnimationComplete={onAnimationComplete}
      style={{ clipPath: clip, willChange: 'transform' }}
    />
  );
}

export function HeartbreakProvider({ children }) {
  const navigate = useNavigate();
  const [phase, setPhase] = useState('idle');
  const pending = useRef(null);
  const queued = useRef(null);
  const busy = phase !== 'idle';

  /** Cover the screen, run `onCovered` (e.g. commit login state), navigate, then break open. */
  const go = useCallback(
    (to, { onCovered, replace = false } = {}) => {
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        onCovered?.();
        navigate(to, { replace });
        return;
      }
      // mid-transition: run this one next instead of dropping it (e.g. login right after logout)
      if (pending.current) {
        queued.current = { to, onCovered, replace };
        return;
      }
      pending.current = { to, onCovered, replace };
      setPhase('cover');
    },
    [navigate]
  );

  async function onAnimationComplete(definition) {
    if (definition === 'cover' && pending.current) {
      const { to, onCovered, replace } = pending.current;
      try {
        await onCovered?.();
      } catch (error) {
        console.error(error); // still navigate and reveal; a failed callback must not freeze the curtain
      }
      const coveredAt = performance.now();
      navigate(to, { replace });
      // let the next page paint underneath, but never flash the mark for just a frame
      await nextFrame();
      await new Promise((r) =>
        setTimeout(r, Math.max(0, MIN_HOLD_MS - (performance.now() - coveredAt)))
      );
      setPhase('reveal');
    } else if (definition === 'reveal') {
      pending.current = queued.current;
      queued.current = null;
      setPhase(pending.current ? 'cover' : 'idle');
    }
  }

  return (
    <TransitionContext value={{ go, busy }}>
      {children}
      <motion.div
        className="fixed inset-0 z-[90]"
        style={{ pointerEvents: busy ? 'auto' : 'none', visibility: busy ? 'visible' : 'hidden' }}
        initial="idle"
        animate={phase}
        aria-hidden="true"
      >
        <Half side={-1} clip={LEFT} onAnimationComplete={onAnimationComplete} />
        <Half side={1} clip={RIGHT} />

        {/* the seam draws itself top to bottom once the halves meet */}
        <svg
          className="absolute inset-0 size-full"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          fill="none"
        >
          <motion.polyline
            points={SEAM}
            stroke="rgb(255 255 255 / 0.22)"
            strokeWidth="1"
            vectorEffect="non-scaling-stroke"
            variants={{
              idle: { pathLength: 0, opacity: 0 },
              cover: {
                pathLength: 1,
                opacity: 1,
                transition: { delay: COVER_S * 0.75, duration: 0.45, ease: EASE }
              },
              reveal: { opacity: 0, transition: { duration: 0.15 } }
            }}
          />
        </svg>

        <motion.div
          className="absolute inset-0 grid place-items-center"
          variants={{
            idle: { opacity: 0, scale: 0.92 },
            cover: {
              opacity: 1,
              scale: 1,
              transition: { delay: COVER_S * 0.8, duration: 0.4, ease: [0.22, 1, 0.36, 1] }
            },
            reveal: { opacity: 0, scale: 0.96, transition: { duration: 0.18 } }
          }}
        >
          <LogoMark size={36} />
        </motion.div>
      </motion.div>
    </TransitionContext>
  );
}

/** <a> that navigates through the heartbreak transition (keeps cmd/ctrl-click working). */
export function TransitionLink({ to, onClick, ...props }) {
  const { go } = useHeartbreak();
  return (
    <a
      href={to}
      onClick={(e) => {
        onClick?.(e);
        if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
        e.preventDefault();
        go(to);
      }}
      {...props}
    />
  );
}
