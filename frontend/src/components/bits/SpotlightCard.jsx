// Adapted from React Bits "SpotlightCard" — a radial glow follows the cursor.
export default function SpotlightCard({
  as: Tag = 'div',
  className = '',
  color = 'rgba(255, 255, 255, 0.06)',
  children,
  ...props
}) {
  function track(event) {
    const rect = event.currentTarget.getBoundingClientRect();
    event.currentTarget.style.setProperty('--mx', `${event.clientX - rect.left}px`);
    event.currentTarget.style.setProperty('--my', `${event.clientY - rect.top}px`);
  }

  return (
    <Tag
      className={`spotlight-card ${className}`}
      style={{ '--spot': color }}
      onMouseMove={track}
      {...props}
    >
      {children}
    </Tag>
  );
}
