import type { ReactNode } from 'react';
import { SectionLabel } from '@/components/shared/SectionLabel';
import { copy } from '@/copy/en';
import { cn } from '@/lib/cn';
import { ShellLayout } from '@/features/shell/ShellLayout';

/**
 * Reusable premium destination surface (Phase 6C Slice 3). Wraps the black brand
 * shell (ShellLayout → bg-shell, centered TopNav, ivory text, shell surface tone)
 * and lays out a calm Tesla-style page: eyebrow + large title + blurb + content,
 * generous whitespace, hairline dividers — no boxed SaaS cards.
 */
export function DestinationSurface({
  eyebrow,
  title,
  blurb,
  children,
}: {
  eyebrow?: string;
  title: string;
  blurb?: string;
  children?: ReactNode;
}) {
  return (
    <ShellLayout>
      <div className="mx-auto w-full max-w-6xl px-6 pt-14 pb-28">
        {eyebrow ? <SectionLabel tone="ivory">{eyebrow}</SectionLabel> : null}
        <h1 className="mt-4 max-w-3xl text-4xl font-light tracking-tight text-balance text-ivory md:text-5xl">
          {title}
        </h1>
        {blurb ? (
          <p className="mt-5 max-w-xl text-lg leading-relaxed text-ivory/60">{blurb}</p>
        ) : null}
        {children ? <div className="mt-16">{children}</div> : null}
      </div>
    </ShellLayout>
  );
}

/** A titled section block — ivory section label + content, hairline-separated. */
export function DestinationSection({
  label,
  className,
  children,
}: {
  label?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={cn('border-t border-ivory/10 pt-8', className)}>
      {label ? <SectionLabel tone="ivory">{label}</SectionLabel> : null}
      <div className={label ? 'mt-6' : undefined}>{children}</div>
    </section>
  );
}

/** Muted "Coming soon" row — a future feature listed but not yet active. */
export function ComingSoonRow({ label, description }: { label: string; description?: string }) {
  return (
    <div className="flex items-start justify-between gap-4 py-3">
      <div className="min-w-0">
        <span className="text-sm text-ivory/70">{label}</span>
        {description ? (
          <p className="mt-1 text-xs leading-relaxed text-ivory/40">{description}</p>
        ) : null}
      </div>
      <span className="mt-0.5 shrink-0 rounded border border-ivory/15 px-2 py-0.5 text-[0.6rem] font-medium tracking-[0.08em] text-ivory/45 uppercase">
        {copy.nav.comingSoon}
      </span>
    </div>
  );
}
