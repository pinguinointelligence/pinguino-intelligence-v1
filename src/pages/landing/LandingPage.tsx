import { Link } from 'react-router';
import { IvoryLogoMark } from '@/components/shared/IvoryLogoMark';
import { SectionLabel } from '@/components/shared/SectionLabel';
import { buttonClasses } from '@/components/ui/buttonStyles';
import { copy } from '@/copy/en';

const { brand, landing, footer } = copy;

export function LandingPage() {
  return (
    <div className="min-h-screen bg-paper text-ink">
      {/* Nav */}
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-7">
        <Wordmark />
        <Link to="/demo" className={buttonClasses('ghost', 'sm')}>
          {landing.ctaPrimary}
        </Link>
      </header>

      {/* Hero — white workspace */}
      <section className="mx-auto max-w-6xl px-6 pt-24 pb-28 md:pt-32 md:pb-36">
        <SectionLabel>{landing.eyebrow}</SectionLabel>
        <h1 className="mt-6 max-w-3xl text-5xl font-light tracking-tight text-balance md:text-6xl">
          {landing.headline}
        </h1>
        <p className="mt-7 max-w-xl text-lg leading-relaxed text-stone-600">{landing.subline}</p>
        <div className="mt-12 flex items-center gap-8">
          <Link to="/demo" className={buttonClasses('primary', 'md')}>
            {landing.ctaPrimary}
          </Link>
          <a
            href="#modes"
            className="text-sm text-stone-600 underline decoration-stone-300 underline-offset-4 transition-colors hover:text-ink"
          >
            {landing.ctaSecondary}
          </a>
        </div>
      </section>

      {/* Pillars */}
      <section className="border-t border-ink/10">
        <div className="mx-auto grid max-w-6xl gap-12 px-6 py-20 md:grid-cols-3 md:gap-8">
          {landing.pillars.map((pillar, i) => (
            <div key={pillar.title}>
              <p className="font-mono text-xs text-stone-400">{String(i + 1).padStart(2, '0')}</p>
              <h2 className="mt-4 text-base font-medium">{pillar.title}</h2>
              <p className="mt-3 text-sm leading-relaxed text-stone-600">{pillar.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Product modes — deep charcoal contrast band */}
      <section id="modes" className="bg-ink text-ivory">
        <div className="mx-auto max-w-6xl px-6 py-24 md:py-32">
          <div className="flex items-start justify-between">
            <div>
              <SectionLabel tone="ivory">{landing.modesEyebrow}</SectionLabel>
              <h2 className="mt-6 max-w-2xl text-3xl font-light tracking-tight md:text-4xl">
                {landing.modesHeadline}
              </h2>
            </div>
            <IvoryLogoMark size={44} className="mt-1 shrink-0 opacity-90" />
          </div>
          <div className="mt-16 grid gap-10 md:grid-cols-4 md:gap-0 md:divide-x md:divide-ivory/10">
            {landing.modes.map((mode) => (
              <div key={mode.name} className="md:px-8 md:first:pl-0 md:last:pr-0">
                <h3 className="text-sm font-medium tracking-label uppercase">{mode.name}</h3>
                <p className="mt-4 text-sm leading-relaxed text-ivory-soft">{mode.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-ink/10">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-10 text-xs text-stone-500">
          <span className="flex items-center gap-3">
            <IvoryLogoMark size={16} tone="ink" className="opacity-60" />
            {footer.line}
          </span>
          <span className="font-mono">© {new Date().getFullYear()}</span>
        </div>
      </footer>
    </div>
  );
}

function Wordmark() {
  return (
    <Link to="/" className="flex items-center gap-3">
      <IvoryLogoMark size={26} tone="ink" />
      <span className="leading-none">
        <span className="block text-base font-light tracking-wordmark">{brand.name}</span>
        <span className="mt-1 block text-[0.55rem] font-light tracking-wordmark text-stone-500">
          {brand.sub}
        </span>
      </span>
    </Link>
  );
}
