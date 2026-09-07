/**
 * ONE blocker → ONE next action.
 *
 * The bug these cover is not a crash: it is a screen that said „przelicz" while opening
 * and highlighting a module that already said „Zatwierdzone". Two truthful statements
 * about different things, presented as one instruction.
 */
import { describe, expect, it } from 'vitest';
import { resolveSaveBlocker, SAVE_BLOCKER_MESSAGE_PL } from './saveBlocker';

describe('nothing blocking means nothing to say', () => {
  it('returns no blocker when the gate is happy', () => {
    expect(resolveSaveBlocker({ practical: null, settingsConfirmed: true })).toBeNull();
    // Not even when settings are dirty: dirty settings are not themselves a refusal.
    expect(resolveSaveBlocker({ practical: null, settingsConfirmed: false })).toBeNull();
  });
});

describe('each blocker names the ONE control that answers it', () => {
  it('a recalculation points at Przelicz, and says so', () => {
    const blocker = resolveSaveBlocker({
      practical: {
        kind: 'RECALCULATION_REQUIRED',
        message: SAVE_BLOCKER_MESSAGE_PL.RECALCULATION_REQUIRED,
      },
      settingsConfirmed: true,
    });
    expect(blocker?.action).toBe('recalculate');
    expect(blocker?.message).toBe('Przelicz recepturę, aby zapisać.');
    // The sentence and the highlight are two views of one fact.
    expect(blocker?.action).not.toBe('settings');
  });

  it('unapplied preview changes point at the preview, not at Settings', () => {
    const blocker = resolveSaveBlocker({
      practical: { kind: 'APPLY_REQUIRED', message: SAVE_BLOCKER_MESSAGE_PL.APPLY_REQUIRED },
      settingsConfirmed: true,
    });
    expect(blocker?.action).toBe('apply');
  });

  it('a blocker no control answers points at nothing', () => {
    for (const kind of ['PRODUCT_DATA_REQUIRED', 'REFUSED'] as const) {
      const blocker = resolveSaveBlocker({
        practical: { kind, message: 'Brakuje danych produktu.' },
        settingsConfirmed: true,
      });
      expect(blocker?.action).toBeNull();
      // And it keeps the gate's own reason, which is the only thing that explains it.
      expect(blocker?.message).toBe('Brakuje danych produktu.');
    }
  });
});

describe('settings are upstream of everything else', () => {
  it('unconfirmed settings outrank a recalculation', () => {
    const blocker = resolveSaveBlocker({
      practical: {
        kind: 'RECALCULATION_REQUIRED',
        message: SAVE_BLOCKER_MESSAGE_PL.RECALCULATION_REQUIRED,
      },
      settingsConfirmed: false,
    });
    // Recalculating a draft whose settings are about to change is work the customer
    // would immediately have to redo.
    expect(blocker?.kind).toBe('SETTINGS_CONFIRMATION_REQUIRED');
    expect(blocker?.action).toBe('settings');
    expect(blocker?.message).toBe('Potwierdź ustawienia, aby zapisać.');
  });

  it('but "not yet known" is not "unconfirmed"', () => {
    // Before Settings has reported, we must not invent a settings problem.
    const blocker = resolveSaveBlocker({
      practical: {
        kind: 'RECALCULATION_REQUIRED',
        message: SAVE_BLOCKER_MESSAGE_PL.RECALCULATION_REQUIRED,
      },
      settingsConfirmed: null,
    });
    expect(blocker?.kind).toBe('RECALCULATION_REQUIRED');
  });
});

describe('the copy is about the customer, not about us', () => {
  it('never mentions the pipeline', () => {
    for (const message of Object.values(SAVE_BLOCKER_MESSAGE_PL)) {
      expect(message).not.toMatch(/podgląd i zastosuj|zweryfikowaną recepturę|gramaturami/);
      // Short enough to read at a glance, and it always ends in the reason.
      expect(message.length).toBeLessThan(45);
      expect(message).toMatch(/aby zapisać\.$/);
    }
  });
});
