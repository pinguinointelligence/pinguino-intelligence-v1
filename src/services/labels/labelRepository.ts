import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase/client';
import { getCurrentUser } from '@/services/auth';
import type { FacilityDefaults, MasterLabelData } from '@/features/master-label/masterLabel';
import type { MarketProfileCode, MasterLabelFieldId } from '@/features/master-label/marketProfiles';
import type { ProductionCompletionSnapshot } from '@/features/production-workspace/productionSession';

const PROFILE_TABLE = 'account_label_profiles';
const RUN_LABEL_TABLE = 'production_run_label_snapshots';
const COMPLETED_TABLE = 'production_completed_snapshots';
const SAVE_RUN_LABEL_RPC = 'production_save_label_snapshot_v1';
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
  presentation: {
    format: 'rectangle' | 'round';
    widthMm: number;
    heightMm: number;
    copies: number;
  };
  updatedAt: string;
}

export interface RunLabelSnapshot {
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
    presentation: { format: 'rectangle', widthMm: 90, heightMm: 60, copies: 1 },
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
  presentation: Partial<AccountLabelProfile['presentation']> | null;
  updated_at: string;
};

type RunLabelRow = {
  run_id: string;
  owner_user_id: string;
  master_label: MasterLabelData;
  account_profile_snapshot: Record<string, unknown>;
  logo_path: string | null;
  created_at: string;
};

const mapProfile = (row: ProfileRow): AccountLabelProfile => {
  const fallback = defaultAccountLabelProfile(row.owner_user_id, row.updated_at);
  return {
    ...fallback,
    market: row.market,
    uiLanguage: row.ui_language,
    labelLanguages: row.label_languages,
    businessName: row.business_name,
    logoPath: row.logo_path,
    enabledOptionalFields: row.enabled_optional_fields ?? fallback.enabledOptionalFields,
    facilityDefaults: { ...fallback.facilityDefaults, ...(row.facility_defaults ?? {}) },
    presentation: { ...fallback.presentation, ...(row.presentation ?? {}) },
  };
};

const mapRunLabel = (row: RunLabelRow): RunLabelSnapshot => ({
  runId: row.run_id,
  ownerUserId: row.owner_user_id,
  label: row.master_label,
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
      const { error } = await client.rpc(SAVE_RUN_LABEL_RPC, {
        p_run_id: label.sourceCompletionSessionId,
        p_master_label: label,
      });
      if (error) throw new Error(error.message);
      const saved = await repository.getRunLabelSnapshot(label.sourceCompletionSessionId);
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

const memoryRunKey = (ownerUserId: string, runId: string): string => `${ownerUserId}:${runId}`;
const cloneValue = <T>(value: T): T => structuredClone(value);

export function resetInMemoryLabelRepositoryForTests(): void {
  memoryProfiles.clear();
  memoryCompleted.clear();
  memoryLabels.clear();
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
      const label = memoryLabels.get(memoryRunKey(ownerUserId, runId));
      return label ? cloneValue(label) : null;
    },
    listRunLabelSnapshots: async () =>
      [...memoryLabels.values()]
        .filter((label) => label.ownerUserId === ownerUserId)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .map(cloneValue),
    saveRunLabelSnapshot: async (label) => {
      const key = memoryRunKey(ownerUserId, label.sourceCompletionSessionId);
      if (!memoryCompleted.has(key)) {
        throw new Error('Owned completed Production snapshot required.');
      }
      const existing = memoryLabels.get(key);
      if (existing && JSON.stringify(existing.label) !== JSON.stringify(label)) {
        throw new Error('Run Label Snapshot is immutable.');
      }
      const profile = memoryProfiles.get(ownerUserId) ?? defaultAccountLabelProfile(ownerUserId);
      const saved: RunLabelSnapshot = existing ?? {
        runId: label.sourceCompletionSessionId,
        ownerUserId,
        label: cloneValue(label),
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
      memoryLabels.set(key, saved);
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
