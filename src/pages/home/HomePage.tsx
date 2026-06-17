import { useEffect } from 'react';
import { ShellLayout } from '@/features/shell/ShellLayout';
import { PIChat } from '@/features/pi-chat/PIChat';
import { useIntakeStore } from '@/stores/intakeStore';
import { useSessionStore } from '@/stores/sessionStore';

/**
 * AI-first Home (Phase 6C) — the premium black brand shell. The centered TopNav
 * sits on top; the AI talking space (PIChat) is the first thing on `/`. Always a
 * Free Preview session (redacted — no exact grams); PI Pro is unlocked from the
 * conversation and hands off to Advanced Studio.
 */
export function HomePage() {
  const setPlan = useSessionStore((state) => state.setPlan);
  const resetIntake = useIntakeStore((state) => state.reset);

  // The public Home is always a Free Preview session (internal level key: 'demo').
  useEffect(() => {
    setPlan('demo');
  }, [setPlan]);

  return (
    <ShellLayout onNewRecipe={resetIntake}>
      <div className="flex flex-1 flex-col items-center justify-center px-6 pb-24 pt-12">
        <PIChat />
      </div>
    </ShellLayout>
  );
}
