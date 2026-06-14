import { useState, type FormEvent } from 'react';
import { SectionLabel } from '@/components/shared/SectionLabel';
import { buttonClasses } from '@/components/ui/buttonStyles';
import { copy } from '@/copy/en';
import { cn } from '@/lib/cn';
import { useAuthStore } from '@/stores/authStore';

const a = copy.auth;

type Mode = 'signin' | 'signup';

const fieldClass =
  'mt-1 w-full rounded-md border border-ink/15 bg-paper px-3 py-2 text-sm text-ink placeholder:text-stone-400 transition-colors focus:border-ink/40 focus:outline-none';

/** Minimal email/password auth modal (Phase 2A). Degrades to an "unavailable"
 * note when this build has no auth backend configured. */
export function AuthModal({ onClose }: { onClose: () => void }) {
  const available = useAuthStore((state) => state.available);
  const signIn = useAuthStore((state) => state.signIn);
  const signUp = useAuthStore((state) => state.signUp);

  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setInfo(null);
    const result = mode === 'signin' ? await signIn(email, password) : await signUp(email, password);
    setBusy(false);
    if (result.ok) {
      if (mode === 'signup' && result.needsConfirmation) setInfo(a.checkEmail);
      else onClose();
    } else {
      setError(result.message);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-6">
      <button
        type="button"
        aria-label={a.close}
        className="absolute inset-0 h-full w-full bg-ink/30"
        onClick={onClose}
      />
      <div className="relative w-full max-w-sm rounded-xl border border-ink/10 bg-paper p-7">
        <SectionLabel>{copy.brand.name}</SectionLabel>
        <h2 className="mt-2 text-xl font-light tracking-tight text-ink">
          {mode === 'signin' ? a.titleSignIn : a.titleSignUp}
        </h2>

        {!available ? (
          <>
            <p className="mt-4 text-sm leading-relaxed text-stone-500">{a.unavailable}</p>
            <button type="button" className={cn(buttonClasses('ghost', 'sm'), 'mt-5 w-full')} onClick={onClose}>
              {a.close}
            </button>
          </>
        ) : (
          <>
            <form className="mt-5 space-y-4" onSubmit={submit}>
              <label className="block">
                <span className="text-xs tracking-label text-stone-500 uppercase">{a.email}</span>
                <input
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  className={fieldClass}
                />
              </label>
              <label className="block">
                <span className="text-xs tracking-label text-stone-500 uppercase">{a.password}</span>
                <input
                  type="password"
                  required
                  autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className={fieldClass}
                />
              </label>

              {error ? <p className="text-xs leading-relaxed text-status-risky">{error}</p> : null}
              {info ? <p className="text-xs leading-relaxed text-stone-600">{info}</p> : null}

              <button
                type="submit"
                disabled={busy}
                className={cn(buttonClasses('primary', 'sm'), 'w-full', busy && 'opacity-50')}
              >
                {busy ? a.busy : mode === 'signin' ? a.submitSignIn : a.submitSignUp}
              </button>
            </form>

            <div className="mt-4 flex items-center justify-between">
              <button
                type="button"
                className="text-xs text-stone-500 underline decoration-stone-300 underline-offset-4 transition-colors hover:text-ink"
                onClick={() => {
                  setMode((current) => (current === 'signin' ? 'signup' : 'signin'));
                  setError(null);
                  setInfo(null);
                }}
              >
                {mode === 'signin' ? a.toSignUp : a.toSignIn}
              </button>
              <button
                type="button"
                className="text-xs text-stone-400 transition-colors hover:text-ink"
                onClick={onClose}
              >
                {a.close}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
