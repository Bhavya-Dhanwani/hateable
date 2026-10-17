// Lovable-style "sunrise": one soft blue → pink → orange bloom that slowly breathes.
// Pure CSS (see .hero-glow in styles.css) — cheaper and cleaner than a shader.
export default function HeroGlow({ className = '' }) {
  return (
    <div className={`pointer-events-none ${className}`} aria-hidden="true">
      <div className="hero-glow h-full w-full" />
    </div>
  );
}
