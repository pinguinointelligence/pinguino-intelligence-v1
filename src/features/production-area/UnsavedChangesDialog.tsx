/**
 * The ONE unsaved-changes question of the Produkcja area (package PRODUKCJA V3, Etap 1 §1.5).
 *
 * Mounted once by `ProductionAreaSurface`; opened by `requestLeave` from the section bar, the ☰
 * drawer and HOME | PRO. It is the existing Gellatti dialog shell (`DialogShell`: escape, focus
 * trap and restore, scroll lock, bottom sheet on a phone) with three answers:
 * „Odrzuć zmiany”, „Zostań” and the one black action „Zapisz i przejdź”.
 */
import { useEffect } from 'react';
import { DialogShell } from '@/components/ui/DialogShell';
import { productionAreaCopy } from '@/copy/productionArea';
import { cn } from '@/lib/cn';
import {
  discardAndLeave,
  mountUnsavedHost,
  pendingUnsavedLabels,
  saveAndLeave,
  stayAfterLeaveRequest,
  useUnsavedGuardStore,
} from './unsavedGuard';

const c = productionAreaCopy().unsaved;

const answer =
  'pro-focus-ring inline-flex min-h-12 items-center justify-center rounded-full px-5 text-[15px] font-semibold transition-colors disabled:opacity-50';

export function UnsavedChangesDialog() {
  const pending = useUnsavedGuardStore((state) => state.pending);
  const saving = useUnsavedGuardStore((state) => state.saving);

  useEffect(() => mountUnsavedHost(), []);

  if (!pending) return null;
  const labels = pendingUnsavedLabels();
  const body = labels.length > 0 ? c.body(labels.join(', ')) : c.bodyGeneric;

  return (
    <DialogShell
      label={c.title}
      testId="unsaved-changes-dialog"
      onClose={() => {
        if (!saving) stayAfterLeaveRequest();
      }}
      placement="responsive"
      initialFocusTestId="unsaved-changes-stay"
    >
      <div className="px-1 py-1 sm:px-2">
        <h2 className="text-[19px] leading-[1.3] font-bold tracking-[-0.01em] text-[var(--g-graphite)]">
          {c.title}
        </h2>
        <p className="mt-1.5 text-[14px] leading-[1.5] text-[var(--g-text-secondary)]">{body}</p>
        <dl className="mt-4 space-y-3 rounded-[14px] bg-[var(--g-ivory)] px-4 py-3 text-[13px] leading-[1.45]">
          <div>
            <dt className="font-semibold text-[var(--g-ink)]">{c.discard}</dt>
            <dd className="text-[var(--g-text-secondary)]">{c.discardHint}</dd>
          </div>
          <div>
            <dt className="font-semibold text-[var(--g-ink)]">{c.save}</dt>
            <dd className="text-[var(--g-text-secondary)]">{c.saveHint}</dd>
          </div>
        </dl>
        <div className="mt-5 grid grid-cols-2 gap-2.5">
          <button
            type="button"
            disabled={saving}
            onClick={discardAndLeave}
            data-testid="unsaved-changes-discard"
            className={cn(
              answer,
              'border border-[var(--g-line-strong)] bg-white text-status-error hover:border-status-error/50',
            )}
          >
            {c.discard}
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={stayAfterLeaveRequest}
            data-testid="unsaved-changes-stay"
            className={cn(
              answer,
              'border border-[var(--g-line-strong)] bg-white text-[var(--g-ink)] hover:border-ink/35',
            )}
          >
            {c.stay}
          </button>
        </div>
        <button
          type="button"
          disabled={saving}
          onClick={() => void saveAndLeave()}
          data-testid="unsaved-changes-save"
          className={cn(
            answer,
            'mt-2.5 w-full bg-[var(--g-graphite)] text-white hover:bg-ink-soft',
          )}
        >
          {saving ? c.saving : c.save}
        </button>
      </div>
    </DialogShell>
  );
}
