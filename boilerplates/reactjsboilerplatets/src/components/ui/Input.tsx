import type { InputHTMLAttributes } from 'react';
import { useId } from 'react';

type Props = InputHTMLAttributes<HTMLInputElement> & {
  label?: string;
};

export function Input({ label, className = '', id, ...props }: Props) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label htmlFor={inputId} className="text-sm font-medium text-fg">
          {label}
        </label>
      )}
      <input
        id={inputId}
        className={[
          'h-10 w-full rounded-control border border-border bg-surface px-3 text-sm',
          'text-fg placeholder:text-muted focus-visible:outline-none focus-visible:ring-2',
          'focus-visible:ring-accent',
          className
        ]
          .filter(Boolean)
          .join(' ')}
        {...props}
      />
    </div>
  );
}
