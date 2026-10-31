import type { HTMLAttributes } from 'react';

type Props = HTMLAttributes<HTMLDivElement>;

export function Card({ className = '', ...props }: Props) {
  return (
    <div
      className={['rounded-card border border-border bg-surface p-6 shadow-card', className]
        .filter(Boolean)
        .join(' ')}
      {...props}
    />
  );
}
