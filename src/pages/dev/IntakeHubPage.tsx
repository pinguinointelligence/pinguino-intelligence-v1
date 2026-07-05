/**
 * DEV-ONLY unified product-intake hub (route: /dev/intake-hub).
 *
 * One place that names every intake path and its HONEST state. It does not re-implement any
 * pipeline — it links to the working ones and clearly marks the not-yet-built ones as PLANNED
 * (no fake OCR, no paid APIs, no fabricated data):
 *   • CSV / table upload  → working (/products/import)
 *   • Barcode / EAN lookup → working, keyless OFF (/dev/enrichment-preview)
 *   • Online enrichment    → working, reviewed merge (/dev/enrichment-preview)
 *   • Image / label OCR    → PLANNED (keyless/local only, an in-browser engine) — not available
 *   • Drive / catalog      → contract doc (no live Drive import here)
 *
 * Boundaries (IntakeHubPage.security.test.ts): DEV-only; no service/DB write; no OCR engine; no
 * paid API; no secret.
 */
import { useState } from 'react';
import { Link } from 'react-router';
import { NotFoundPage } from '@/pages/NotFoundPage';
import { classifyIntakeInput } from '@/data/products/intakeClassifier';
import {
  ACCEPTED_LABEL_IMAGE_TYPES,
  isAcceptedLabelImage,
  parseNutritionLabelImage,
  type LabelImageMeta,
} from '@/data/products/nutritionLabelOcr';

/** The planned extraction fields shown with each queued label image (schema preview only). */
const PLANNED_OCR_FIELDS =
  'product name · brand · EAN · nutrition per 100g (fat, sat. fat, carbs, sugars, protein, salt, kcal) · ingredients text · allergens · image metadata';

const kb = (bytes: number | null) => (bytes === null ? '—' : `${Math.max(1, Math.round(bytes / 1024))} KB`);

type IntakeState = 'working' | 'planned';

interface IntakeSection {
  title: string;
  state: IntakeState;
  body: string;
  to?: string;
  toLabel?: string;
}

const SECTIONS: IntakeSection[] = [
  {
    title: 'CSV / table upload',
    state: 'working',
    body: 'Upload a Mercadona/Colin catalog or generic table. Honest parse → ProductInsert → dedupe → optional match. Blank → NULL (never 0); EAN keeps leading zeros.',
    to: '/products/import',
    toLabel: 'Open CSV import',
  },
  {
    title: 'Barcode / EAN lookup',
    state: 'working',
    body: 'Keyless, read-only OpenFoodFacts lookup by EAN. Hacendado private-label is usually 404 (not in OFF); public EANs return label nutrition.',
    to: '/dev/enrichment-preview',
    toLabel: 'Open enrichment preview',
  },
  {
    title: 'Online enrichment (reviewed merge)',
    state: 'working',
    body: 'Compare a source vs a stored product per field (fill/agree/conflict/skip), preview the exact write payload + snapshot, then apply only the selected label-nutrition fields. Never PAC/POD, identity, or status.',
    to: '/dev/enrichment-preview',
    toLabel: 'Open enrichment merge',
  },
  {
    title: 'Image / label OCR',
    state: 'planned',
    body: 'NOT AVAILABLE. Planned as keyless/local only (a local in-browser engine) — no paid vision API, no fabricated text. The incomplete_text red flag already guards partial OCR. detected_text/extracted_json columns exist as placeholders.',
  },
  {
    title: 'Drive / catalog import',
    state: 'planned',
    body: 'The Mercadona catalog lives in the team Drive (spreadsheet "Mercadona_catalog"). It carries product labels only — no water/solids/sugar-split/PAC-POD. Use the CSV import with the documented column contract; there is no live Drive pull here.',
  },
];

function StateBadge({ state }: { state: IntakeState }) {
  return (
    <span
      className={
        state === 'working'
          ? 'rounded bg-emerald-100 px-1.5 py-0.5 font-mono text-xs text-emerald-700'
          : 'rounded bg-stone-100 px-1.5 py-0.5 font-mono text-xs text-stone-500'
      }
    >
      {state}
    </span>
  );
}

export function IntakeHubPage() {
  const [probe, setProbe] = useState('');
  // Image intake queue — file METADATA only (name/size/mime). Contents are never read.
  const [labelQueue, setLabelQueue] = useState<LabelImageMeta[]>([]);

  if (!import.meta.env.DEV) return <NotFoundPage />;

  // Classify a typed input (a filename like "catalog.csv" / "label.jpg", or an EAN) → its intake path.
  const isFilename = probe.includes('.');
  const classified = probe.trim() === '' ? null : classifyIntakeInput(isFilename ? { filename: probe } : { text: probe });

  return (
    <div className="mx-auto min-h-screen max-w-2xl bg-paper px-6 py-16 text-ink">
      <p className="font-mono text-xs uppercase tracking-wide text-stone-400">DEV · internal</p>
      <h1 className="mt-3 text-2xl font-light tracking-tight">Product intake hub</h1>
      <p className="mt-2 text-sm text-stone-600">
        Every intake path and its honest state. Nothing here fakes OCR or online data, and no path
        writes PAC/POD or the locked reference base.
      </p>

      <div className="mt-6 rounded-md border border-stone-200 bg-white px-4 py-3 text-sm">
        <h2 className="font-medium">Classify an intake input</h2>
        <p className="mt-1 text-xs text-stone-500">Type a filename (e.g. <code>catalog.csv</code>, <code>label.jpg</code>) or an EAN — the classifier routes it (no OCR, no fetch).</p>
        <input
          className="mt-2 w-full rounded border border-stone-200 px-3 py-2 font-mono text-sm"
          placeholder="catalog.csv · label.jpg · 8480000610928"
          value={probe}
          onChange={(e) => setProbe(e.target.value)}
        />
        <label className="mt-2 block text-xs text-stone-500">
          …or pick files (classified by NAME only — contents are never read or uploaded; a mixed
          batch routes each file, and accepted label images join the OCR queue):
          <input
            type="file"
            multiple
            aria-label="classify a file"
            accept=".csv,.tsv,.xlsx,.xls,image/*"
            className="mt-1 block w-full text-xs"
            onChange={(e) => {
              const files = [...(e.target.files ?? [])];
              if (files.length === 0) return;
              const images = files.filter((f) => isAcceptedLabelImage(f.type || null, f.name));
              if (images.length > 0) {
                setLabelQueue((prev) => [
                  ...prev,
                  ...images
                    .filter((f) => !prev.some((q) => q.filename === f.name))
                    .map((f) => ({ filename: f.name, size_bytes: f.size, mime: f.type || null })),
                ]);
              }
              const readout = files.find((f) => !isAcceptedLabelImage(f.type || null, f.name)) ?? files[0]!;
              setProbe(readout.name);
            }}
          />
        </label>

        {labelQueue.length > 0 ? (
          <div className="mt-3 rounded border border-stone-100 bg-stone-50 px-2 py-1.5 text-xs">
            <p className="font-mono text-stone-600">
              label-image OCR queue ({labelQueue.length}) · accepted: {ACCEPTED_LABEL_IMAGE_TYPES.join(', ')}
            </p>
            <ul className="mt-1 space-y-0.5">
              {labelQueue.map((img) => (
                <li key={img.filename} className="font-mono text-stone-500">
                  {img.filename} · {kb(img.size_bytes)} · {img.mime ?? '—'} ·{' '}
                  <span className="text-amber-700">OCR {parseNutritionLabelImage(img).status.replace('_', ' ')} — pending, not connected</span>
                </li>
              ))}
            </ul>
            <p className="mt-1 text-stone-500">
              planned output schema: {PLANNED_OCR_FIELDS}. No text is extracted today — keyless/local OCR only when built.
            </p>
          </div>
        ) : null}
        {classified ? (
          <div className="mt-2 text-xs">
            <p className="font-mono text-stone-600">
              → <strong>{classified.kind}</strong> · {classified.label} · {classified.available ? 'available' : 'not available'}
            </p>
            <p className="mt-0.5 text-stone-500">{classified.note}</p>
            {classified.route ? (
              <Link to={classified.route} className="mt-1 inline-block font-mono text-xs text-sky-700 underline">
                open {classified.route} →
              </Link>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="mt-6 space-y-4">
        {SECTIONS.map((s) => (
          <div key={s.title} className="rounded-md border border-stone-200 bg-white px-4 py-3 text-sm">
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="font-medium">{s.title}</h2>
              <StateBadge state={s.state} />
            </div>
            <p className="mt-1 text-xs leading-relaxed text-stone-600">{s.body}</p>
            {s.to ? (
              <Link to={s.to} className="mt-2 inline-block font-mono text-xs text-sky-700 underline">
                {s.toLabel} →
              </Link>
            ) : (
              <p className="mt-2 font-mono text-xs text-stone-400">no action — planned</p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
