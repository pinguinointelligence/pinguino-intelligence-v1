import type { ReactNode } from 'react';
import { TopNav } from './TopNav';

/**
 * The premium black brand shell (Phase 6C) — global #1a1a1a surface with the
 * centered TopNav. Wraps the AI-first Home and the placeholder destinations.
 * Advanced Studio keeps its own (white) chrome in Slice 1; dark Studio is Slice 2.
 */
export function ShellLayout({
  children,
  onNewRecipe,
}: {
  children: ReactNode;
  onNewRecipe?: () => void;
}) {
  return (
    <div className="flex min-h-screen flex-col bg-shell text-ivory">
      <TopNav onNewRecipe={onNewRecipe} />
      <main className="flex flex-1 flex-col">{children}</main>
    </div>
  );
}
