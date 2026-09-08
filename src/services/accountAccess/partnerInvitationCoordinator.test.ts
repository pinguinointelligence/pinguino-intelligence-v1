import { describe, expect, it, vi } from 'vitest';
import {
  createPartnerInvitationCoordinator,
  type ConfirmedAuthSession,
} from './partnerInvitationCoordinator';

const USER_A: ConfirmedAuthSession = { userId: 'user-a', sessionId: 'session-a' };
const USER_B: ConfirmedAuthSession = { userId: 'user-b', sessionId: 'session-b' };

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: vi.fn((key: string) => values.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => values.set(key, value)),
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe('SOL-010 — canonical partner invitation coordinator', () => {
  it.each([
    [{ status: 'loading', userId: null } as const, 'auth-loading'],
    [{ status: 'anon', userId: null } as const, 'unauthenticated'],
  ])('makes zero RPC calls for %o', async (auth, expectedState) => {
    const acceptInvitation = vi.fn();
    const coordinator = createPartnerInvitationCoordinator({
      getConfirmedSession: vi.fn(),
      acceptInvitation,
      getStorage: () => memoryStorage(),
    });

    await expect(coordinator.evaluate(auth)).resolves.toEqual({ state: expectedState });
    expect(acceptInvitation).not.toHaveBeenCalled();
  });

  it('keeps the invitation pending when the projected user has no confirmed session', async () => {
    const acceptInvitation = vi.fn();
    const coordinator = createPartnerInvitationCoordinator({
      getConfirmedSession: vi.fn().mockResolvedValue(null),
      acceptInvitation,
      getStorage: () => memoryStorage(),
    });

    await expect(
      coordinator.evaluate({ status: 'authed', userId: USER_A.userId }),
    ).resolves.toEqual({ state: 'invitation-pending' });
    expect(acceptInvitation).not.toHaveBeenCalled();
  });

  it('rejects a session belonging to a previous/different projected user', async () => {
    const acceptInvitation = vi.fn();
    const coordinator = createPartnerInvitationCoordinator({
      getConfirmedSession: vi.fn().mockResolvedValue(USER_B),
      acceptInvitation,
      getStorage: () => memoryStorage(),
    });

    await expect(
      coordinator.evaluate({ status: 'authed', userId: USER_A.userId }),
    ).resolves.toEqual({ state: 'stale-session' });
    expect(acceptInvitation).not.toHaveBeenCalled();
  });

  it('makes exactly one logical RPC call for concurrent Strict Mode/remount evaluations', async () => {
    const request = deferred<{ accepted: boolean }>();
    const getConfirmedSession = vi.fn().mockResolvedValue(USER_A);
    const acceptInvitation = vi.fn(() => request.promise);
    const coordinator = createPartnerInvitationCoordinator({
      getConfirmedSession,
      acceptInvitation,
      getStorage: () => memoryStorage(),
    });

    const first = coordinator.evaluate({ status: 'authed', userId: USER_A.userId });
    const second = coordinator.evaluate({ status: 'authed', userId: USER_A.userId });
    await vi.waitFor(() => expect(acceptInvitation).toHaveBeenCalledTimes(1));
    request.resolve({ accepted: true });

    await expect(first).resolves.toMatchObject({ state: 'invitation-completed', accepted: true });
    await expect(second).resolves.toMatchObject({ state: 'invitation-completed', accepted: true });
    expect(acceptInvitation).toHaveBeenCalledTimes(1);
  });

  it('does not repeat a completed session after remount', async () => {
    const storage = memoryStorage();
    const acceptInvitation = vi.fn().mockResolvedValue({ accepted: true });
    const dependencies = {
      getConfirmedSession: vi.fn().mockResolvedValue(USER_A),
      acceptInvitation,
      getStorage: () => storage,
    };
    const coordinator = createPartnerInvitationCoordinator(dependencies);

    await coordinator.evaluate({ status: 'authed', userId: USER_A.userId });
    await expect(
      coordinator.evaluate({ status: 'authed', userId: USER_A.userId }),
    ).resolves.toMatchObject({ state: 'invitation-completed', deduplicated: true });
    expect(acceptInvitation).toHaveBeenCalledTimes(1);
  });

  it('treats a domain no-op as completed for the same session', async () => {
    const acceptInvitation = vi.fn().mockResolvedValue({
      accepted: false,
      reason: 'no_pending_invitation',
    });
    const coordinator = createPartnerInvitationCoordinator({
      getConfirmedSession: vi.fn().mockResolvedValue(USER_A),
      acceptInvitation,
      getStorage: () => memoryStorage(),
    });

    await expect(
      coordinator.evaluate({ status: 'authed', userId: USER_A.userId }),
    ).resolves.toMatchObject({
      state: 'invitation-completed',
      accepted: false,
      deduplicated: false,
    });
    await coordinator.evaluate({ status: 'authed', userId: USER_A.userId });

    expect(acceptInvitation).toHaveBeenCalledTimes(1);
  });

  it('does not repeat a completed session after refresh', async () => {
    const storage = memoryStorage();
    const firstAccept = vi.fn().mockResolvedValue({ accepted: true });
    const firstCoordinator = createPartnerInvitationCoordinator({
      getConfirmedSession: vi.fn().mockResolvedValue(USER_A),
      acceptInvitation: firstAccept,
      getStorage: () => storage,
    });
    await firstCoordinator.evaluate({ status: 'authed', userId: USER_A.userId });

    const refreshedAccept = vi.fn();
    const refreshedCoordinator = createPartnerInvitationCoordinator({
      getConfirmedSession: vi.fn().mockResolvedValue(USER_A),
      acceptInvitation: refreshedAccept,
      getStorage: () => storage,
    });
    await expect(
      refreshedCoordinator.evaluate({ status: 'authed', userId: USER_A.userId }),
    ).resolves.toMatchObject({ state: 'invitation-completed', deduplicated: true });
    expect(refreshedAccept).not.toHaveBeenCalled();
  });

  it('ignores an old response after the user changes and does not mark it completed', async () => {
    const storage = memoryStorage();
    const request = deferred<{ accepted: boolean }>();
    const getConfirmedSession = vi.fn().mockResolvedValueOnce(USER_A).mockResolvedValueOnce(USER_B);
    const coordinator = createPartnerInvitationCoordinator({
      getConfirmedSession,
      acceptInvitation: vi.fn(() => request.promise),
      getStorage: () => storage,
    });

    const result = coordinator.evaluate({ status: 'authed', userId: USER_A.userId });
    request.resolve({ accepted: true });

    await expect(result).resolves.toEqual({ state: 'stale-session' });
    expect(storage.setItem).not.toHaveBeenCalled();
  });

  it('ignores a response that finishes after logout', async () => {
    const request = deferred<{ accepted: boolean }>();
    const getConfirmedSession = vi.fn().mockResolvedValueOnce(USER_A).mockResolvedValueOnce(null);
    const coordinator = createPartnerInvitationCoordinator({
      getConfirmedSession,
      acceptInvitation: vi.fn(() => request.promise),
      getStorage: () => memoryStorage(),
    });

    const result = coordinator.evaluate({ status: 'authed', userId: USER_A.userId });
    request.resolve({ accepted: true });

    await expect(result).resolves.toEqual({ state: 'stale-session' });
  });

  it('evaluates two different confirmed sessions independently', async () => {
    let current = USER_A;
    const acceptInvitation = vi.fn().mockResolvedValue({ accepted: true });
    const coordinator = createPartnerInvitationCoordinator({
      getConfirmedSession: vi.fn(async () => current),
      acceptInvitation,
      getStorage: () => memoryStorage(),
    });

    await coordinator.evaluate({ status: 'authed', userId: USER_A.userId });
    current = USER_B;
    await coordinator.evaluate({ status: 'authed', userId: USER_B.userId });

    expect(acceptInvitation).toHaveBeenCalledTimes(2);
  });

  it('keeps a failed call retryable and exposes only a typed failure', async () => {
    const acceptInvitation = vi.fn().mockRejectedValue(new Error('raw JWT/session response'));
    const coordinator = createPartnerInvitationCoordinator({
      getConfirmedSession: vi.fn().mockResolvedValue(USER_A),
      acceptInvitation,
      getStorage: () => memoryStorage(),
    });

    await expect(
      coordinator.evaluate({ status: 'authed', userId: USER_A.userId }),
    ).resolves.toEqual({ state: 'invitation-failed', reason: 'technical' });
    expect(
      JSON.stringify(await coordinator.evaluate({ status: 'authed', userId: USER_A.userId })),
    ).not.toContain('JWT');
    expect(acceptInvitation).toHaveBeenCalledTimes(2);
  });
});
