import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ConsumerLabelPreview } from './ConsumerLabelPreview';
import type { DraftLabelPreview } from './draftLabelPreview';
import type { MasterLabelData } from './masterLabel';
import { printMasterLabel } from './masterLabelPrint';
import { AllergenStatementControl } from './AllergenStatementControl';
import { SaturatedFatControl } from './SaturatedFatControl';
import { PrintMissingDataDialog } from './PrintMissingDataDialog';
import { printMissingFields } from './printMissingData';

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
  const [printMissingOpen, setPrintMissingOpen] = useState(false);
  const requestPrint = () => {
    if (printMissingFields(draft.label).length > 0) {
      setPrintMissingOpen(true);
      return;
    }
    printMasterLabel(draft.label, logoUrl);
  };
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
        <div className="mt-4 divide-y divide-ink/10 border-t border-ink/10">
          <AllergenStatementControl
            label={draft.label}
            onSave={async (label) => onSave(label, 'allergens')}
          />
          <SaturatedFatControl
            label={draft.label}
            onSave={async (label) => onSave(label, 'market_nutrition')}
          />
        </div>
      </Card>

      <div
        className="sticky bottom-0 z-10 grid grid-cols-1 gap-2 border-t border-ink/10 bg-white/95 py-3 backdrop-blur sm:grid-cols-[minmax(0,1fr)_auto]"
        data-testid="draft-label-actions"
      >
        <Button
          className="min-h-12 w-full rounded-full"
          onClick={requestPrint}
          data-testid="draft-label-print"
        >
          Drukuj
        </Button>
        <Button
          variant="ghost"
          className="min-h-11 w-full rounded-full sm:w-auto sm:px-8"
          onClick={onOpenSettings}
          data-testid="draft-label-change"
        >
          Zmień
        </Button>
      </div>
      {printMissingOpen ? (
        <PrintMissingDataDialog
          label={draft.label}
          busy={false}
          onClose={() => setPrintMissingOpen(false)}
          onSkip={async () => {
            setPrintMissingOpen(false);
            printMasterLabel(draft.label, logoUrl);
          }}
          onApply={async (label) => {
            setPrintMissingOpen(false);
            if (label !== draft.label) onSave(label, 'print_missing');
            printMasterLabel(label, logoUrl);
          }}
        />
      ) : null}
    </div>
  );
}
