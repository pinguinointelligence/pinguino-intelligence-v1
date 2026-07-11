import { DestinationSection, DestinationSurface } from '@/components/shared/DestinationSurface';
import { Button } from '@/components/ui/Button';
import { copy } from '@/copy/en';
import { cn } from '@/lib/cn';
import { buildIngredientStatement } from '@/data/label/ingredientStatement';
import { buildNutritionDeclaration } from '@/data/label/nutritionLabel';
import { buildCostBlock, buildPrintableLabelHtml, buildRecipeCsv } from '@/data/label/recipeExport';
import { downloadCsv, printLabelHtml } from '@/data/label/downloadCsv';
import { SAMPLE_LABEL_RESULT } from '@/data/label/sampleLabelRecipe';

const l = copy.nav.label;

// Derived label views for the fixed sample recipe (pure — the engine owns the
// numbers; these builders only format its output). Computed once at module load.
const declaration = buildNutritionDeclaration(SAMPLE_LABEL_RESULT.nutrition_per_100g);
const statement = buildIngredientStatement(SAMPLE_LABEL_RESULT);
const costBlock = buildCostBlock(SAMPLE_LABEL_RESULT);

/**
 * Create Label destination (Labels & Exports) — a real, client-only label
 * surface rendered against a fixed sample recipe. It reads label data only from
 * `@/data/label/*` (never the engine directly) and offers a CSV export and a
 * browser print. No PDF library, no OCR, no camera.
 */
export function CreateLabelPage() {
  const onDownload = () => downloadCsv(l.csvFilename, buildRecipeCsv(SAMPLE_LABEL_RESULT));
  const onPrint = () => printLabelHtml(buildPrintableLabelHtml(SAMPLE_LABEL_RESULT));

  return (
    <DestinationSurface eyebrow={l.sampleHeading} title={l.title} blurb={l.blurb}>
      <div className="space-y-12">
        <p className="max-w-2xl text-sm leading-relaxed text-ivory/55">{l.sampleNote}</p>

        <DestinationSection label={l.declarationTitle} className="max-w-md">
          <p className="mb-4 text-xs tracking-label text-ivory/40 uppercase">
            {copy.studio.metrics.nutritionTitle}
          </p>
          {declaration ? (
            <table className="w-full text-sm">
              <tbody>
                {declaration.rows.map((row) => (
                  <tr key={row.key} className="border-b border-ivory/10">
                    <th
                      className={cn(
                        'py-2 text-left font-normal text-ivory/70',
                        row.indented && 'pl-5 text-ivory/45',
                      )}
                    >
                      {row.label}
                    </th>
                    <td className="py-2 text-right tabular-nums text-ivory">
                      {row.valueDisplay ?? l.notAvailable}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="text-sm text-ivory/50">{l.notAvailable}</p>
          )}
        </DestinationSection>

        <DestinationSection label={l.statement} className="max-w-md">
          <p className="mb-4 text-xs leading-relaxed text-ivory/40">{l.statementNote}</p>
          <ul>
            {statement.map((entry) => (
              <li
                key={entry.name}
                className="flex items-baseline justify-between gap-6 border-b border-ivory/10 py-2 text-sm"
              >
                <span className="text-ivory/70">{entry.name}</span>
                <span className="shrink-0 tabular-nums text-ivory/45">
                  {entry.percent}% · {entry.grams} g
                </span>
              </li>
            ))}
          </ul>
        </DestinationSection>

        <DestinationSection label={copy.studio.metrics.costTitle} className="max-w-md">
          {costBlock.map((line) => (
            <div
              key={line.label}
              className="flex items-baseline justify-between gap-6 border-b border-ivory/10 py-2 text-sm"
            >
              <span className="text-ivory/70">{line.label}</span>
              <span className="tabular-nums text-ivory">{line.valueDisplay ?? '—'}</span>
            </div>
          ))}
        </DestinationSection>

        <DestinationSection label={l.export} className="max-w-md">
          <p className="mb-6 max-w-lg text-xs leading-relaxed text-ivory/40">{l.allergenNote}</p>
          <div className="flex flex-wrap gap-4">
            <Button variant="ivory" size="sm" onClick={onDownload}>
              {l.downloadCsv}
            </Button>
            <Button variant="ivory" size="sm" onClick={onPrint}>
              {l.print}
            </Button>
          </div>
        </DestinationSection>
      </div>
    </DestinationSurface>
  );
}
