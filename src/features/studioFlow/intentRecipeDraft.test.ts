/// <reference types="node" />
/**
 * Intent → deterministic starter recipe draft — contract, engine preview,
 * safe-source and purity guards. No LLM, no DB, no Mapper, no persistence,
 * no recipe mutation (all pinned).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CONFIG_VERSION } from '@/engine';
import { DEMO_INGREDIENTS } from '@/data/demoIngredients';
import {
  answerCurrentQuestion,
  buildIntentDraft,
  startAssistantFlow,
  type AssistantAnswerValue,
  type AssistantFlowState,
  type AssistantIntentDraft,
} from './conversationalAssistantFlow';
import { buildStarterRecipeDraft } from './intentRecipeDraft';
import { STUDIO_FLOW_COPY } from './studioFlowCopy';

const answer = (state: AssistantFlowState, value: AssistantAnswerValue): AssistantFlowState => {
  const r = answerCurrentQuestion(state, value);
  if (!r.ok) throw new Error(`unexpected reject: ${r.reason}`);
  return r.state;
};

/** A complete assistant intent draft, with overridable answers. */
const intentFor = (over: Partial<Record<string, AssistantAnswerValue>> = {}): AssistantIntentDraft => {
  let s = startAssistantFlow();
  s = answer(s, (over.opening as string) ?? '');
  s = answer(s, (over.product_type as string) ?? 'standard_gelato');
  s = answer(s, (over.serving_temperature as string) ?? '-11');
  s = answer(s, (over.batch_size as string) ?? '5000');
  s = answer(s, (over.main_flavor as string) ?? '');
  s = answer(s, (over.texture as string) ?? 'medium');
  s = answer(s, (over.sweetness as string) ?? 'balanced');
  s = answer(s, (over.restrictions as string[]) ?? []);
  s = answer(s, (over.boosters as string) ?? 'no');
  s = answer(s, (over.goal as string) ?? 'recipe_design');
  return buildIntentDraft(s);
};

const CATALOG_IDS = new Set(DEMO_INGREDIENTS.map((i) => i.id));

describe('starter draft — contract', () => {
  it('1. a complete gelato intent creates a deterministic starter recipe', () => {
    const draft = buildStarterRecipeDraft(intentFor({ product_type: 'standard_gelato' }));
    expect(draft.status).toBe('ready');
    expect(draft.category).toBe('milk_gelato');
    expect(draft.templateId).toBe('milk_base_v1');
    expect(draft.recipeInput).not.toBeNull();
    expect(draft.ingredients.map((i) => i.id)).toEqual([
      'milk_3_5',
      'cream_30',
      'smp',
      'sucrose',
      'dextrose',
      'tara_gum',
    ]);
  });

  it('a complete chocolate intent uses the locked chocolate base template', () => {
    const draft = buildStarterRecipeDraft(intentFor({ product_type: 'chocolate_gelato', main_flavor: 'czekoladowe' }));
    expect(draft.status).toBe('ready');
    expect(draft.category).toBe('chocolate_gelato');
    expect(draft.templateId).toBe('chocolate_base_v1');
    expect(draft.ingredients.map((i) => i.id)).toContain('dark_chocolate_70');
    // chocolate flavor is intrinsic to the template → no manual-flavor warning
    expect(draft.warnings.some((w) => w.code === 'flavor_manual_mapping_required')).toBe(false);
  });

  it('2. a custom / missing batch size returns needs_more_information', () => {
    const draft = buildStarterRecipeDraft(intentFor({ batch_size: 'custom' }));
    expect(draft.status).toBe('needs_more_information');
    expect(draft.missingFields).toContain('batch_size');
    expect(draft.recipeInput).toBeNull();
  });

  it('3. an unknown flavor never invents an ingredient composition', () => {
    const draft = buildStarterRecipeDraft(intentFor({ main_flavor: 'jakiśdziwnysmak' }));
    expect(draft.status).toBe('ready');
    // the recipe uses ONLY the locked milk base — never an invented flavor line
    for (const line of draft.ingredients) expect(CATALOG_IDS.has(line.id), line.id).toBe(true);
    expect(draft.ingredients.some((i) => /dziwny/i.test(i.name))).toBe(false);
    // unknown flavor group → no specific-flavor manual warning is fabricated
    expect(draft.flavorText).toBe('jakiśdziwnysmak');
  });

  it('a known specific flavor on the neutral base asks for manual flavor mapping', () => {
    const draft = buildStarterRecipeDraft(intentFor({ main_flavor: 'pistacja' }));
    expect(draft.status).toBe('ready');
    expect(draft.flavorGroup).toBe('nut');
    expect(draft.warnings.some((w) => w.code === 'flavor_manual_mapping_required')).toBe(true);
    // still no invented pistachio line — the base stays neutral
    expect(draft.ingredients.every((i) => CATALOG_IDS.has(i.id))).toBe(true);
  });

  it('4. an unsupported profile returns not_supported (never faked)', () => {
    for (const profile of ['sorbet', 'vegan_gelato'] as const) {
      const draft = buildStarterRecipeDraft(intentFor({ product_type: profile }));
      expect(draft.status, profile).toBe('not_supported');
      expect(draft.recipeInput).toBeNull();
      expect(draft.ingredients).toEqual([]);
      expect(draft.warnings.some((w) => w.code === 'unsupported_profile_needs_manual_start')).toBe(true);
    }
  });

  it('5. the starter draft is deterministic', () => {
    const intent = intentFor();
    expect(JSON.stringify(buildStarterRecipeDraft(intent))).toBe(
      JSON.stringify(buildStarterRecipeDraft(intent)),
    );
  });

  it('6. it never mutates the input assistant draft', () => {
    const intent = intentFor();
    const snapshot = JSON.stringify(intent);
    buildStarterRecipeDraft(intent);
    expect(JSON.stringify(intent)).toBe(snapshot);
  });

  it('7. the generated recipe totals the requested batch size', () => {
    for (const [batch, grams] of [['1000', 1000], ['5000', 5000], ['25000', 25000]] as const) {
      const draft = buildStarterRecipeDraft(intentFor({ batch_size: batch }));
      const total = draft.recipeInput!.items.reduce((s, item) => s + item.planned_grams, 0);
      expect(total, batch).toBeCloseTo(grams, 6);
      expect(draft.recipeInput!.target_batch_grams).toBe(grams);
    }
  });

  it('8. the serving temperature is preserved', () => {
    const draft = buildStarterRecipeDraft(intentFor({ serving_temperature: '-13' }));
    expect(draft.servingTemperatureC).toBe(-13);
    expect(draft.recipeInput!.target_temperature_c).toBe(-13);
  });

  it('9–11. uses ONLY approved reference ingredients — no Mapper rows, no PI-Calculated products', () => {
    const draft = buildStarterRecipeDraft(intentFor({ product_type: 'chocolate_gelato' }));
    for (const item of draft.recipeInput!.items) {
      // every ingredient comes from the demo/reference catalog (built-in Studio data)
      expect(CATALOG_IDS.has(item.ingredient.id), item.ingredient.id).toBe(true);
      // reference values, never a verified product / Mapper row / PI-Calculated ingredient
      expect(item.ingredient.is_verified).toBe(false);
      expect(item.ingredient.pod_value).toBeNull();
      expect(item.ingredient.pac_value).toBeNull();
      expect(/^PR-ING-/i.test(item.ingredient.id)).toBe(false);
    }
  });

  it('an incomplete assistant draft is blocked (never a fake recipe)', () => {
    let s = startAssistantFlow();
    s = answer(s, 'czekoladowe'); // only the optional opener
    const draft = buildStarterRecipeDraft(buildIntentDraft(s));
    expect(draft.status).toBe('blocked');
    expect(draft.missingFields.length).toBeGreaterThan(0);
    expect(draft.recipeInput).toBeNull();
  });
});

describe('starter draft — engine preview (real calculateRecipe)', () => {
  it('12–13. runs through calculateRecipe and stamps CONFIG 0.6.0', () => {
    const draft = buildStarterRecipeDraft(intentFor());
    expect(draft.enginePreview).not.toBeNull();
    expect(draft.enginePreview!.configVersion).toBe(CONFIG_VERSION);
    expect(draft.enginePreview!.configVersion).toBe('0.6.0');
    expect(typeof draft.enginePreview!.npacPoints).toBe('number');
    expect(typeof draft.enginePreview!.podPoints).toBe('number');
  });

  it('14–15. the optimization recommendation is honest — never a fake "optimized"', () => {
    // milk base is tuned for −11; at −13 its npac is honestly out of the seeded band.
    const cold = buildStarterRecipeDraft(intentFor({ serving_temperature: '-13' })).enginePreview!;
    expect(cold.optimizationRecommended).toBe(cold.violationReasons.length > 0);
    expect(cold.inBand).toBe(cold.violationReasons.length === 0);
    // inBand and optimizationRecommended are mutually exclusive booleans — no
    // status ever claims the recipe was optimized.
    expect(cold.inBand).toBe(!cold.optimizationRecommended);
  });
});

describe('starter draft — purity boundary', () => {
  const HERE = import.meta.dirname;
  const moduleSrc = readFileSync(join(HERE, 'intentRecipeDraft.ts'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '');
  const shellSrc = readFileSync(join(HERE, 'StudioAssistantShell.tsx'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '');
  const previewSrc = readFileSync(join(HERE, 'StarterDraftPreview.tsx'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '');

  it('24–26. no OpenAI/LLM, no Supabase, no Mapper-product imports', () => {
    for (const src of [moduleSrc, shellSrc]) {
      expect(/openai|anthropic|\bllm\b|gpt-|langchain/i.test(src)).toBe(false);
      expect(/supabase|service_role|@\/services\/|@\/lib\//i.test(src)).toBe(false);
      expect(/@\/data\/products|mapper_basement|productMapper/i.test(src)).toBe(false);
    }
  });

  it('27–31. no DB / recipe-save / inventory / PAC-POD write path, no CONFIG change', () => {
    for (const src of [moduleSrc, shellSrc]) {
      for (const verb of ['.insert(', '.update(', '.upsert(', '.delete(', 'fetch(']) {
        expect(src.includes(verb), verb).toBe(false);
      }
      expect(/saveRecipe\(|persistRecipe|localStorage|sessionStorage/.test(src)).toBe(false);
      expect(/updateStock|writeInventory|pac_value\s*=|pod_value\s*=|pi_calculated/.test(src)).toBe(false);
      expect(/CONFIG_VERSION\s*=|ENGINE_VERSION\s*=|TARGET_BANDS\s*=/.test(src)).toBe(false);
    }
  });

  it('19–20. the shell has NO recipe-SAVE path; local apply goes only through the gated helper', () => {
    // no save / persistence wiring anywhere in the shell (apply ≠ save)
    expect(/markSaved|createRecipe|saveRecipe\(|persistRecipe|loadPreset|setItems/.test(shellSrc)).toBe(false);
    expect(/Zapisz|Użyj jako/i.test(shellSrc)).toBe(false);
    // the shell never touches the recipe store directly — only the audited
    // local-apply helper module (slice: assistant-local-apply)
    expect(/useRecipeStore/.test(shellSrc)).toBe(false);
    expect(shellSrc.includes('applyStarterRecipeInputToStudio(')).toBe(true);
    // the raw starter draft is never rendered — only the tier-safe display object
    expect(shellSrc.includes('redactStarterDraftForDisplay(')).toBe(true);
  });

  it('22–23. exact starter grams are gated behind canViewExactGrams (Demo physically redacted)', () => {
    // the shell consumes the EXPLICIT capability names — never isPro / a price id
    expect(shellSrc.includes('canViewExactGrams')).toBe(true);
    expect(shellSrc.includes('canApplyStarterToStudio')).toBe(true);
    expect(/\bisPro\b|stripe_price_id/.test(shellSrc + previewSrc)).toBe(false);
    // grams render only in the exact display variant of the preview component;
    // the redacted variant shows the paid-plans note instead
    expect(previewSrc.includes("display.variant === 'exact'")).toBe(true);
    expect(previewSrc.includes('round1(line.grams)')).toBe(true);
    expect(/A\.demoGramsNote/.test(previewSrc)).toBe(true);
  });
});

describe('starter PL copy — honesty', () => {
  const S = STUDIO_FLOW_COPY.pl.assistant.starter;
  const all = [
    S.previewCta, S.readyTitle, S.readyBody, S.needsInfo, S.notSupported,
    S.flavorManual, S.optimizationRecommended, S.inBand, S.notSavedNote,
  ];

  it('never claims saved / applied, never a fake recipe-created claim', () => {
    for (const s of all) {
      expect(/zapisano|zastosowano|nałożono/i.test(s), s).toBe(false);
      expect(/utworzono recepturę|receptura została utworzona/i.test(s), s).toBe(false);
    }
    // the preview is honestly a "szkic bazy", not a created recipe
    expect(S.readyTitle).toMatch(/szkic/i);
    expect(S.readyBody).toMatch(/nie jest zapisywany ani nakładany/i);
  });

  it('unsupported copy says start manually and does not guess', () => {
    expect(S.notSupported).toMatch(/ręcznie/i);
    expect(S.notSupported).toMatch(/nie zgadujemy/i);
    expect(S.flavorManual).toMatch(/nie zgadujemy/i);
  });

  it('is really Polish', () => {
    expect(all.join(' ')).toMatch(/[ąćęłńóśźż]/);
  });
});
