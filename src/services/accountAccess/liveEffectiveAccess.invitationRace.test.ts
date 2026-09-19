import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  getClaims: vi.fn(),
  rpc: vi.fn(),
  from: vi.fn(),
}));

vi.mock('@/lib/supabase/client', () => ({
  supabase: {
    auth: { getClaims: h.getClaims },
    rpc: h.rpc,
    from: h.from,
  },
}));

import { syncEffectiveAccess } from './liveEffectiveAccess';
import {
  __resetPartnerInvitationCoordinatorForTests,
  coordinatePartnerInvitation,
} from './partnerInvitationCoordinator';

beforeEach(() => {
  vi.clearAllMocks();
  __resetPartnerInvitationCoordinatorForTests();
  h.getClaims.mockResolvedValue({ data: null, error: null });
  h.rpc.mockResolvedValue({ data: { accepted: false }, error: null });
  h.from.mockImplementation(() => {
    throw new Error('stop after invitation probe');
  });
});

describe('SOL-010 — partner invitation RPC ordering', () => {
  it('keeps invitation acceptance out of the access reader when Auth has no ready session', async () => {
    await syncEffectiveAccess('user-a', 'a@example.test');

    expect(h.rpc).not.toHaveBeenCalled();
  });

  it('does not call the RPC for an authenticated projection without verified session claims', async () => {
    await expect(
      coordinatePartnerInvitation({ status: 'authed', userId: 'user-a' }),
    ).resolves.toEqual({ state: 'invitation-pending' });

    expect(h.rpc).not.toHaveBeenCalled();
  });

  it('calls the RPC once when verified session claims are ready, including duplicate bootstrap', async () => {
    h.getClaims.mockResolvedValue({
      data: {
        claims: {
          sub: 'user-a',
          session_id: 'session-a',
          is_anonymous: false,
        },
      },
      error: null,
    });
    h.rpc.mockResolvedValue({ data: { accepted: true }, error: null });

    await Promise.all([
      coordinatePartnerInvitation({ status: 'authed', userId: 'user-a' }),
      coordinatePartnerInvitation({ status: 'authed', userId: 'user-a' }),
    ]);

    expect(h.rpc).toHaveBeenCalledTimes(1);
    expect(h.rpc).toHaveBeenCalledWith('gellatti_accept_my_partner_invitation_v1');
  });
});
