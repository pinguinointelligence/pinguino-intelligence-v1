import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ConsumerLabelPreview } from './ConsumerLabelPreview';
import type { DraftLabelPreview } from './draftLabelPreview';
import { CompactRunLabelEditor } from './LabelWorkspace';
import type { MasterLabelData } from './masterLabel';
import { printMasterLabel } from './masterLabelPrint';
import { AllergenStatementControl } from './AllergenStatementControl';

/** Preview, actionable blockers and the only two bottom actions for a recipe draft. */
export function DraftLabelCard({
  draft,
  logoUrl,
  onSave,
  onOpenSettings,
}: {
  draft: DraftLabelPreview;
  logoUrl: string | null;
  onSave: (label: MasterLabelData, confirmedField?: string) => void;
  onOpenSettings: () => void;
}) {
  return (
    <div className="space-y-3" data-testid="draft-label-card">
      <Card padding="none" className="overflow-hidden rounded-[22px] border-ink/10 p-4 sm:p-5">
        <header className="mb-4 flex flex-wrap items-end justify-between gap-3 border-b border-ink/10 pb-4">
          <div>
            <span className="text-[10px] font-bold tracking-[0.08em] text-stone-500 uppercase">
              Etykieta · receptura
            </span>
            <h2 className="mt-1 text-xl font-semibold tracking-[-0.025em] text-ink">
              {draft.productName ?? 'Receptura bez nazwy'}
            </h2>
          </div>
          <div className="text-right text-xs text-stone-600">
            <div>{draft.label.lotCode}</div>
            <div>{draft.label.productionDate}</div>
          </div>
        </header>
        <ConsumerLabelPreview label={draft.label} logoUrl={logoUrl} />
        <div className="mt-4">
          <AllergenStatementControl
            label={draft.label}
            onSave={async (label) => onSave(label, 'allergens')}
          />
        </div>
        <dl className="mt-4 grid grid-cols-2 gap-2 rounded-[14px] bg-stone-50 p-3 text-xs">
          <div>
            <dt className="text-stone-500">Baza techniczna</dt>
            <dd className="mt-0.5 font-semibold tabular-nums text-ink">{draft.baseBatchG} g</dd>
          </div>
          <div>
            <dt className="text-stone-500">Produkt finalny</dt>
            <dd className="mt-0.5 font-semibold tabular-nums text-ink">{draft.finalProductG} g</dd>
          </div>
        </dl>
      </Card>

      {draft.blockers.length > 0 || draft.confirmedFields.some((field) => field !== 'allergens') ? (
        <CompactRunLabelEditor
          label={draft.label}
          initialConfirmedFields={draft.confirmedFields.filter((field) => field !== 'allergens')}
          onSave={async (label, confirmedField) => onSave(label, confirmedField)}
        />
      ) : null}

      <div
        className="sticky bottom-0 z-10 grid grid-cols-1 gap-2 border-t border-ink/10 bg-white/95 py-3 backdrop-blur sm:grid-cols-[minmax(0,1fr)_auto]"
        data-testid="draft-label-actions"
      >
        <Button
          className="min-h-12 w-full rounded-full"
          disabled={!draft.readyForPrint}
          onClick={() => printMasterLabel(draft.label, logoUrl)}
          data-testid="draft-label-print"
        >
          Drukuj finalną etykietę
        </Button>
        <Button
          variant="ghost"
          className="min-h-11 w-full rounded-full sm:w-auto sm:px-8"
          onClick={onOpenSettings}
          data-testid="draft-label-change"
        >
          ZMIEŃ
        </Button>
        {!draft.readyForPrint && draft.blockers[0] ? (
          <p
            className="px-2 text-center text-xs text-stone-600 sm:col-span-2"
            data-testid="draft-label-blocker"
          >
            {draft.blockers[0].message}
          </p>
        ) : null}
      </div>
    </div>
  );
}
