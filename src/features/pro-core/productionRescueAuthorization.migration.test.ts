/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const REPO = resolve(import.meta.dirname, '..', '..', '..');
const MIGRATION = '20260819024500_production_rescue_authorization.sql';
const SQL = readFileSync(join(REPO, 'supabase', 'migrations', MIGRATION), 'utf8');
const CODE = SQL.replace(/--.*$/gm, '');

describe('trusted Production Rescue authorization migration', () => {
  it('is forward-only and keeps proofs in a non-API private schema', () => {
    expect(MIGRATION > '20260819023000_production_transactional_rpc.sql').toBe(true);
    expect(CODE).toContain('create schema if not exists private');
    expect(CODE).toContain('private.production_rescue_authorizations');
    expect(CODE).toContain(
      'alter table private.production_rescue_authorizations enable row level security',
    );
    expect(CODE).toMatch(
      /revoke all on private\.production_rescue_authorizations\s+from public, anon, authenticated, service_role/,
    );
    expect(CODE).not.toMatch(/grant [^;]+ on private\.production_rescue_authorizations/i);
  });

  it('binds personal account, exact source, PB, Engine/config, candidate, option and expiry', () => {
    for (const field of [
      'owner_user_id',
      'account_id',
      'run_id',
      'recipe_version_id',
      'source_actual_revision',
      'source_rescue_revision',
      'source_fingerprint',
      'database_source_fingerprint',
      'product_behavior_fingerprint',
      'database_product_behavior_fingerprint',
      'engine_version',
      'config_version',
      'practical_recipe_version',
      'rescue_model_version',
      'engine_bundle_sha256',
      'source_closure_sha256',
      'bundler_version',
      'stable_option_id',
      'safe_metadata',
      'candidate_fingerprint',
      'request_fingerprint',
      'database_proof_fingerprint',
      'expires_at',
    ]) {
      expect(CODE).toContain(field);
    }
    expect(CODE).toContain('account_id = owner_user_id');
    expect(CODE).toContain("source_fingerprint ~ '^[0-9a-f]{64}$'");
    expect(CODE).toContain("candidate_fingerprint ~ '^[0-9a-f]{64}$'");
    expect(CODE).toContain('production_rescue_source_fingerprint_v1');
    expect(CODE).toContain('production_rescue_product_behavior_fingerprint_v1');
    expect(CODE).toContain('production_rescue_database_proof_fingerprint_v1');
    expect(CODE).toContain("'plannedItems'");
    expect(CODE).toContain("'actual'");
    expect(CODE).toContain("'rescueRecipeInput'");
  });

  it('allows only the trusted service to create a short-lived proof', () => {
    const create = CODE.slice(
      CODE.indexOf('function public.production_create_rescue_authorization_v1'),
      CODE.indexOf('function public.production_consume_rescue_authorization_v1'),
    );
    expect(create).toContain('security definer');
    expect(create).toContain('set search_path = pg_catalog, private, public, extensions');
    expect(create).toContain("set statement_timeout = '15s'");
    expect(create).toContain("p_deadline_at > v_at + interval '15 seconds'");
    expect(create).toContain("auth.jwt()->>'role'");
    expect(create).toContain("<> 'service_role'");
    expect(create).toContain('p_owner_user_id <> p_account_id');
    expect(create).toContain("entitlement.scope = 'pro'");
    expect(create).toContain("entitlement.status = 'active'");
    expect(create).toContain('recipe_version_id = p_recipe_version_id');
    expect(create).toContain("status = 'in_progress'");
    expect(create).toContain('v_run.actual_revision is distinct from p_expected_actual_revision');
    expect(create).toContain('v_run.rescue_revision is distinct from p_expected_rescue_revision');
    expect(create).toContain('v_version.engine_version is distinct from p_engine_version');
    expect(create).toContain('v_version.config_version is distinct from p_config_version');
    expect(create).toContain('p_practical_recipe_version');
    expect(create).toContain('p_rescue_model_version');
    expect(create).toContain('p_engine_bundle_sha256');
    expect(create).toContain('p_source_closure_sha256');
    expect(create).toContain('p_bundler_version');
    expect(create).toContain('p_request_fingerprint');
    expect(create).toContain('p_candidate_fingerprint');
    expect(create).toContain('assert_recipe_behavior_authority_v1');
    expect(create).toContain("v_at + interval '5 minutes'");
    expect(create).toContain("set_config('request.jwt.claims'");
    expect(create.indexOf('assert_recipe_behavior_authority_v1')).toBeLessThan(
      create.indexOf('insert into private.production_rescue_authorizations'),
    );
    const afterProductBehavior = create.slice(
      create.indexOf('assert_recipe_behavior_authority_v1'),
      create.indexOf('insert into private.production_rescue_authorizations'),
    );
    expect(afterProductBehavior).toContain('clock_timestamp() >= p_deadline_at');
    expect(afterProductBehavior).toContain(
      'Production Rescue ProductBehavior authorization deadline exceeded',
    );
    const insertedProof = create.slice(
      create.indexOf('returning id into v_id'),
      create.indexOf('select * into v_authorization', create.indexOf('returning id into v_id')),
    );
    expect(insertedProof).toContain('clock_timestamp() >= p_deadline_at');
    expect(CODE).toMatch(
      /grant execute on function public\.production_create_rescue_authorization_v1\([\s\S]+?\) to service_role/,
    );
    expect(CODE).not.toMatch(
      /grant execute on function public\.production_create_rescue_authorization_v1\([\s\S]+?\) to authenticated/,
    );
  });

  it('returns the same persisted trusted preview for an exact idempotent retry', () => {
    const create = CODE.slice(
      CODE.indexOf('function public.production_create_rescue_authorization_v1'),
      CODE.indexOf('function public.production_consume_rescue_authorization_v1'),
    );
    expect(CODE).toContain('unique (account_id, idempotency_key)');
    expect(create).toContain('on conflict (account_id, idempotency_key) do nothing');
    expect(create).toContain('production_rescue_authorization_response_v1');
    expect(create).toContain('Production Rescue idempotency key payload mismatch');
    for (const key of [
      'authorizationId',
      'candidateFingerprint',
      'authorizedAt',
      'expiresAt',
      'stableOptionId',
      'runId',
      'expectedActualRevision',
      'expectedRescueRevision',
      'recipeInput',
      'productComposition',
      'safeMetadata',
      'engineVersion',
      'configVersion',
    ]) {
      expect(CODE).toContain(`'${key}'`);
    }
    expect(create.indexOf('where authorization.account_id = p_account_id')).toBeLessThan(
      create.indexOf('select * into v_run from public.production_runs'),
    );
    const earlyRetry = create.slice(
      create.indexOf('where authorization.account_id = p_account_id'),
      create.indexOf('if p_expires_at is null'),
    );
    expect(earlyRetry).not.toContain('v_authorization.expires_at is distinct from p_expires_at');
    expect(earlyRetry).toContain(
      'v_authorization.request_fingerprint is distinct from p_request_fingerprint',
    );
  });

  it('atomically consumes once, permits exact replay and rejects stale authority', () => {
    const consume = CODE.slice(
      CODE.indexOf('function public.production_consume_rescue_authorization_v1'),
    );
    expect(consume).toContain('assert_production_pro_entitlement_v1');
    expect(consume).toContain('for update');
    expect(consume).toContain('v_authorization.owner_user_id is distinct from v_uid');
    expect(consume).toContain('v_authorization.account_id is distinct from v_uid');
    expect(consume).toContain('v_authorization.expires_at <= v_at');
    expect(consume).toContain(
      'v_authorization.source_actual_revision is distinct from p_expected_actual_revision',
    );
    expect(consume).toContain(
      'v_authorization.source_rescue_revision is distinct from p_expected_rescue_revision',
    );
    expect(consume).toContain(
      'v_run.actual_revision is distinct from v_authorization.source_actual_revision',
    );
    expect(consume).toContain(
      'v_run.rescue_revision is distinct from v_authorization.source_rescue_revision',
    );
    expect(consume).toContain('Production Rescue ProductBehavior authority is stale');
    expect(consume).toContain('Production Rescue authorization Engine/config is stale');
    expect(consume).toContain('Production Rescue database proof is invalid');
    expect(consume).toContain('production_apply_rescue_v1');
    expect(consume).toContain('v_event_id := gen_random_uuid()');
    expect(consume).toContain('consumed_at = v_at');
    expect(consume).toContain('consumed_event_id = v_event_id');
    expect(consume).toContain('consumed_idempotency_key = p_idempotency_key');
    expect(consume).toContain("event.event_type = 'rescue_applied'");
    expect(consume).toContain('Production Rescue authorization was already consumed');
    expect(CODE).toContain('uuid, integer, integer, text');
    expect(consume).not.toContain('p_event_id');
  });

  it('retires direct authenticated Rescue writes without touching Engine or Mapper data', () => {
    expect(CODE).toMatch(
      /revoke all on function public\.production_apply_rescue_v1\([\s\S]{0,160}\) from public, anon, authenticated, service_role/,
    );
    expect(CODE).not.toMatch(/(?:insert into|update|delete from)\s+public\.mapper_basement/i);
    expect(CODE).not.toMatch(
      /(?:insert into|update|delete from)\s+public\.mapper_process_metadata/i,
    );
  });
});

type FakeRun = {
  runId: string;
  owner: string;
  versionId: string;
  actualRevision: number;
  rescueRevision: number;
  engineVersion: string;
  configVersion: string;
  sourceNonce: string;
  rescue: unknown;
};

type FakeCreate = {
  role: string;
  owner: string;
  account: string;
  runId: string;
  versionId: string;
  sourceFingerprint: string;
  actualRevision: number;
  rescueRevision: number;
  candidateFingerprint: string;
  productBehaviorFingerprint: string;
  engineVersion: string;
  configVersion: string;
  practicalRecipeVersion: string;
  rescueModelVersion: string;
  engineBundleSha256: string;
  sourceClosureSha256: string;
  bundlerVersion: string;
  requestFingerprint: string;
  stableOptionId: 'keep_original_batch' | 'enlarge_batch' | 'leave_as_is';
  candidate: unknown;
  safeMetadata: Record<string, unknown>;
  expiresAt: number;
  idempotencyKey: string;
};

class FakeRescueAuthorizationDb {
  now = 1_000;
  pbFingerprint = 'pb-1';
  pro = new Set(['owner-1']);
  run: FakeRun = {
    runId: 'run-1',
    owner: 'owner-1',
    versionId: 'version-1',
    actualRevision: 2,
    rescueRevision: 3,
    engineVersion: 'engine-1',
    configVersion: 'config-1',
    sourceNonce: 'source-1',
    rescue: null,
  };
  proofs = new Map<
    string,
    FakeCreate & {
      authorizationId: string;
      candidateFingerprint: string;
      databaseSourceFingerprint: string;
      databasePbFingerprint: string;
      databaseProofFingerprint: string;
      consumedBy: string | null;
      consumedEventId: string | null;
      consumedIdempotencyKey: string | null;
    }
  >();
  events: string[] = [];

  private sourceFingerprint() {
    const r = this.run;
    return `${r.actualRevision}:${r.rescueRevision}:${r.sourceNonce}`;
  }

  private semanticInput(input: FakeCreate) {
    return {
      role: input.role,
      owner: input.owner,
      account: input.account,
      runId: input.runId,
      versionId: input.versionId,
      sourceFingerprint: input.sourceFingerprint,
      actualRevision: input.actualRevision,
      rescueRevision: input.rescueRevision,
      candidateFingerprint: input.candidateFingerprint,
      productBehaviorFingerprint: input.productBehaviorFingerprint,
      engineVersion: input.engineVersion,
      configVersion: input.configVersion,
      practicalRecipeVersion: input.practicalRecipeVersion,
      rescueModelVersion: input.rescueModelVersion,
      engineBundleSha256: input.engineBundleSha256,
      sourceClosureSha256: input.sourceClosureSha256,
      bundlerVersion: input.bundlerVersion,
      requestFingerprint: input.requestFingerprint,
      stableOptionId: input.stableOptionId,
      candidate: input.candidate,
      safeMetadata: input.safeMetadata,
      idempotencyKey: input.idempotencyKey,
    };
  }

  private databaseProof(input: FakeCreate, databaseSource: string, databasePb: string) {
    return JSON.stringify({ ...this.semanticInput(input), databaseSource, databasePb });
  }

  create(input: FakeCreate) {
    if (input.role !== 'service_role') throw new Error('trusted service required');
    if (input.owner !== input.account) throw new Error('account mismatch');
    const key = `${input.account}:${input.idempotencyKey}`;
    const existing = this.proofs.get(key);
    if (existing) {
      const storedInput: FakeCreate = {
        role: existing.role,
        owner: existing.owner,
        account: existing.account,
        runId: existing.runId,
        versionId: existing.versionId,
        sourceFingerprint: existing.sourceFingerprint,
        actualRevision: existing.actualRevision,
        rescueRevision: existing.rescueRevision,
        candidateFingerprint: existing.candidateFingerprint,
        productBehaviorFingerprint: existing.productBehaviorFingerprint,
        engineVersion: existing.engineVersion,
        configVersion: existing.configVersion,
        practicalRecipeVersion: existing.practicalRecipeVersion,
        rescueModelVersion: existing.rescueModelVersion,
        engineBundleSha256: existing.engineBundleSha256,
        sourceClosureSha256: existing.sourceClosureSha256,
        bundlerVersion: existing.bundlerVersion,
        requestFingerprint: existing.requestFingerprint,
        stableOptionId: existing.stableOptionId,
        candidate: existing.candidate,
        safeMetadata: existing.safeMetadata,
        expiresAt: existing.expiresAt,
        idempotencyKey: existing.idempotencyKey,
      };
      if (
        JSON.stringify(this.semanticInput(storedInput)) !==
        JSON.stringify(this.semanticInput(input))
      ) {
        throw new Error('idempotency payload mismatch');
      }
      return existing;
    }
    if (!this.pro.has(input.owner)) throw new Error('Pro required');
    if (input.expiresAt <= this.now || input.expiresAt > this.now + 300) {
      throw new Error('invalid expiry');
    }
    const run = this.run;
    if (
      run.owner !== input.owner ||
      run.runId !== input.runId ||
      run.versionId !== input.versionId
    ) {
      throw new Error('source mismatch');
    }
    if (
      run.actualRevision !== input.actualRevision ||
      run.rescueRevision !== input.rescueRevision
    ) {
      throw new Error('revision conflict');
    }
    if (run.engineVersion !== input.engineVersion || run.configVersion !== input.configVersion) {
      throw new Error('Engine/config mismatch');
    }
    const databaseSourceFingerprint = this.sourceFingerprint();
    const databasePbFingerprint = this.pbFingerprint;
    const proof = {
      ...structuredClone(input),
      authorizationId: `auth-${this.proofs.size + 1}`,
      databaseSourceFingerprint,
      databasePbFingerprint,
      databaseProofFingerprint: this.databaseProof(
        input,
        databaseSourceFingerprint,
        databasePbFingerprint,
      ),
      consumedBy: null,
      consumedEventId: null,
      consumedIdempotencyKey: null,
    };
    this.proofs.set(key, proof);
    return proof;
  }

  consume(
    user: string,
    authorizationId: string,
    expectedActualRevision: number,
    expectedRescueRevision: number,
    idempotencyKey: string,
  ) {
    if (!this.pro.has(user)) throw new Error('Pro required');
    const proof = [...this.proofs.values()].find((row) => row.authorizationId === authorizationId);
    if (!proof || proof.owner !== user || proof.account !== user) throw new Error('owner required');
    if (
      proof.actualRevision !== expectedActualRevision ||
      proof.rescueRevision !== expectedRescueRevision
    )
      throw new Error('caller basis mismatch');
    if (proof.consumedEventId !== null) {
      if (
        proof.consumedBy === user &&
        proof.consumedIdempotencyKey === idempotencyKey &&
        this.events.includes(proof.consumedEventId)
      ) {
        return proof.runId;
      }
      throw new Error('already consumed');
    }
    if (proof.expiresAt <= this.now) throw new Error('expired');
    if (
      this.run.actualRevision !== proof.actualRevision ||
      this.run.rescueRevision !== proof.rescueRevision ||
      this.sourceFingerprint() !== proof.databaseSourceFingerprint
    )
      throw new Error('stale source');
    if (
      this.run.engineVersion !== proof.engineVersion ||
      this.run.configVersion !== proof.configVersion
    )
      throw new Error('stale Engine/config');
    if (this.pbFingerprint !== proof.databasePbFingerprint) throw new Error('stale PB');
    if (
      this.databaseProof(proof, proof.databaseSourceFingerprint, proof.databasePbFingerprint) !==
      proof.databaseProofFingerprint
    )
      throw new Error('invalid database proof');
    this.run.rescue = structuredClone(proof.candidate);
    this.run.rescueRevision += 1;
    const eventId = `event-${this.events.length + 1}`;
    this.events.push(eventId);
    proof.consumedBy = user;
    proof.consumedEventId = eventId;
    proof.consumedIdempotencyKey = idempotencyKey;
    return proof.runId;
  }
}

const request = (): FakeCreate => ({
  role: 'service_role',
  owner: 'owner-1',
  account: 'owner-1',
  runId: 'run-1',
  versionId: 'version-1',
  sourceFingerprint: 'a'.repeat(64),
  actualRevision: 2,
  rescueRevision: 3,
  candidateFingerprint: 'b'.repeat(64),
  productBehaviorFingerprint: 'c'.repeat(64),
  engineVersion: 'engine-1',
  configVersion: 'config-1',
  practicalRecipeVersion: 'practical-1',
  rescueModelVersion: 'rescue-1',
  engineBundleSha256: 'd'.repeat(64),
  sourceClosureSha256: 'e'.repeat(64),
  bundlerVersion: 'bundler-1',
  requestFingerprint: 'f'.repeat(64),
  stableOptionId: 'enlarge_batch',
  candidate: { target_batch_grams: 1_200, items: [{ id: 'milk', planned_grams: 700 }] },
  safeMetadata: { finalMassG: 1_200, scoreDisplay: '100' },
  expiresAt: 1_120,
  idempotencyKey: 'request-1',
});

describe('fake trusted Rescue authorization boundary', () => {
  it('creates once and returns the same stored preview on retry, even after consumption', () => {
    const db = new FakeRescueAuthorizationDb();
    const first = db.create(request());
    expect(first.stableOptionId).toBe('enlarge_batch');
    expect(first.safeMetadata).toEqual({ finalMassG: 1_200, scoreDisplay: '100' });
    expect(db.consume('owner-1', first.authorizationId, 2, 3, 'consume-1')).toBe('run-1');
    expect(db.create({ ...request(), expiresAt: request().expiresAt + 1 })).toBe(first);
    expect(() => db.create({ ...request(), safeMetadata: { finalMassG: 1_201 } })).toThrow(
      'idempotency payload mismatch',
    );
    expect(() => db.create({ ...request(), requestFingerprint: '0'.repeat(64) })).toThrow(
      'idempotency payload mismatch',
    );
  });

  it('consumes exactly once and makes an exact replay idempotent', () => {
    const db = new FakeRescueAuthorizationDb();
    const proof = db.create(request());
    expect(db.consume('owner-1', proof.authorizationId, 2, 3, 'consume-1')).toBe('run-1');
    expect(db.run.rescueRevision).toBe(4);
    expect(db.events).toEqual(['event-1']);
    expect(db.consume('owner-1', proof.authorizationId, 2, 3, 'consume-1')).toBe('run-1');
    expect(db.run.rescueRevision).toBe(4);
    expect(db.events).toEqual(['event-1']);
    expect(() => db.consume('owner-1', proof.authorizationId, 2, 3, 'consume-2')).toThrow(
      'already consumed',
    );
    expect(() => db.consume('owner-1', proof.authorizationId, 3, 3, 'consume-1')).toThrow(
      'caller basis mismatch',
    );
  });

  it('fails closed for client creation, cross-owner use, expiry and stale authority', () => {
    expect(() =>
      new FakeRescueAuthorizationDb().create({ ...request(), role: 'authenticated' }),
    ).toThrow('trusted service required');

    const crossOwner = new FakeRescueAuthorizationDb();
    crossOwner.pro.add('owner-2');
    const crossProof = crossOwner.create(request());
    expect(() =>
      crossOwner.consume('owner-2', crossProof.authorizationId, 2, 3, 'consume-1'),
    ).toThrow('owner required');

    const expired = new FakeRescueAuthorizationDb();
    const expiredProof = expired.create(request());
    expired.now = expiredProof.expiresAt;
    expect(() =>
      expired.consume('owner-1', expiredProof.authorizationId, 2, 3, 'consume-1'),
    ).toThrow('expired');

    const revision = new FakeRescueAuthorizationDb();
    const revisionProof = revision.create(request());
    revision.run.actualRevision += 1;
    expect(() =>
      revision.consume('owner-1', revisionProof.authorizationId, 2, 3, 'consume-1'),
    ).toThrow('stale source');

    const silentSource = new FakeRescueAuthorizationDb();
    const sourceProof = silentSource.create(request());
    silentSource.run.sourceNonce = 'silently-changed';
    expect(() =>
      silentSource.consume('owner-1', sourceProof.authorizationId, 2, 3, 'consume-1'),
    ).toThrow('stale source');

    const pb = new FakeRescueAuthorizationDb();
    const pbProof = pb.create(request());
    pb.pbFingerprint = 'pb-2';
    expect(() => pb.consume('owner-1', pbProof.authorizationId, 2, 3, 'consume-1')).toThrow(
      'stale PB',
    );

    const engine = new FakeRescueAuthorizationDb();
    const engineProof = engine.create(request());
    engine.run.configVersion = 'config-2';
    expect(() => engine.consume('owner-1', engineProof.authorizationId, 2, 3, 'consume-1')).toThrow(
      'stale Engine/config',
    );

    const tampered = new FakeRescueAuthorizationDb();
    const tamperedProof = tampered.create(request());
    tamperedProof.requestFingerprint = '0'.repeat(64);
    expect(() =>
      tampered.consume('owner-1', tamperedProof.authorizationId, 2, 3, 'consume-1'),
    ).toThrow('invalid database proof');
  });
});
