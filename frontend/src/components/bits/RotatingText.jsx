// Adapted from React Bits "RotatingText" — cycles words with a per-letter spring.
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useState } from 'react';

const letter = {
  enter: { y: '110%', opacity: 0 },
  show: (i) => ({
    y: 0,
    opacity: 1,
    transition: { type: 'spring', damping: 26, stiffness: 380, delay: i * 0.022 }
  }),
  exit: (i) => ({ y: '-110%', opacity: 0, transition: { duration: 0.18, delay: i * 0.01 } })
};

export default function RotatingText({ texts, interval = 2600, className = '' }) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setIndex((i) => (i + 1) % texts.length), interval);
    return () => clearInterval(id);
  }, [texts.length, interval]);

  return (
    <span className="inline-flex overflow-hidden pb-[0.12em] align-bottom">
      <span className="sr-only">{texts[index]}</span>
      <AnimatePresence mode="wait" initial={false}>
        <motion.span
          key={index}
          className="inline-flex"
          initial="enter"
          animate="show"
          exit="exit"
          aria-hidden="true"
        >
          {[...texts[index]].map((ch, i) => (
            <motion.span
              key={i}
              custom={i}
              variants={letter}
              className={`inline-block ${className}`}
            >
              {ch === ' ' ? ' ' : ch}
            </motion.span>
          ))}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}
