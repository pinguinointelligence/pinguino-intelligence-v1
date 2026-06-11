import { Link } from 'react-router';
import { copy } from '@/copy/en';

const { studio } = copy;

export function StudioPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-paper px-6 text-center text-ink">
      <p className="text-xs font-medium tracking-label text-stone-500 uppercase">
        {studio.eyebrow}
      </p>
      <h1 className="mt-6 max-w-xl text-4xl font-light tracking-tight text-balance">
        {studio.headline}
      </h1>
      <p className="mt-6 max-w-md text-sm leading-relaxed text-stone-600">{studio.body}</p>
      <Link
        to="/"
        className="mt-12 rounded-md border border-ink/15 px-6 py-3 text-sm font-medium transition-colors hover:border-ink/40"
      >
        {studio.back}
      </Link>
    </div>
  );
}
