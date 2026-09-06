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
});
