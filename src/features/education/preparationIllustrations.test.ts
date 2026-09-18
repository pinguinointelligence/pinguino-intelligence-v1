import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  MACHINE_CATALOG,
  NINJA_CREAMI_DELUXE_NC502EU,
  NINJA_CREAMI_NC302EU,
  NINJA_CREAMI_SCOOP_SWIRL_NC7,
  SAGE_SMART_SCOOP_BCI600,
} from '@/features/machine-catalog';
import { preparationPlanForRecipe } from '@/features/production-workspace/preparationPlan';
import {
  genericMachineEducation,
  machineEducationById,
  machineEducationForSelection,
} from './machineEducation';
import {
  MACHINE_STEP_ILLUSTRATION_BY_MACHINE_ID,
  PREPARATION_ILLUSTRATIONS,
} from './preparationIllustrations';

const PUBLIC = resolve(import.meta.dirname, '..', '..', '..', 'public');
const sha256 = (path: string) => createHash('sha256').update(readFileSync(path)).digest('hex');

/** Width/height from a lossy VP8 WebP header (what cwebp -q emits). */
function webpSize(path: string): { width: number; height: number } {
  const bytes = readFileSync(path);
  expect(bytes.toString('ascii', 0, 4)).toBe('RIFF');
  expect(bytes.toString('ascii', 8, 12)).toBe('WEBP');
  const chunk = bytes.toString('ascii', 12, 16);
  if (chunk === 'VP8X') {
    return { width: 1 + bytes.readUIntLE(24, 3), height: 1 + bytes.readUIntLE(27, 3) };
  }
  expect(chunk).toBe('VP8 ');
  return { width: bytes.readUInt16LE(26) & 0x3fff, height: bytes.readUInt16LE(28) & 0x3fff };
}

describe('PREP-13 one preparation-illustration registry for HOME and PRO', () => {
  it('maps exactly the three owner images to their canonical Ninja machines', () => {
    expect(MACHINE_STEP_ILLUSTRATION_BY_MACHINE_ID).toEqual({
      [NINJA_CREAMI_NC302EU.id]: 'IMG-FREEZE-NINJA-NC3',
      [NINJA_CREAMI_DELUXE_NC502EU.id]: 'IMG-FREEZE-NINJA-NC5',
      [NINJA_CREAMI_SCOOP_SWIRL_NC7.id]: 'IMG-FREEZE-NINJA-NC7',
    });
    const activeIds = new Set(MACHINE_CATALOG.filter((p) => p.active).map((p) => p.id));
    for (const machineId of Object.keys(MACHINE_STEP_ILLUSTRATION_BY_MACHINE_ID)) {
      expect(activeIds.has(machineId), machineId).toBe(true);
    }
  });

  it('ships whole square WebP files whose bytes match the registry, and nothing else', () => {
    const expectedFiles: string[] = [];
    const sourceShas = new Set<string>();
    for (const entry of Object.values(PREPARATION_ILLUSTRATIONS)) {
      sourceShas.add(entry.source.sha256);
      expect(entry.source).toMatchObject({ width: 1254, height: 1254 });
      expect(entry.alt.trim().length).toBeGreaterThan(0);
      expect(entry.alt).not.toMatch(/\d|IMG-|Ninja|NC\d/);
      for (const output of entry.outputs) {
        const file = join(PUBLIC, output.path);
        expectedFiles.push(output.path.split('/').at(-1)!);
        expect(sha256(file), output.path).toBe(output.sha256);
        expect(readFileSync(file).byteLength).toBe(output.bytes);
        // Whole square composition: the encode only resized, never cropped.
        expect(webpSize(file)).toEqual({ width: output.width, height: output.width });
      }
    }
    expect(sourceShas).toEqual(
      new Set([
        'a78f1e85790483536aa180147e23d678693ada64934ce88f8faf1aa2c5dccc1e',
        'cd60f2130ad8d130db37f25728fdcfe17f52dac08548e5306806674a9b671956',
        'ac6aac683baf44b6b92d2ae6b30e0b02be775d05377f6d72ae92d5b4acbb07cf',
      ]),
    );
    expect(readdirSync(join(PUBLIC, 'recipes', 'instructions', 'v2')).sort()).toEqual(
      expectedFiles.sort(),
    );
  });

  it('only the exact Ninja guides carry an image; generic, custom, bowl and compressor guides do not', () => {
    for (const profile of MACHINE_CATALOG) {
      const guide = machineEducationById(profile.id);
      const expected = MACHINE_STEP_ILLUSTRATION_BY_MACHINE_ID[profile.id];
      expect(guide?.illustration?.imageCode ?? null, profile.id).toBe(expected ?? null);
    }
    expect(genericMachineEducation('frozen_container').illustration).toBeNull();
    expect(machineEducationForSelection('custom-respin', 'respin')?.illustration).toBeNull();
    expect(machineEducationById(SAGE_SMART_SCOOP_BCI600.id)?.illustration).toBeNull();
  });

  it('HOME and PRO read the same illustration object and the verified 24 h from the same plan step', () => {
    for (const profile of [
      NINJA_CREAMI_NC302EU,
      NINJA_CREAMI_DELUXE_NC502EU,
      NINJA_CREAMI_SCOOP_SWIRL_NC7,
    ]) {
      const guide = machineEducationForSelection(profile.id, null);
      const plan = preparationPlanForRecipe({ items: [] }, null, guide);
      const machine = plan.steps.find((step) => step.kind === 'machine');
      expect(machine?.kind === 'machine' && machine.illustration).toBe(guide?.illustration);
      expect(machine?.kind === 'machine' && machine.timing).toBe(
        'Zamrażanie mieszanki w pojemniku: 24 h',
      );
      // The source states a duration, not a minimum, and never "overnight".
      expect(JSON.stringify(plan)).not.toMatch(/minimum|przez noc/i);
    }
  });
});
