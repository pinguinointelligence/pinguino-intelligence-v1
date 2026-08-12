import { describe, expect, it, vi } from 'vitest';
import { commitRecipeDefaultsAfterRemoteSave } from './accountRecipeDefaultsSave';

describe('account recipe defaults save boundary', () => {
  it('commits the local account snapshot only after the remote write succeeds', async () => {
    const commitLocal = vi.fn();

    await commitRecipeDefaultsAfterRemoteSave(
      async () => undefined,
      commitLocal,
    );

    expect(commitLocal).toHaveBeenCalledOnce();
  });

  it('leaves the local snapshot unchanged when the remote write fails', async () => {
    const commitLocal = vi.fn();

    await expect(
      commitRecipeDefaultsAfterRemoteSave(
        async () => {
          throw new Error('remote unavailable');
        },
        commitLocal,
      ),
    ).rejects.toThrow('remote unavailable');

    expect(commitLocal).not.toHaveBeenCalled();
  });
});
