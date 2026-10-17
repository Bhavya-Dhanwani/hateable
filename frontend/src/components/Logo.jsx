import { motion } from 'motion/react';
import { useId } from 'react';

// SVG rebuild of the Canva mark (public/brand/hateable-logo-canva.png) so it can move.
// The two halves drift apart on hover; `beat` adds a slow heartbeat; `split` breaks it fully.
export function LogoMark({ size = 32, beat = false, split = false, className = '' }) {
  const id = useId();
  const half = {
    rest: { x: 0, rotate: 0 },
    hover: (dir) => ({ x: dir * 2.5, rotate: dir * 6 }),
    split: (dir) => ({
      x: dir * 16,
      y: 6,
      rotate: dir * 22,
      transition: { type: 'spring', damping: 14, stiffness: 220 }
    })
  };

  return (
    <motion.svg
      viewBox="0 0 64 64"
      width={size}
      height={size}
      className={className}
      initial="rest"
      whileHover="hover"
      animate={split ? 'split' : beat ? { scale: [1, 1.08, 1, 1.05, 1] } : undefined}
      transition={
        beat && !split
          ? { duration: 1.6, repeat: Infinity, repeatDelay: 0.6, ease: 'easeInOut' }
          : undefined
      }
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={`${id}l`} x1="4" y1="8" x2="32" y2="56" gradientUnits="userSpaceOnUse">
          <stop stopColor="#FF7A45" />
          <stop offset="1" stopColor="#FF2E7E" />
        </linearGradient>
        <linearGradient id={`${id}r`} x1="34" y1="8" x2="60" y2="50" gradientUnits="userSpaceOnUse">
          <stop stopColor="#FF4FA3" />
          <stop offset="1" stopColor="#8B5CF6" />
        </linearGradient>
      </defs>
      <motion.g variants={half} custom={-1} style={{ originX: '50%', originY: '90%' }}>
        <path d="M31 15 26 9H14L5 17v10l7 11 18 18-1-10 5-14-6-4z" fill={`url(#${id}l)`} />
        <path d="m21 23-5 5 5 5" stroke="#0B0A10" strokeWidth="3.2" strokeLinecap="square" />
      </motion.g>
      <motion.g variants={half} custom={1} style={{ originX: '50%', originY: '90%' }}>
        <path d="M35 15 40 9h11l9 8v10l-7 11-18 18 1-10 5-14-6-4z" fill={`url(#${id}r)`} />
        <path d="m44 23 5 5-5 5" stroke="#0B0A10" strokeWidth="3.2" strokeLinecap="square" />
      </motion.g>
    </motion.svg>
  );
}

export function Logo({ size = 28, beat = false }) {
  return (
    <span className="flex items-center gap-2.5">
      <LogoMark size={size} beat={beat} />
      <span className="text-[1.15rem] font-semibold tracking-tight text-white">hateable</span>
    </span>
  );
}
