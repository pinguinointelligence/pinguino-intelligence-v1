import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase/client';
import { getCurrentUser } from '@/services/auth';
import {
  buildLabelPreflight,
  normalizeMasterLabelData,
  type FacilityDefaults,
  type MasterLabelData,
  type ShelfLifeAuthority,
} from '@/features/master-label/masterLabel';
import {
  marketProfile,
  type MarketProfileCode,
  type MasterLabelFieldId,
} from '@/features/master-label/marketProfiles';
import type { ProductionCompletionSnapshot } from '@/features/production-workspace/productionSession';
import {
  normalizePrinterSettings,
  type LabelPrinterSettings,
} from '@/features/master-label/printerProfiles';

const PROFILE_TABLE = 'account_label_profiles';
const RUN_LABEL_TABLE = 'production_run_label_snapshots';
const COMPLETED_TABLE = 'production_completed_snapshots';
const SAVE_RUN_LABEL_RPC = 'production_save_label_snapshot_v2';
const FREEZE_COMPLETED_RPC = 'production_freeze_completed_snapshot_v1';
export const LABEL_ASSETS_BUCKET = 'label-profile-assets';
export const MAX_LABEL_LOGO_BYTES = 5 * 1024 * 1024;

export interface AccountLabelProfile {
  ownerUserId: string;
  market: MarketProfileCode;
  uiLanguage: string;
  labelLanguages: string[];
  businessName: string;
  logoPath: string | null;
  enabledOptionalFields: MasterLabelFieldId[];
  facilityDefaults: FacilityDefaults;
  shelfLifeAuthority: ShelfLifeAuthority;
  presentation: {
    format: 'rectangle' | 'round';
    widthMm: number;
    heightMm: number;
    copies: number;
    printer: LabelPrinterSettings;
  };
  updatedAt: string;
}

export interface RunLabelSnapshot {
  snapshotId: string;
  version: number;
  contentHash: string;
  runId: string;
  ownerUserId: string;
  label: MasterLabelData;
  accountProfileSnapshot: Record<string, unknown>;
  logoPath: string | null;
  createdAt: string;
}

export interface LabelRepository {
  getAccountProfile(): Promise<AccountLabelProfile | null>;
  saveAccountProfile(profile: AccountLabelProfile): Promise<AccountLabelProfile>;
  getCompletedSnapshot(runId: string): Promise<ProductionCompletionSnapshot | null>;
  freezeCompletedSnapshot(snapshot: ProductionCompletionSnapshot): Promise<void>;
  getRunLabelSnapshot(runId: string): Promise<RunLabelSnapshot | null>;
  getRunLabelSnapshotById(snapshotId: string): Promise<RunLabelSnapshot | null>;
  listRunLabelSnapshots(): Promise<RunLabelSnapshot[]>;
  saveRunLabelSnapshot(label: MasterLabelData): Promise<RunLabelSnapshot>;
  uploadLogo(file: File): Promise<string>;
  createLogoSignedUrl(path: string): Promise<string>;
}

const emptyFacility = (): FacilityDefaults => ({
  operatorName: '',
  facilityName: '',
  address: '',
  countryCode: '',
  contact: '',
  registrationIds: [],
  website: '',
  operatorRole: 'producer',
  importerName: '',
  importerAddress: '',
  importerCountryCode: '',
  distributorName: '',
  distributorAddress: '',
  distributorCountryCode: '',
});

export function defaultAccountLabelProfile(
  ownerUserId: string,
  now = new Date().toISOString(),
): AccountLabelProfile {
  return {
    ownerUserId,
    market: 'EU',
    uiLanguage: 'pl',
    labelLanguages: ['pl'],
    businessName: '',
    logoPath: null,
    enabledOptionalFields: ['logo', 'origin', 'customer_note'],
    facilityDefaults: emptyFacility(),
    shelfLifeAuthority: {
      policyId: null,
      authority: '',
      method: 'none',
      shelfLifeDays: null,
      reviewedByUser: false,
    },
    presentation: {
      format: 'rectangle',
      widthMm: 90,
      heightMm: 60,
      copies: 1,
      printer: {
        profileId: 'system_a4_letter',
        connection: 'system',
        dpi: 300,
        orientation: 'portrait',
        marginMm: 2,
        widthMm: 90,
        heightMm: 60,
        copies: 1,
      },
    },
    updatedAt: now,
  };
}

type ProfileRow = {
  owner_user_id: string;
  market: MarketProfileCode;
  ui_language: string;
  label_languages: string[];
  business_name: string;
  logo_path: string | null;
  enabled_optional_fields?: MasterLabelFieldId[] | null;
  facility_defaults: Partial<FacilityDefaults> | null;
  shelf_life_authority?: Partial<ShelfLifeAuthority> | null;
  presentation: Partial<AccountLabelProfile['presentation']> | null;
  updated_at: string;
};

type RunLabelRow = {
  snapshot_id: string;
  snapshot_version: number;
  content_hash: string;
  run_id: string;
  owner_user_id: string;
  master_label: MasterLabelData;
  account_profile_snapshot: Record<string, unknown>;
  logo_path: string | null;
  created_at: string;
};

const mapProfile = (row: ProfileRow): AccountLabelProfile => {
  const fallback = defaultAccountLabelProfile(row.owner_user_id, row.updated_at);
  const presentation = { ...fallback.presentation, ...(row.presentation ?? {}) };
  return {
    ...fallback,
    market: row.market,
    uiLanguage: row.ui_language,
    labelLanguages: row.label_languages,
    businessName: row.business_name,
    logoPath: row.logo_path,
    enabledOptionalFields: row.enabled_optional_fields ?? fallback.enabledOptionalFields,
    facilityDefaults: { ...fallback.facilityDefaults, ...(row.facility_defaults ?? {}) },
    shelfLifeAuthority: {
      ...fallback.shelfLifeAuthority,
      ...(row.shelf_life_authority ?? {}),
    },
    presentation: {
      ...presentation,
      printer: normalizePrinterSettings({
        ...fallback.presentation.printer,
        ...(row.presentation?.printer ?? {}),
        widthMm: row.presentation?.printer?.widthMm ?? presentation.widthMm,
        heightMm: row.presentation?.printer?.heightMm ?? presentation.heightMm,
        copies: row.presentation?.printer?.copies ?? presentation.copies,
      }),
    },
  };
};

const mapRunLabel = (row: RunLabelRow): RunLabelSnapshot => ({
  snapshotId: row.snapshot_id,
  version: row.snapshot_version,
  contentHash: row.content_hash,
  runId: row.run_id,
  ownerUserId: row.owner_user_id,
  label: normalizeMasterLabelData(row.master_label),
  accountProfileSnapshot: row.account_profile_snapshot,
  logoPath: row.logo_path,
  createdAt: row.created_at,
});

async function requireUserId(): Promise<string> {
  const user = await getCurrentUser();
  if (!user) throw new Error('Zaloguj się, aby zapisać profil etykiety.');
  return user.id;
}

const MIME_EXT: Readonly<Record<string, string>> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/svg+xml': 'svg',
};

function assertLogoFile(file: File): string {
  const extension = MIME_EXT[file.type];
  if (!extension) throw new Error('Logo musi być plikiem PNG, JPEG, WebP lub SVG.');
  if (file.size <= 0 || file.size > MAX_LABEL_LOGO_BYTES) {
    throw new Error('Logo musi mieć maksymalnie 5 MB.');
  }
  return extension;
}

export function supabaseLabelRepository(client: SupabaseClient): LabelRepository {
  const repository: LabelRepository = {
    async getAccountProfile() {
      const owner = await requireUserId();
      const { data, error } = await client
        .from(PROFILE_TABLE)
        .select('*')
        .eq('owner_user_id', owner)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return data ? mapProfile(data as ProfileRow) : null;
    },

    async saveAccountProfile(profile) {
      const owner = await requireUserId();
      if (profile.ownerUserId !== owner) throw new Error('Profil etykiety należy do innego konta.');
      const { data, error } = await client
        .from(PROFILE_TABLE)
        .upsert(
          {
            owner_user_id: owner,
            market: profile.market,
            ui_language: profile.uiLanguage,
            label_languages: profile.labelLanguages,
            business_name: profile.businessName,
            logo_path: profile.logoPath,
            enabled_optional_fields: profile.enabledOptionalFields,
            facility_defaults: profile.facilityDefaults,
            shelf_life_authority: profile.shelfLifeAuthority,
            presentation: profile.presentation,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'owner_user_id' },
        )
        .select('*')
        .single();
      if (error) throw new Error(error.message);
      return mapProfile(data as ProfileRow);
    },

    async getCompletedSnapshot(runId) {
      const owner = await requireUserId();
      const { data, error } = await client
        .from(COMPLETED_TABLE)
        .select('completion_snapshot')
        .eq('run_id', runId)
        .eq('owner_user_id', owner)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return (data?.completion_snapshot as ProductionCompletionSnapshot | undefined) ?? null;
    },

    async freezeCompletedSnapshot(snapshot) {
      await requireUserId();
      const { error } = await client.rpc(FREEZE_COMPLETED_RPC, {
        p_run_id: snapshot.sessionId,
        p_snapshot: snapshot,
      });
      if (error) throw new Error(error.message);
    },

    async getRunLabelSnapshot(runId) {
      const owner = await requireUserId();
      const { data, error } = await client
        .from(RUN_LABEL_TABLE)
        .select('*')
        .eq('run_id', runId)
        .eq('owner_user_id', owner)
        .order('snapshot_version', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return data ? mapRunLabel(data as RunLabelRow) : null;
    },

    async getRunLabelSnapshotById(snapshotId) {
      const owner = await requireUserId();
      const { data, error } = await client
        .from(RUN_LABEL_TABLE)
        .select('*')
        .eq('snapshot_id', snapshotId)
        .eq('owner_user_id', owner)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return data ? mapRunLabel(data as RunLabelRow) : null;
    },

    async listRunLabelSnapshots() {
      const owner = await requireUserId();
      const { data, error } = await client
        .from(RUN_LABEL_TABLE)
        .select('*')
        .eq('owner_user_id', owner)
        .order('created_at', { ascending: false });
      if (error) throw new Error(error.message);
      return (data ?? []).map((row) => mapRunLabel(row as RunLabelRow));
    },

    async saveRunLabelSnapshot(label) {
      const owner = await requireUserId();
      const preflight = buildLabelPreflight(label);
      if (!preflight.readyForSystemPrint || preflight.printReadiness === 'NOT_READY') {
        throw new Error('Przed zapisaniem etykiety potwierdź dane wymagane do druku');
      }
      if (!label.packageQuantity) {
        throw new Error('Przed zapisaniem etykiety potwierdź ilość w opakowaniu.');
      }
      const profile = marketProfile(label.market);
      const frozenLabel: MasterLabelData = {
        ...label,
        snapshotEvidence: {
          printReadiness: preflight.printReadiness,
          rendererVersion: profile.rendererVersion,
          regulatoryProfileVersion: label.marketProfileVersion,
          geometry: {
            widthMm: label.size.widthMm,
            heightMm: label.size.heightMm,
            baseFontPt: preflight.geometry.baseFontPt,
            xHeightMm: preflight.geometry.xHeightMm,
          },
          printer: structuredClone(label.printer),
          packageQuantity: structuredClone(label.packageQuantity),
        },
      };
      const { data: snapshotId, error } = await client.rpc(SAVE_RUN_LABEL_RPC, {
        p_run_id: label.sourceCompletionSessionId,
        p_master_label: frozenLabel,
      });
      if (error) throw new Error(error.message);
      if (typeof snapshotId !== 'string') {
        throw new Error('Nie otrzymano identyfikatora snapshotu etykiety');
      }
      const saved = await repository.getRunLabelSnapshotById(snapshotId);
      if (!saved || saved.ownerUserId !== owner) {
        throw new Error('Nie odczytano zapisanego snapshotu etykiety.');
      }
      return saved;
    },

    async uploadLogo(file) {
      const owner = await requireUserId();
      const extension = assertLogoFile(file);
      const id = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
      const path = `${owner}/${id}.${extension}`;
      const { error } = await client.storage
        .from(LABEL_ASSETS_BUCKET)
        .upload(path, file, { contentType: file.type, upsert: false });
      if (error) throw new Error(error.message);
      return path;
    },

    async createLogoSignedUrl(path) {
      await requireUserId();
      const { data, error } = await client.storage
        .from(LABEL_ASSETS_BUCKET)
        .createSignedUrl(path, 3600);
      if (error) throw new Error(error.message);
      if (!data?.signedUrl) throw new Error('Nie utworzono bezpiecznego podglądu logo.');
      return data.signedUrl;
    },
  };
  return repository;
}

const memoryProfiles = new Map<string, AccountLabelProfile>();
const memoryCompleted = new Map<string, ProductionCompletionSnapshot>();
const memoryLabels = new Map<string, RunLabelSnapshot>();
const memoryRunSnapshots = new Map<string, string[]>();

const memoryRunKey = (ownerUserId: string, runId: string): string => `${ownerUserId}:${runId}`;
const cloneValue = <T>(value: T): T => structuredClone(value);

export function resetInMemoryLabelRepositoryForTests(): void {
  memoryProfiles.clear();
  memoryCompleted.clear();
  memoryLabels.clear();
  memoryRunSnapshots.clear();
}

async function sha256Hex(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function inMemoryLabelRepository(ownerUserId = 'owner-review-local'): LabelRepository {
  return {
    getAccountProfile: async () => {
      const profile = memoryProfiles.get(ownerUserId);
      return profile ? cloneValue(profile) : null;
    },
    saveAccountProfile: async (profile) => {
      if (profile.ownerUserId !== ownerUserId) {
        throw new Error('Profil etykiety należy do innego konta.');
      }
      const saved = { ...cloneValue(profile), updatedAt: new Date().toISOString() };
      memoryProfiles.set(ownerUserId, saved);
      return cloneValue(saved);
    },
    getCompletedSnapshot: async (runId) => {
      const snapshot = memoryCompleted.get(memoryRunKey(ownerUserId, runId));
      return snapshot ? cloneValue(snapshot) : null;
    },
    freezeCompletedSnapshot: async (snapshot) => {
      if (snapshot.ownerUserId && snapshot.ownerUserId !== ownerUserId) {
        throw new Error('Completed Production snapshot belongs to another account.');
      }
      const key = memoryRunKey(ownerUserId, snapshot.sessionId);
      const existing = memoryCompleted.get(key);
      if (existing && JSON.stringify(existing) !== JSON.stringify(snapshot)) {
        throw new Error('Completed Production snapshot is immutable.');
      }
      memoryCompleted.set(key, cloneValue(snapshot));
    },
    getRunLabelSnapshot: async (runId) => {
      const ids = memoryRunSnapshots.get(memoryRunKey(ownerUserId, runId)) ?? [];
      const label = ids.length > 0 ? memoryLabels.get(ids[ids.length - 1]!) : null;
      return label ? cloneValue(label) : null;
    },
    getRunLabelSnapshotById: async (snapshotId) => {
      const label = memoryLabels.get(snapshotId);
      return label?.ownerUserId === ownerUserId ? cloneValue(label) : null;
    },
    listRunLabelSnapshots: async () =>
      [...memoryLabels.values()]
        .filter((label) => label.ownerUserId === ownerUserId)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .map(cloneValue),
    saveRunLabelSnapshot: async (label) => {
      const key = memoryRunKey(ownerUserId, label.sourceCompletionSessionId);
      const completed = memoryCompleted.get(key);
      if (!completed) {
        throw new Error('Wymagany jest ukończony zapis Produkcji należący do tego konta');
      }
      const ingredientMass = label.ingredients.reduce(
        (total, ingredient) => total + ingredient.actualGrams,
        0,
      );
      if (Math.abs(ingredientMass - completed.actualFinalMassG) > 0.000_001) {
        throw new Error('Składniki etykiety muszą pochodzić z ukończonej partii ACTUAL');
      }
      const preflight = buildLabelPreflight(label);
      if (!preflight.readyForSystemPrint || preflight.printReadiness === 'NOT_READY') {
        throw new Error('Przed zapisaniem etykiety potwierdź dane wymagane do druku');
      }
      if (!label.packageQuantity) {
        throw new Error('Przed zapisaniem etykiety potwierdź ilość w opakowaniu.');
      }
      const profile = memoryProfiles.get(ownerUserId) ?? defaultAccountLabelProfile(ownerUserId);
      const frozenLabel: MasterLabelData = {
        ...cloneValue(label),
        snapshotEvidence: {
          printReadiness: preflight.printReadiness,
          rendererVersion: marketProfile(label.market).rendererVersion,
          regulatoryProfileVersion: label.marketProfileVersion,
          geometry: {
            widthMm: label.size.widthMm,
            heightMm: label.size.heightMm,
            baseFontPt: preflight.geometry.baseFontPt,
            xHeightMm: preflight.geometry.xHeightMm,
          },
          printer: cloneValue(label.printer),
          packageQuantity: cloneValue(label.packageQuantity),
        },
      };
      const contentHash = await sha256Hex(frozenLabel);
      const ids = memoryRunSnapshots.get(key) ?? [];
      const duplicate = ids
        .map((snapshotId) => memoryLabels.get(snapshotId))
        .find((candidate) => candidate?.contentHash === contentHash);
      if (duplicate) return cloneValue(duplicate);
      const snapshotId = globalThis.crypto.randomUUID();
      const saved: RunLabelSnapshot = {
        snapshotId,
        version: ids.length + 1,
        contentHash,
        runId: label.sourceCompletionSessionId,
        ownerUserId,
        label: frozenLabel,
        accountProfileSnapshot: {
          market: label.market,
          uiLanguage: label.uiLanguage,
          labelLanguages: cloneValue(label.labelLanguages),
          businessName: label.businessName,
          enabledOptionalFields: cloneValue(label.enabledOptionalFields),
          facilityDefaults: cloneValue(label.operator),
          presentation: {
            format: label.format,
            widthMm: label.size.widthMm,
            heightMm: label.size.heightMm,
            copies: label.copies,
          },
          updatedAt: profile.updatedAt,
        },
        logoPath: label.logoPath,
        createdAt: new Date().toISOString(),
      };
      memoryLabels.set(snapshotId, saved);
      memoryRunSnapshots.set(key, [...ids, snapshotId]);
      return cloneValue(saved);
    },
    uploadLogo: async () => `${ownerUserId}/local-logo.png`,
    createLogoSignedUrl: async (path) => path,
  };
}

const memoryRepository = inMemoryLabelRepository();

export function resolveLabelRepository(): LabelRepository {
  return supabase ? supabaseLabelRepository(supabase) : memoryRepository;
}
