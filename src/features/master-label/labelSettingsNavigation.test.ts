import { describe, expect, it } from 'vitest';
import {
  labelSettingsReturn,
  readLabelSettingsRestore,
  readLabelSettingsReturn,
} from './labelSettingsNavigation';

describe('label settings navigation state', () => {
  it('preserves the exact route, version query and scroll position', () => {
    const origin = labelSettingsReturn('/pro/recipe', '?panel=summary&version=v1', 417);
    expect(origin).toEqual({
      to: '/pro/recipe?panel=summary&version=v1',
      scrollTop: 417,
    });
    expect(readLabelSettingsReturn({ labelSettingsReturn: origin })).toEqual(origin);
    expect(readLabelSettingsRestore({ labelSettingsRestore: origin })).toEqual(origin);
  });

  it('rejects malformed or external return destinations', () => {
    expect(readLabelSettingsReturn(null)).toBeNull();
    expect(
      readLabelSettingsReturn({
        labelSettingsReturn: { to: 'https://example.com', scrollTop: 10 },
      }),
    ).toBeNull();
  });

  it('carries the named source, focused run, loaded history and search back to the source', () => {
    const origin = labelSettingsReturn('/production', '?tab=history', 923, {
      origin: 'production-history',
      focusRunId: 'run-older',
      historyShown: 60,
    });
    expect(origin).toEqual({
      to: '/production?tab=history',
      scrollTop: 923,
      origin: 'production-history',
      focusRunId: 'run-older',
      historyShown: 60,
    });
    expect(readLabelSettingsReturn({ labelSettingsReturn: origin })).toEqual(origin);
    expect(readLabelSettingsRestore({ labelSettingsRestore: origin })).toEqual(origin);

    const fromLabels = labelSettingsReturn('/labels', '', 260, {
      origin: 'label-history',
      query: 'L-26',
    });
    expect(readLabelSettingsReturn({ labelSettingsReturn: fromLabels })).toEqual({
      to: '/labels',
      scrollTop: 260,
      origin: 'label-history',
      query: 'L-26',
    });
  });

  it('ignores unknown or malformed context and keeps the plain return', () => {
    expect(
      readLabelSettingsReturn({
        labelSettingsReturn: {
          to: '/pro/recipe',
          scrollTop: 5,
          origin: 'somewhere-else',
          focusRunId: 42,
          historyShown: -3,
          query: { text: 'x' },
        },
      }),
    ).toEqual({ to: '/pro/recipe', scrollTop: 5 });
    expect(
      readLabelSettingsReturn({ labelSettingsReturn: { to: '//example.com', scrollTop: 0 } }),
    ).toBeNull();
  });
});
