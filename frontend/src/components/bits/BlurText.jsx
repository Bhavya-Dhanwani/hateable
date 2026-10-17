// Adapted from React Bits "BlurText" — words fade up out of a blur, staggered.
import { motion } from 'motion/react';

export default function BlurText({ text, as = 'h1', delay = 0.08, className = '' }) {
  const Tag = motion[as];
  return (
    <Tag
      className={className}
      initial="hidden"
      animate="show"
      transition={{ staggerChildren: delay }}
    >
      {text.split(' ').map((word, i) => (
        <motion.span
          key={i}
          className="inline-block will-change-[filter,transform]"
          variants={{
            hidden: { filter: 'blur(12px)', opacity: 0, y: -24 },
            show: {
              filter: 'blur(0px)',
              opacity: 1,
              y: 0,
              transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] }
            }
          }}
        >
          {word}
          {' '}
        </motion.span>
      ))}
    </Tag>
  );
}
