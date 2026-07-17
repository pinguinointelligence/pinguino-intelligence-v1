/**
 * The ONE owner-mandated block in the product (§17.2/§19): an Apply whose
 * proposal fails `verifyConstraintsPreserved` (or went stale) is stopped with
 * a clear Polish message — the recipe is untouched. PURE view (props only).
 */
import type { BlockedApply } from '../applyPipeline';
import { constraintStudioCopy as copy } from '../constraintStudioCopy';

export function BlockedApplyNotice({
  blocked,
  onDismiss,
}: {
  blocked: BlockedApply;
  onDismiss: () => void;
}) {
  return (
    <section
      role="alert"
      aria-label={copy.blocked.title}
      className="rounded-md border border-status-error/50 bg-status-error/[0.08] px-4 py-3"
    >
      <p className="text-sm font-medium text-ivory">{copy.blocked.title}</p>
      <p className="mt-1 text-sm leading-relaxed text-ivory/80">{blocked.messagePl}</p>
      <button
        type="button"
        onClick={onDismiss}
        className="mt-2 rounded-md border border-ivory/20 px-3 py-1.5 text-xs font-medium text-ivory transition-colors hover:border-ivory/40"
      >
        {copy.blocked.dismiss}
      </button>
    </section>
  );
}
