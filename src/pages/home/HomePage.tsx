import { useEffect } from 'react';
import { copy } from '@/copy/en';
import { AppMenu } from '@/features/shell/AppMenu';
import { PIChat } from '@/features/pi-chat/PIChat';
import { useIntakeStore } from '@/stores/intakeStore';
import { useSessionStore } from '@/stores/sessionStore';

/**
 * AI-first Home (Step 6A) — the clean white first screen. Top-left hamburger,
 * centered prompt, guided conversation. Always a demo session; PI Pro is unlocked
 * from the conversation and hands off to Advanced Studio.
 */
export function HomePage() {
  const setPlan = useSessionStore((state) => state.setPlan);
  const resetIntake = useIntakeStore((state) => state.reset);

  // The public Home is always a demo session (redacted — no exact grams).
  useEffect(() => {
    setPlan('demo');
  }, [setPlan]);

  return (
    <div className="flex min-h-screen flex-col bg-paper text-ink">
      <header className="flex items-center justify-between px-5 py-5">
        <AppMenu onNew={resetIntake} />
        <span className="text-[0.7rem] font-light tracking-wordmark text-stone-400">
          {copy.home.eyebrow}
        </span>
      </header>

      <main className="flex flex-1 flex-col items-center justify-center px-6 pb-24">
        <PIChat />
      </main>
    </div>
  );
}
