import { describe, expect, it } from 'vitest';
import {
  machineEducationCategory,
  machineEducationForSelection,
  productionMachineGuide,
  PROFESSIONAL_EDUCATION,
  type MachineEducationGuide,
} from './machineEducation';

/*
 * The machine hand-off a batch runs with is ONE answer for HOME and PRO.
 *
 * HOME (`HomePreparation`) and PRO (`useProductionWorkspace`) both feed their guide
 * into the same `preparationPlanForSession`, so a recipe that answered two different
 * guides would produce two different preparation plans for one recipe — the exact
 * boundary these tests hold shut.
 */
const HOME_MACHINE = 'ninja-creami-deluxe-nc502eu-eu-es';

describe('MACHINE-GUIDE — one production hand-off authority for HOME and PRO', () => {
  it('MACHINE-GUIDE-01 a home machine answers exactly the canonical catalog guide', () => {
    const guide = productionMachineGuide({
      machineKind: 'home',
      machineId: HOME_MACHINE,
      machineTechnology: 'respin',
    });
    expect(guide).not.toBeNull();
    expect(guide).toEqual(machineEducationForSelection(HOME_MACHINE, 'respin'));
    expect((guide as MachineEducationGuide).sourceMachineId).toBe(HOME_MACHINE);
  });

  it('MACHINE-GUIDE-02 a Professional recipe gets the professional card, never a home machine one', () => {
    // §16: an official recipe opened in HOME keeps its Professional machine. Until H4-6
    // that meant NO machine step at all — the batch ended with the base prepared and
    // nothing said about freezing it. It now gets the batch-freezer card, and a home
    // `machineId` it happens to carry can never bring the home card with it.
    expect(machineEducationForSelection(HOME_MACHINE, 'respin')).not.toBeNull();
    const guide = productionMachineGuide({
      machineKind: 'professional',
      machineId: HOME_MACHINE,
      machineTechnology: 'respin',
    });
    expect(guide).toBe(PROFESSIONAL_EDUCATION);
    expect(guide?.category).toBe('professional');
    expect(guide?.sourceMachineId).toBeNull();
    expect(guide).not.toEqual(machineEducationForSelection(HOME_MACHINE, 'respin'));
  });

  it('MACHINE-GUIDE-02b the professional card states the three real steps and invents no program', () => {
    // H4-6 + H4-3 (Owner 18.09.2026): technologically correct, and no program name the
    // machine data has not confirmed.
    expect(PROFESSIONAL_EDUCATION.steps).toEqual([
      'Wlej przygotowaną, zimną bazę',
      'Uruchom proces frezowania',
      'Wyjmij gotowy produkt',
    ]);
    expect(PROFESSIONAL_EDUCATION.programName).toBeNull();
    expect(PROFESSIONAL_EDUCATION.programStatus).toBe('data_needed');
    expect(PROFESSIONAL_EDUCATION.timing.status).toBe('missing');
    expect(PROFESSIONAL_EDUCATION.beforeStartSteps).toEqual([]);
  });

  it('MACHINE-GUIDE-02c no home technology can ever resolve to the professional card', () => {
    for (const technology of ['respin', 'respin_soft', 'frozen_bowl', 'compressor'] as const) {
      expect(machineEducationCategory(technology)).not.toBe('professional');
    }
  });

  it('MACHINE-GUIDE-03 a recipe with no machine kind yet gets no guessed guide', () => {
    expect(
      productionMachineGuide({
        machineKind: null,
        machineId: HOME_MACHINE,
        machineTechnology: 'respin',
      }),
    ).toBeNull();
  });

  it('MACHINE-GUIDE-04 a saved custom home machine keeps the technology fallback', () => {
    const guide = productionMachineGuide({
      machineKind: 'home',
      machineId: 'custom-machine-not-in-catalog',
      machineTechnology: 'compressor',
    });
    expect(guide?.category).toBe('compressor');
    expect(guide).toEqual(
      machineEducationForSelection('custom-machine-not-in-catalog', 'compressor'),
    );
  });

  it('MACHINE-GUIDE-05 a home machine with no technology and no catalog entry stays without a guide', () => {
    expect(
      productionMachineGuide({
        machineKind: 'home',
        machineId: null,
        machineTechnology: null,
      }),
    ).toBeNull();
  });
});
