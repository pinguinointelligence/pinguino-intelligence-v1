/**
 * Ingredient Resolution — PRESENTATIONAL UI (Agent A).
 *
 * Pure, stateless components: props in, JSX out. They render the honest Polish copy from the
 * pure contracts and NEVER carry a gram number (grams stay the gated concern of the recipe
 * view). All behaviour lives in the pure state machine + the caller's handlers.
 */
import type { ReactNode } from 'react';
import {
  INGREDIENT_FORMS,
  RESOLUTION_ACTIONS,
  type IngredientForm,
  type LineResolution,
  type ProductCandidate,
  type ResolutionActionId,
} from '../contracts';
import { availableActions } from '../ingredientResolution';

/* ── per-line status copy (Polish, honest) ───────────────────────────────── */

const STATE_LABEL: Record<LineResolution['state'], string> = {
  unresolved: 'Do uzupełnienia',
  choosing_form: 'Wybierz postać',
  searching: 'Wyszukiwanie',
  substituting: 'Zamiana składnika',
  awaiting_intake: 'Dodawanie produktu',
  needs_data: 'Wymaga danych',
  resolved: 'Gotowe',
};

/* ── the overview list of requirement lines ──────────────────────────────── */

export interface ResolutionLineListProps {
  lines: readonly LineResolution[];
  /** Open the resolution sheet for a line. */
  onOpen: (lineId: string) => void;
}

/** A compact overview: every requirement line, its state, and any honest message. */
export function ResolutionLineList({ lines, onOpen }: ResolutionLineListProps) {
  return (
    <ul className="divide-y divide-black/10" aria-label="Linie do uzupełnienia">
      {lines.map((l) => {
        const resolved = l.state === 'resolved';
        return (
          <li key={l.line.lineId} className="flex items-start justify-between gap-4 py-3">
            <div className="min-w-0">
              <p className="font-medium">{l.line.ingredientName}</p>
              <p className="text-xs opacity-60" data-testid="line-state">
                {STATE_LABEL[l.state]}
                {l.form ? ` · ${formLabel(l.form)}` : ''}
              </p>
              {l.message ? (
                <p className="mt-1 text-xs text-amber-700" data-testid="line-message">
                  {l.message}
                </p>
              ) : null}
            </div>
            {resolved ? (
              <span className="shrink-0 rounded-full bg-emerald-100 px-3 py-1 text-xs text-emerald-800">
                {STATE_LABEL.resolved}
              </span>
            ) : (
              <button
                type="button"
                className="shrink-0 rounded border px-3 py-1 text-sm"
                onClick={() => onOpen(l.line.lineId)}
              >
                Uzupełnij
              </button>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/* ── the resolution sheet (form step OR action list OR results) ──────────── */

export interface IngredientResolutionSheetProps {
  line: LineResolution;
  onSelectForm: (form: IngredientForm) => void;
  onAction: (action: ResolutionActionId) => void;
  onPickCandidate: (candidate: ProductCandidate) => void;
  onSearch: (query: string) => void;
  searchQuery: string;
  onSearchQueryChange: (query: string) => void;
  onClose: () => void;
}

/**
 * The bottom-sheet body for one requirement line. Renders, in order of priority:
 *   • the FORM step for a fresh/herb line that has not picked a form;
 *   • otherwise the action list (Polish labels), plus any transient search/candidate results.
 */
export function IngredientResolutionSheet(props: IngredientResolutionSheetProps) {
  const { line } = props;

  if (line.state === 'choosing_form') {
    return (
      <Sheet title={`${line.line.ingredientName} — wybierz postać`} onClose={props.onClose}>
        <p className="text-sm opacity-70">
          Ten składnik jest świeży/ziołowy. Wybierz postać — dawki nie ustalamy automatycznie.
        </p>
        <div className="mt-3 grid grid-cols-1 gap-2">
          {INGREDIENT_FORMS.map((f) => (
            <button
              key={f.id}
              type="button"
              className="rounded border px-3 py-2 text-left"
              onClick={() => props.onSelectForm(f.id)}
            >
              {f.label}
            </button>
          ))}
        </div>
      </Sheet>
    );
  }

  const actions = new Set(availableActions(line));
  return (
    <Sheet title={`Składnik: ${line.line.ingredientName}`} onClose={props.onClose}>
      <div className="flex flex-col gap-2">
        {RESOLUTION_ACTIONS.filter((a) => actions.has(a.id)).map((a) => (
          <button
            key={a.id}
            type="button"
            className="rounded border px-3 py-2 text-left"
            onClick={() => props.onAction(a.id)}
          >
            {a.label}
          </button>
        ))}
      </div>

      {line.state === 'searching' ? (
        <div className="mt-4" aria-label="Wyniki wyszukiwania">
          <div className="flex items-end gap-2">
            <label className="flex-1 text-sm">
              <span className="mb-1 block opacity-70">Szukaj w katalogu</span>
              <input
                className="w-full rounded border px-2 py-1"
                value={props.searchQuery}
                onChange={(e) => props.onSearchQueryChange(e.target.value)}
              />
            </label>
            <button
              type="button"
              className="rounded border px-3 py-1"
              onClick={() => props.onSearch(props.searchQuery)}
            >
              Szukaj
            </button>
          </div>
          <CandidateList candidates={line.searchResults ?? []} onPick={props.onPickCandidate} />
        </div>
      ) : null}

      {line.substitutionIntent ? (
        <p className="mt-3 rounded border border-black/10 bg-black/[0.03] px-3 py-2 text-xs" data-testid="substitution-note">
          {substitutionNote(line)}
        </p>
      ) : null}

      {line.intakeHandoff ? (
        <p className="mt-3 rounded border border-black/10 bg-black/[0.03] px-3 py-2 text-xs" data-testid="intake-note">
          {line.intakeHandoff.note}
        </p>
      ) : null}

      {line.message ? (
        <p className="mt-3 text-sm text-amber-700" data-testid="sheet-message">
          {line.message}
        </p>
      ) : null}
    </Sheet>
  );
}

/* ── candidate list ──────────────────────────────────────────────────────── */

export interface CandidateListProps {
  candidates: readonly ProductCandidate[];
  onPick: (candidate: ProductCandidate) => void;
}

/** Honest candidate list — display name + the concrete reason it matched (no %). */
export function CandidateList({ candidates, onPick }: CandidateListProps) {
  if (candidates.length === 0) {
    return <p className="mt-3 text-sm opacity-60">Brak dopasowań w katalogu.</p>;
  }
  return (
    <ul className="mt-3 divide-y divide-black/10" aria-label="Kandydujące produkty">
      {candidates.map((c) => (
        <li key={c.productId} className="flex items-center justify-between gap-3 py-2">
          <span className="min-w-0">
            <span className="block truncate">{c.displayName}</span>
            <span className="text-xs opacity-50">{matchLabel(c.matchedOn)}</span>
          </span>
          <button type="button" className="shrink-0 rounded border px-3 py-1 text-sm" onClick={() => onPick(c)}>
            Wybierz
          </button>
        </li>
      ))}
    </ul>
  );
}

/* ── small helpers ───────────────────────────────────────────────────────── */

function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-black/10 bg-white p-4" aria-label={title}>
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">{title}</h3>
        <button type="button" className="rounded border px-2 py-1 text-sm" onClick={onClose}>
          Zamknij
        </button>
      </div>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function formLabel(form: IngredientForm): string {
  return INGREDIENT_FORMS.find((f) => f.id === form)?.label ?? form;
}

function matchLabel(matchedOn: ProductCandidate['matchedOn']): string {
  return matchedOn === 'exact_name' ? 'dokładna nazwa' : 'nazwa zawiera';
}

function substitutionNote(line: LineResolution): string {
  const intent = line.substitutionIntent!;
  switch (intent.reason) {
    case 'i_dont_have_this':
      return 'Zapisano: nie masz tego składnika.';
    case 'replace_with':
      return intent.requestedSubstituteName
        ? `Prośba o zamianę na: ${intent.requestedSubstituteName}.`
        : 'Podaj nazwę zamiennika.';
    case 'why_is_this_here':
      return 'Ten składnik należy do bazowej struktury receptury. Dokładne proporcje wylicza silnik po uzupełnieniu danych.';
    default:
      return '';
  }
}
