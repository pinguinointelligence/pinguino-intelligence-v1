import { useState } from 'react';
import { buttonClasses } from '@/components/ui/buttonStyles';
import { copy } from '@/copy/en';
import { cn } from '@/lib/cn';

const h = copy.home;

/** AI-first centered prompt: "What are we making today?" + text field + voice
 * placeholder (Step 6A). No NL parsing yet — the text is captured verbatim. */
export function ChatPrompt({ onSubmit }: { onSubmit: (text: string) => void }) {
  const [text, setText] = useState('');
  const ready = text.trim().length > 0;

  return (
    <div className="w-full max-w-xl">
      <h1 className="text-center text-3xl font-light tracking-tight text-ink md:text-4xl">
        {h.prompt}
      </h1>

      <form
        className="mt-10 flex items-center gap-2 rounded-xl border border-ink/15 bg-paper px-4 py-3 transition-colors focus-within:border-ink/40"
        onSubmit={(event) => {
          event.preventDefault();
          if (ready) onSubmit(text.trim());
        }}
      >
        <span aria-hidden className="text-stone-300" title={h.voiceHint}>
          <svg viewBox="0 0 24 24" width={18} height={18} fill="none" stroke="currentColor" strokeWidth={1.5}>
            <rect x="9" y="3" width="6" height="11" rx="3" />
            <path d="M5 11a7 7 0 0 0 14 0M12 18v3" strokeLinecap="round" />
          </svg>
        </span>
        <input
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder={h.placeholder}
          aria-label={h.prompt}
          className="flex-1 bg-transparent text-sm text-ink placeholder:text-stone-400 focus:outline-none"
        />
        <button
          type="submit"
          disabled={!ready}
          className={cn(buttonClasses('primary', 'sm'), !ready && 'cursor-not-allowed opacity-40')}
        >
          {h.submit}
        </button>
      </form>

      <p className="mt-3 text-center text-xs text-stone-400">{h.voiceHint}</p>
    </div>
  );
}
