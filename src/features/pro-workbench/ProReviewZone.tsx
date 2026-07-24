/**
 * PINGÜINO Pro — the RED REVIEW ZONE below the one-screen workbench (owner architecture).
 *
 * Everything that is NOT part of the core edit loop lives BELOW the viewport-height
 * workbench — reached only by an INTENTIONAL scroll, never during normal editing.
 * Every module stays fully functional and ALWAYS-VISIBLY red-marked (the existing
 * `ReviewMarkedModule`), and the owner gets an explicit INVENTORY TABLE: module |
 * purpose | current place | recommendation | owner decision = OCZEKUJE. Nothing is
 * removed, nothing is CSS-hidden. Presentation only.
 */
import type { ReactNode } from 'react';
import { SectionLabel } from '@/components/shared/SectionLabel';
import { copy } from '@/copy/en';

const z = copy.proWorkbench.reviewZone;

export interface ReviewInventoryRow {
  id: string;
  name: string;
  purpose: string;
  route: string;
  recommendation: string;
}

export function ProReviewZone({
  inventory,
  children,
}: {
  inventory: readonly ReviewInventoryRow[];
  children: ReactNode;
}) {
  return (
    <section
      className="border-t-2 border-review/60 px-4 pb-16 pt-6 sm:px-6"
      data-testid="pro-review-zone"
      aria-label={z.title}
    >
      <SectionLabel>{z.title}</SectionLabel>
      <p className="mt-1 max-w-3xl text-xs leading-relaxed text-ivory/60">{z.note}</p>

      {/* The owner's decision inventory — every red-marked module, decision OCZEKUJE. */}
      <div className="mt-4 overflow-x-auto rounded-md border border-review/40">
        {/* aria-label instead of an sr-only <caption>: a position:absolute caption escapes
            the scroll container's clipping in Chrome and phantom-extends the PAGE scroll —
            exactly the zero-scroll defect this architecture forbids. */}
        <table
          className="w-full min-w-[640px] text-left text-[12px]"
          data-testid="review-inventory-table"
          aria-label={z.tableTitle}
        >
          <thead>
            <tr className="border-b border-ivory/15 text-[0.6rem] tracking-label text-ivory/60 uppercase">
              <th scope="col" className="px-3 py-2 font-medium">{z.columns.name}</th>
              <th scope="col" className="px-3 py-2 font-medium">{z.columns.purpose}</th>
              <th scope="col" className="px-3 py-2 font-medium">{z.columns.route}</th>
              <th scope="col" className="px-3 py-2 font-medium">{z.columns.recommendation}</th>
              <th scope="col" className="px-3 py-2 font-medium">{z.columns.decision}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ivory/10">
            {inventory.map((row) => (
              <tr key={row.id} data-testid={`review-inventory-${row.id}`}>
                <td className="px-3 py-2 text-ivory">{row.name}</td>
                <td className="px-3 py-2 text-ivory/70">{row.purpose}</td>
                <td className="px-3 py-2 text-ivory/70">{row.route}</td>
                <td className="px-3 py-2 text-ivory/70">{row.recommendation}</td>
                <td className="px-3 py-2">
                  <span className="rounded border border-review/40 bg-review/10 px-1.5 py-0.5 text-[0.6rem] font-medium tracking-[0.08em] text-review uppercase">
                    {z.pending}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* The red-marked modules themselves — functional, collapsed, never hidden. */}
      <div className="mt-5 space-y-3">{children}</div>
    </section>
  );
}
