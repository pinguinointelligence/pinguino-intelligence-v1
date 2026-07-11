/**
 * EvidenceReviewPanel — per-field evidence review (spec §5, §9, §17.9).
 *
 * Renders ReviewedField[] verbatim: value, provenance badge (explicit /
 * calculated / inferred / absent — never collapsed into a number), the SPLIT
 * extraction + normalization confidences, source evidence (image + line +
 * verbatim text), warnings, and the review actions (edit, mark unknown,
 * choose-between-candidates for conflicts, confirm). Fields the contract
 * knows but the session has no evidence for — and fields whose evidence is
 * 'absent' — show a missing indicator and NEVER a fabricated value (no 0).
 *
 * Pure presentation over the shared contract; all decisions go through
 * callback props.
 */
import type { FieldEvidence, IntakeFieldKey, ReviewedField } from '../intakeContracts';
import { ocrCopy } from '../ocrCopy';
import { FIELD_GROUPS, resolveFieldDisplay } from './intakeUiSupport';

/* ── small presentational bits ────────────────────────────────────────────── */

const PROVENANCE_CLASS: Record<FieldEvidence['provenance'], string> = {
  explicit: 'bg-emerald-100 text-emerald-700',
  calculated: 'bg-sky-100 text-sky-700',
  inferred: 'bg-amber-100 text-amber-700',
  absent: 'bg-stone-100 text-stone-500',
};

export function ProvenanceBadge({ provenance }: { provenance: FieldEvidence['provenance'] }) {
  return (
    <span className={`rounded px-1.5 py-0.5 font-mono text-xs ${PROVENANCE_CLASS[provenance]}`}>
      {ocrCopy.evidence.provenance[provenance]}
    </span>
  );
}

const pct = (value: number | null): string =>
  value === null ? ocrCopy.evidence.noConfidence : `${value}%`;

function ConfidenceLine({ candidate }: { candidate: FieldEvidence }) {
  return (
    <span className="font-mono text-xs text-stone-500">
      {ocrCopy.evidence.readConfidence} {pct(candidate.extractionConfidence)} ·{' '}
      {ocrCopy.evidence.normalizationConfidence} {pct(candidate.normalizationConfidence)}
    </span>
  );
}

function SourceLine({ candidate }: { candidate: FieldEvidence }) {
  if (!candidate.evidence) return null;
  const { imageId, lineIndex, sourceText } = candidate.evidence;
  return (
    <p className="mt-1 font-mono text-xs text-stone-400">
      {ocrCopy.evidence.source}: {imageId}
      {lineIndex !== null ? ` · ${ocrCopy.evidence.line} ${lineIndex}` : ''}
      {sourceText !== null ? ` · “${sourceText}”` : ''}
    </p>
  );
}

function StatusChip({ status }: { status: ReviewedField['reviewStatus'] }) {
  const cls =
    status === 'confirmed' || status === 'auto_accepted'
      ? 'bg-emerald-100 text-emerald-700'
      : status === 'conflict_unresolved'
        ? 'bg-red-100 text-red-700'
        : status === 'needs_confirmation'
          ? 'bg-amber-100 text-amber-700'
          : 'bg-stone-100 text-stone-600';
  return (
    <span className={`rounded px-1.5 py-0.5 font-mono text-xs ${cls}`}>
      {ocrCopy.evidence.status[status]}
    </span>
  );
}

export interface EvidenceReviewPanelProps {
  fields: ReviewedField[];
  onEdit: (fieldKey: IntakeFieldKey, value: string) => void;
  onMarkUnknown: (fieldKey: IntakeFieldKey) => void;
  onChooseCandidate: (fieldKey: IntakeFieldKey, candidateIndex: number) => void;
  onConfirm: (fieldKey: IntakeFieldKey) => void;
}

function CandidateChooser({
  field,
  onChooseCandidate,
}: {
  field: ReviewedField;
  onChooseCandidate: EvidenceReviewPanelProps['onChooseCandidate'];
}) {
  if (field.candidates.length < 2) return null;
  return (
    <div className="mt-2 rounded border border-red-100 bg-red-50 px-2 py-1.5">
      <p className="text-xs font-medium text-red-800">{ocrCopy.evidence.conflictTitle}</p>
      <ul className="mt-1 space-y-1">
        {field.candidates.map((candidate, index) => (
          <li key={index} className="flex flex-wrap items-center gap-2 text-xs">
            <span className="font-mono text-stone-700">
              {candidate.normalized ?? candidate.extractedRaw ?? ocrCopy.evidence.missing}
            </span>
            <ProvenanceBadge provenance={candidate.provenance} />
            <ConfidenceLine candidate={candidate} />
            {field.chosenCandidate === index ? (
              <span className="rounded bg-emerald-100 px-1.5 py-0.5 font-mono text-xs text-emerald-700">
                {ocrCopy.evidence.chosen}
              </span>
            ) : (
              <button
                type="button"
                aria-label={`${ocrCopy.evidence.useCandidate}: ${ocrCopy.evidence.fields[field.fieldKey]} ${index + 1}`}
                className="rounded border border-stone-300 px-2 py-0.5 font-mono text-xs text-stone-600"
                onClick={() => onChooseCandidate(field.fieldKey, index)}
              >
                {ocrCopy.evidence.useCandidate}
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function FieldActions({
  fieldKey,
  field,
  onEdit,
  onMarkUnknown,
  onConfirm,
}: {
  fieldKey: IntakeFieldKey;
  field: ReviewedField | undefined;
  onEdit: EvidenceReviewPanelProps['onEdit'];
  onMarkUnknown: EvidenceReviewPanelProps['onMarkUnknown'];
  onConfirm: EvidenceReviewPanelProps['onConfirm'];
}) {
  const label = ocrCopy.evidence.fields[fieldKey];
  const display = field ? resolveFieldDisplay(field) : { kind: 'missing' as const };
  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-2">
      <input
        aria-label={`${ocrCopy.evidence.editAction}: ${label}`}
        className="w-40 rounded border border-stone-200 bg-white px-2 py-1 font-mono text-xs"
        value={field?.editedValue ?? ''}
        placeholder={display.kind === 'value' ? display.value : ocrCopy.evidence.missing}
        onChange={(e) => onEdit(fieldKey, e.target.value)}
      />
      {field && field.reviewStatus !== 'confirmed' && field.reviewStatus !== 'auto_accepted' ? (
        <button
          type="button"
          aria-label={`${ocrCopy.evidence.confirmAction}: ${label}`}
          className="rounded border border-stone-300 px-2 py-0.5 font-mono text-xs text-stone-600"
          onClick={() => onConfirm(fieldKey)}
        >
          {ocrCopy.evidence.confirmAction}
        </button>
      ) : null}
      {field && field.reviewStatus !== 'marked_unknown' ? (
        <button
          type="button"
          aria-label={`${ocrCopy.evidence.markUnknownAction}: ${label}`}
          className="rounded border border-stone-300 px-2 py-0.5 font-mono text-xs text-stone-600"
          onClick={() => onMarkUnknown(fieldKey)}
        >
          {ocrCopy.evidence.markUnknownAction}
        </button>
      ) : null}
    </div>
  );
}

function FieldValue({ field }: { field: ReviewedField | undefined }) {
  const display = field ? resolveFieldDisplay(field) : { kind: 'missing' as const };
  if (display.kind === 'value') {
    return (
      <span className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-xs text-stone-800">{display.value}</span>
        {display.candidate ? <ProvenanceBadge provenance={display.candidate.provenance} /> : null}
        {display.candidate ? <ConfidenceLine candidate={display.candidate} /> : null}
      </span>
    );
  }
  if (display.kind === 'unknown') {
    return <span className="font-mono text-xs text-stone-500">{ocrCopy.evidence.markedUnknown}</span>;
  }
  if (display.kind === 'conflict') {
    return (
      <span className="font-mono text-xs text-red-700">{ocrCopy.evidence.status.conflict_unresolved}</span>
    );
  }
  return <span className="font-mono text-xs italic text-stone-400">{ocrCopy.evidence.missing}</span>;
}

function FieldWarnings({ field }: { field: ReviewedField | undefined }) {
  const warnings = field?.candidates.flatMap((c) => c.warnings) ?? [];
  if (warnings.length === 0) return null;
  return (
    <ul aria-label={ocrCopy.evidence.warningsTitle} className="mt-1 list-disc pl-4 text-xs text-amber-700">
      {warnings.map((w) => (
        <li key={w}>{w}</li>
      ))}
    </ul>
  );
}

export function EvidenceReviewPanel({
  fields,
  onEdit,
  onMarkUnknown,
  onChooseCandidate,
  onConfirm,
}: EvidenceReviewPanelProps) {
  const byKey = new Map(fields.map((f) => [f.fieldKey, f]));
  const actionsProps = { onEdit, onMarkUnknown, onConfirm };

  return (
    <section aria-label={ocrCopy.evidence.title} className="rounded-md border border-stone-200 bg-white px-4 py-3 text-sm">
      <h3 className="font-medium">{ocrCopy.evidence.title}</h3>
      <p className="mt-1 text-xs text-stone-500">{ocrCopy.evidence.intro}</p>

      {FIELD_GROUPS.map(({ group, fields: groupFields }) =>
        group === 'nutrition' ? (
          /* nutrition renders grouped as a TABLE (spec §9) */
          <div key={group} className="mt-4">
            <h4 className="text-xs font-medium uppercase tracking-wide text-stone-500">
              {ocrCopy.evidence.groups[group]}
            </h4>
            <table className="mt-2 w-full border-collapse text-left">
              <thead>
                <tr className="border-b border-stone-200 font-mono text-xs text-stone-400">
                  <th className="py-1 pr-2 font-normal">field</th>
                  <th className="py-1 pr-2 font-normal">value · provenance · confidence</th>
                  <th className="py-1 font-normal">status</th>
                </tr>
              </thead>
              <tbody>
                {groupFields.map((key) => {
                  const field = byKey.get(key);
                  return (
                    <tr key={key} className="border-b border-stone-100 align-top">
                      <td className="py-1.5 pr-2 text-xs font-medium text-stone-700">
                        {ocrCopy.evidence.fields[key]}
                      </td>
                      <td className="py-1.5 pr-2">
                        <FieldValue field={field} />
                        {field ? <CandidateChooser field={field} onChooseCandidate={onChooseCandidate} /> : null}
                        {field ? <SourceLineForField field={field} /> : null}
                        <FieldWarnings field={field} />
                        <FieldActions fieldKey={key} field={field} {...actionsProps} />
                      </td>
                      <td className="py-1.5">{field ? <StatusChip status={field.reviewStatus} /> : null}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div key={group} className="mt-4">
            <h4 className="text-xs font-medium uppercase tracking-wide text-stone-500">
              {ocrCopy.evidence.groups[group]}
            </h4>
            <div className="mt-2 space-y-2">
              {groupFields.map((key) => {
                const field = byKey.get(key);
                return (
                  <div key={key} className="rounded border border-stone-100 bg-stone-50 px-3 py-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-xs font-medium text-stone-700">
                        {ocrCopy.evidence.fields[key]}
                      </span>
                      {field ? <StatusChip status={field.reviewStatus} /> : null}
                    </div>
                    <div className="mt-1">
                      <FieldValue field={field} />
                    </div>
                    {field ? <CandidateChooser field={field} onChooseCandidate={onChooseCandidate} /> : null}
                    {field ? <SourceLineForField field={field} /> : null}
                    <FieldWarnings field={field} />
                    <FieldActions fieldKey={key} field={field} {...actionsProps} />
                  </div>
                );
              })}
            </div>
          </div>
        ),
      )}
    </section>
  );
}

/** Source evidence for the currently displayed candidate (if any). */
function SourceLineForField({ field }: { field: ReviewedField }) {
  const display = resolveFieldDisplay(field);
  if (display.kind !== 'value' || display.candidate === null) return null;
  return <SourceLine candidate={display.candidate} />;
}
