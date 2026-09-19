/**
 * OD-32 — which capability opens which part of the Produkcja area.
 *
 * The runtime cases that cover these gates (`productsArea.runtime.test.tsx`,
 * `productionAreaLabelsEntry.runtime.test.tsx`, `LabelsHubPage.runtime.test.tsx`) mount real
 * pages, so they cannot run in this sandbox — a font asset outside the worktree is refused, and
 * the file never collects. This one is pure resolution: no DOM, no fonts, and it pins the exact
 * decision those pages make, so the rule is provable here and not only on CI.
 *
 * The rule OD-32 introduced: a signed-in HOME customer may RUN a batch. That says nothing about
 * labelling product for sale, seeing ingredient costs, or reading production history — each of
 * those has its own capability, and each must still refuse HOME.
 */
import { describe, expect, it } from 'vitest';
import { proCoreCapabilitiesFor } from '@/features/pro-core/proCoreCapabilities';
import { PRODUCTION_AREA_SECTIONS, productionAreaSection } from './productionAreaSections';

/** The gate `ProductionAreaSurface` computes, reproduced from the same two inputs. */
const sectionGated = (
  section: Parameters<typeof productionAreaSection>[0],
  persona: 'demo' | 'home' | 'pro',
) => {
  const area = productionAreaSection(section);
  const capabilities = proCoreCapabilitiesFor(persona);
  return area.proOnly && !capabilities[area.requires ?? 'canPrintProductionLabels'];
};

describe('OD-32 — the Produkcja area gates each section on its own capability', () => {
  it('OD32-GATE-A Etykiety names the capability it needs, and it is not Production Mode', () => {
    /* This is the drift that OD-32 would otherwise have caused: the labels section used to be
       opened by `canUseProductionMode`, so the moment a HOME plan could run a batch it would
       also have been handed the label toolset. */
    expect(productionAreaSection('labels').requires).toBe('canPrintProductionLabels');
    expect(proCoreCapabilitiesFor('home').canUseProductionMode).toBe(true);
    expect(proCoreCapabilitiesFor('home').canPrintProductionLabels).toBe(false);
  });

  it('OD32-GATE-B Etykiety stays shut for HOME and DEMO, open for PRO', () => {
    expect(sectionGated('labels', 'demo')).toBe(true);
    expect(sectionGated('labels', 'home')).toBe(true);
    expect(sectionGated('labels', 'pro')).toBe(false);
  });

  it('OD32-GATE-C Partie, Produkty and Maszyna are open to everyone who reaches them', () => {
    // Unchanged by OD-32: these were never proOnly.
    for (const section of ['batches', 'products', 'machine'] as const) {
      expect(productionAreaSection(section).proOnly, section).toBe(false);
      expect(sectionGated(section, 'home'), section).toBe(false);
    }
  });

  it('OD32-GATE-D every proOnly section names a capability that is genuinely PRO-only', () => {
    /* The structural guard: a future section cannot quietly reuse a capability HOME now has.
       If someone adds `requires: 'canUseProductionMode'`, this fails. */
    const home = proCoreCapabilitiesFor('home');
    const pro = proCoreCapabilitiesFor('pro');
    for (const section of PRODUCTION_AREA_SECTIONS) {
      if (!section.proOnly) continue;
      const cap = section.requires ?? 'canPrintProductionLabels';
      expect(home[cap], `${section.id} → ${cap} must still refuse HOME`).toBe(false);
      expect(pro[cap], `${section.id} → ${cap} must allow PRO`).toBe(true);
    }
  });

  it('OD32-GATE-E the costing surface is not opened by Production Mode either', () => {
    // „Moja cena" in the products catalogue is gated on canUseCosts, which HOME does not have.
    expect(proCoreCapabilitiesFor('home').canUseCosts).toBe(false);
    expect(proCoreCapabilitiesFor('demo').canUseCosts).toBe(false);
    expect(proCoreCapabilitiesFor('pro').canUseCosts).toBe(true);
  });

  it('OD32-GATE-F production history is not opened by Production Mode either', () => {
    expect(proCoreCapabilitiesFor('home').canViewProductionHistory).toBe(false);
    expect(proCoreCapabilitiesFor('demo').canViewProductionHistory).toBe(false);
    expect(proCoreCapabilitiesFor('pro').canViewProductionHistory).toBe(true);
  });
});
