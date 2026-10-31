export function Card({ className = '', ...props }) {
  return (
    <div
      className={['rounded-card border border-border bg-surface p-6 shadow-card', className]
        .filter(Boolean)
        .join(' ')}
      {...props}
    />
  );
}
