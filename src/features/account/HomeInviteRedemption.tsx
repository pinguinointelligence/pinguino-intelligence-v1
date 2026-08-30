import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Button } from '@/components/ui/Button';
import { customerErrorMessage } from '@/copy/customerError';
import { redeemHomeInvite } from '@/services/homeInvites';

export function HomeInviteRedemption() {
  const [code, setCode] = useState('');
  const mutation = useMutation({ mutationFn: () => redeemHomeInvite(code) });
  return (
    <section className="py-6">
      <h2 className="text-[15px] leading-[1.3] font-bold tracking-[-0.02em] text-[var(--g-ink)]">Kod zaproszenia Home</h2>
      <p className="mt-2 max-w-xl text-xs leading-5 text-[var(--g-text-secondary)]">
        Jednorazowy kod jest przypisany do dokładnego adresu email tego konta i przyznaje jeden
        bezpłatny miesiąc Home.
      </p>
      <form
        className="mt-4 flex max-w-xl gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          mutation.mutate();
        }}
      >
        <input
          className="pro-focus-ring min-h-11 flex-1 border border-[var(--g-line)] px-3 font-mono text-sm uppercase"
          value={code}
          onChange={(event) => setCode(event.currentTarget.value)}
          placeholder="PIH-XXXX-XXXX"
          required
        />
        <Button type="submit" disabled={mutation.isPending}>
          Aktywuj
        </Button>
      </form>
      {mutation.isSuccess ? (
        <p className="mt-3 text-xs font-semibold text-status-ideal">
          Kod został wykorzystany. Odświeżenie dostępu nastąpi przy następnym odczycie konta.
        </p>
      ) : null}
      {mutation.isError ? (
        <p className="mt-3 text-xs text-red-700">
          {customerErrorMessage(mutation.error, 'account')}
        </p>
      ) : null}
    </section>
  );
}
