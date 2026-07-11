import { describe, expect, it } from 'vitest';
import {
  cancelOnConflict,
  canTransitionSession,
  confirmTakeover,
  evaluateLogin,
  revokeSession,
} from './sessionPolicy';
import {
  generateDeviceHash,
  isDeviceActive,
  registerOrRecognise,
  renameDevice,
  revokeDevice,
  setDeviceTrust,
} from './deviceRegistry';
import { adminSecurityEvent, buildSecurityEvent, sanitizeMetadata, userSecurityEvent } from './securityEvents';
import type { AppSession, DeviceRecord, LoginAttempt } from './contracts';

const active = (over: Partial<AppSession> = {}): AppSession => ({
  sessionId: 's-old',
  userId: 'u1',
  deviceId: 'd1',
  state: 'active',
  createdAt: 't0',
  lastActivityAt: 't0',
  expiresAt: null,
  revokedAt: null,
  replacedBy: null,
  ...over,
});
const attempt = (over: Partial<LoginAttempt> = {}): LoginAttempt => ({
  attemptId: 'a1',
  userId: 'u1',
  deviceId: 'd2',
  at: 't1',
  ...over,
});

describe('single-active-session policy', () => {
  it('first login (no active session) → activate', () => {
    expect(evaluateLogin(null, attempt(), 'active').outcome).toBe('activate');
  });
  it('same user + same device → resume_same (refresh/reconnect, not a conflict)', () => {
    expect(evaluateLogin(active(), attempt({ deviceId: 'd1' }), 'active').outcome).toBe('resume_same');
  });
  it('a second device → conflict, naming the conflicting session', () => {
    const e = evaluateLogin(active(), attempt({ deviceId: 'd2' }), 'active');
    expect(e.outcome).toBe('conflict');
    expect(e.conflictingSessionId).toBe('s-old');
  });
  it('blocking account state → blocked (no session created)', () => {
    expect(evaluateLogin(active(), attempt(), 'suspended').outcome).toBe('blocked');
  });

  it('confirmed takeover: old → replaced+revoked, new → active, idempotent key', () => {
    const r = confirmTakeover(active(), attempt(), 's-new', 't1');
    expect(r.oldSession.state).toBe('replaced');
    expect(r.oldSession.revokedAt).toBe('t1');
    expect(r.oldSession.replacedBy).toBe('s-new');
    expect(r.newSession.state).toBe('active');
    expect(r.idempotencyKey).toBe('takeover:u1:s-old:s-new');
  });

  it('cancel on conflict blocks the new attempt and leaves the old session untouched', () => {
    const blocked = cancelOnConflict(attempt(), 't1');
    expect(blocked.state).toBe('blocked');
  });

  it('revokeSession is idempotent on terminal states', () => {
    const revoked = revokeSession(active(), 't2');
    expect(revoked.state).toBe('revoked');
    expect(revokeSession(revoked, 't3')).toBe(revoked);
  });

  it('only legal session transitions are allowed', () => {
    expect(canTransitionSession('active', 'replaced')).toBe(true);
    expect(canTransitionSession('revoked', 'active')).toBe(false);
    expect(canTransitionSession('pending', 'active')).toBe(true);
  });
});

describe('device registry (privacy-conscious)', () => {
  it('generates a hex hash from an injected RNG (pure/testable)', () => {
    expect(generateDeviceHash(() => 'ABCD1234ffff0000')).toBe('abcd1234ffff0000');
    expect(() => generateDeviceHash(() => 'short')).toThrow();
  });
  const obs = { deviceHash: 'a'.repeat(16), friendlyName: 'Laptop', category: 'desktop' as const, browserFamily: 'Chrome', osFamily: 'Windows' };

  it('registers a new device untrusted, then recognises a returning one (bumps lastSeen only)', () => {
    const created = registerOrRecognise(null, 'u1', 'dev1', obs, 't0');
    expect(created.trusted).toBe(false);
    expect(created.firstSeen).toBe('t0');
    const seen = registerOrRecognise(created, 'u1', 'dev1', obs, 't5');
    expect(seen.firstSeen).toBe('t0');
    expect(seen.lastSeen).toBe('t5');
  });

  it('rename / trust / revoke transitions; revoked device is not active', () => {
    const d: DeviceRecord = registerOrRecognise(null, 'u1', 'dev1', obs, 't0');
    expect(renameDevice(d, '  Studio Mac  ').friendlyName).toBe('Studio Mac');
    expect(() => renameDevice(d, '   ')).toThrow();
    expect(setDeviceTrust(d, true).trusted).toBe(true);
    const revoked = revokeDevice(setDeviceTrust(d, true), 't9');
    expect(revoked.trusted).toBe(false);
    expect(isDeviceActive(revoked)).toBe(false);
  });
});

describe('security events (append-only, secret-safe)', () => {
  it('sanitizeMetadata strips credential-like keys and non-scalars', () => {
    const safe = sanitizeMetadata({ ip: '1.2.3.4', password: 'x', access_token: 'y', magicLink: 'z', ok: true, nested: { a: 1 } });
    expect(safe).toEqual({ ip: '1.2.3.4', ok: true });
    expect(safe).not.toHaveProperty('password');
    expect(safe).not.toHaveProperty('access_token');
    expect(safe).not.toHaveProperty('magicLink');
  });

  it('builds a deterministic correlation key for idempotency', () => {
    const e1 = buildSecurityEvent({ actorType: 'user', actorId: 'u1', affectedUserId: 'u1', eventType: 'login_succeeded', occurredAt: 't1', sessionId: 's1' });
    const e2 = buildSecurityEvent({ actorType: 'user', actorId: 'u1', affectedUserId: 'u1', eventType: 'login_succeeded', occurredAt: 't1', sessionId: 's1' });
    expect(e1.correlationKey).toBe(e2.correlationKey);
  });

  it('user + admin convenience builders; admin requires a reason', () => {
    expect(userSecurityEvent('u1', 'device_registered', 't1').actorType).toBe('user');
    const a = adminSecurityEvent('admin1', 'u2', 'account_suspended', 't1', 'fraud review');
    expect(a.actorType).toBe('admin');
    expect(a.reason).toBe('fraud review');
    expect(() => adminSecurityEvent('admin1', 'u2', 'account_suspended', 't1', '  ')).toThrow();
  });

  it('never carries a raw token even if passed in metadata', () => {
    const e = buildSecurityEvent({ actorType: 'system', actorId: null, affectedUserId: 'u1', eventType: 'password_reset_requested', occurredAt: 't1', metadata: { token: 'SECRET', channel: 'email' } });
    expect(e.metadata).toEqual({ channel: 'email' });
  });
});
