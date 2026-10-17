import HeroGlow from './bits/HeroGlow.jsx';
import { LogoMark } from './Logo.jsx';

export function LoadingScreen({ label = 'Loading', detail }) {
  return (
    <main className="relative isolate grid min-h-svh place-items-center overflow-hidden bg-ink">
      <HeroGlow className="absolute top-1/2 left-1/2 -z-10 h-[50vh] w-[min(110vw,52rem)] -translate-x-1/2 -translate-y-1/3 opacity-40" />
      <div className="flex flex-col items-center gap-5 text-center">
        <div className="relative">
          <LogoMark size={56} beat />
        </div>
        <p className="shiny-text text-sm font-medium">{label}</p>
        {detail && <p className="-mt-3 text-xs text-white/35">{detail}</p>}
      </div>
    </main>
  );
}
