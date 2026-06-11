import { Link } from 'react-router';
import { copy } from '@/copy/en';

const { notFound } = copy;

export function NotFoundPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-paper px-6 text-center text-ink">
      <p className="font-mono text-xs text-stone-400">{notFound.code}</p>
      <h1 className="mt-4 text-3xl font-light tracking-tight">{notFound.headline}</h1>
      <Link
        to="/"
        className="mt-10 text-sm text-stone-600 underline decoration-stone-300 underline-offset-4 transition-colors hover:text-ink"
      >
        {notFound.back}
      </Link>
    </div>
  );
}
