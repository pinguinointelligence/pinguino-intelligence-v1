/**
 * Scan Lab baseline — on-device corpus store (IndexedDB, raw API).
 *
 * One database, four stores:
 *   runs    key `sessionId` (the "runId" everywhere in this API)   value SessionRecord
 *   scenes  key [runId, sceneId]                                    value SceneRow
 *   events  key autoIncrement `id`, index byScene [runId, sceneId]  value EventRow (one FrameEvidence)
 *   frames  key [runId, sceneId, frameIndex]                        value FrameRow (Blob + FrameMeta)
 *
 * Every request is wrapped in a promise; every failure surfaces as a CorpusError with a Polish,
 * tester-facing `messagePl`. Nothing here records a device identifier — camera labels only.
 */
import type { FrameEvidence, SceneRunSummary, SessionRecord } from '../types';

export const CORPUS_DB_NAME = 'scan-lab-baseline';
export const CORPUS_DB_VERSION = 1;

const STORE_RUNS = 'runs';
const STORE_SCENES = 'scenes';
const STORE_EVENTS = 'events';
const STORE_FRAMES = 'frames';
const INDEX_EVENTS_BY_SCENE = 'byScene';
const ALL_STORES = [STORE_RUNS, STORE_SCENES, STORE_EVENTS, STORE_FRAMES] as const;

// ---------------------------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------------------------

export type CorpusErrorCode = 'quota' | 'blocked' | 'unknown';

const MESSAGE_PL: Record<CorpusErrorCode, string> = {
  quota:
    'Brak miejsca w pamięci telefonu na kolejne dane. Wyeksportuj i usuń poprzednie sesje, potem spróbuj ponownie.',
  blocked:
    'Przeglądarka blokuje zapis lokalny (tryb prywatny lub inna otwarta karta aplikacji). Zamknij pozostałe karty i spróbuj ponownie.',
  unknown: 'Nie udało się zapisać danych sesji. Spróbuj ponownie.',
};

/** Error names that mean "the browser will not let us use IndexedDB right now". */
const BLOCKED_ERROR_NAMES = new Set(['InvalidStateError', 'SecurityError', 'VersionError']);

export class CorpusError extends Error {
  readonly code: CorpusErrorCode;
  /** Short Polish sentence safe to show to the tester. */
  readonly messagePl: string;

  constructor(
    code: CorpusErrorCode,
    message: string,
    options: { cause?: unknown; messagePl?: string } = {},
  ) {
    super(message, { cause: options.cause });
    this.name = 'CorpusError';
    this.code = code;
    this.messagePl = options.messagePl ?? MESSAGE_PL[code];
  }
}

function errorName(error: unknown): string {
  if (error && typeof error === 'object' && 'name' in error) {
    const name = (error as { name: unknown }).name;
    return typeof name === 'string' ? name : '';
  }
  return '';
}

/** Maps any IndexedDB / DOMException failure to a typed CorpusError (idempotent for CorpusError). */
export function toCorpusError(error: unknown, context: string): CorpusError {
  if (error instanceof CorpusError) return error;
  const name = errorName(error);
  const detail = error instanceof Error ? error.message : String(error ?? 'unknown error');
  if (name === 'QuotaExceededError') {
    return new CorpusError('quota', `${context}: quota exceeded (${detail})`, { cause: error });
  }
  if (BLOCKED_ERROR_NAMES.has(name)) {
    return new CorpusError('blocked', `${context}: ${name} (${detail})`, { cause: error });
  }
  return new CorpusError('unknown', `${context}: ${name || 'Error'} (${detail})`, {
    cause: error,
  });
}

// ---------------------------------------------------------------------------------------------
// Row shapes (frames / scenes / events)
// ---------------------------------------------------------------------------------------------

export type FrameTag =
  | 'interval'
  | 'first_candidate'
  | 'first_decode'
  | 'best_quality'
  | 'wrong_value'
  | 'manual';

export interface FrameMeta {
  /** performance.now() at capture, ms (same clock as FrameEvidence.tCapture). */
  tCapture: number;
  width: number;
  height: number;
  /** Encoded MIME, e.g. 'image/jpeg'. */
  mime: string;
  tag: FrameTag;
  /** Encoded size; set by putFrame from blob.size. */
  bytes: number;
  quality?: FrameEvidence['quality'];
  note?: string;
}

export type FrameMetaInput = Omit<FrameMeta, 'bytes'>;

/** Frame listing row — meta only, the Blob stays in the store. */
export interface FrameEntry {
  runId: string;
  sceneId: string;
  frameIndex: number;
  meta: FrameMeta;
}

interface SceneRow {
  runId: string;
  sceneId: string;
  result: SceneRunSummary;
  updatedAt: string;
}

interface EventRow {
  id?: number;
  runId: string;
  sceneId: string;
  event: FrameEvidence;
}

interface FrameRow {
  runId: string;
  sceneId: string;
  frameIndex: number;
  blob: Blob;
  meta: FrameMeta;
}

/**
 * Synchronous per-event callback for iterateEvents. It MUST NOT await: IndexedDB auto-commits a
 * transaction as soon as control returns to the event loop with no pending request, so an async
 * callback would end the cursor after the first row. Return `false` to stop early.
 */
export type EventVisitor = (event: FrameEvidence, ordinal: number) => void | boolean;

/** Read-side contract used by the export (lets tests substitute an in-memory corpus). */
export interface CorpusReader {
  getRun(runId: string): Promise<SessionRecord | undefined>;
  getSceneResults(runId: string): Promise<SceneRunSummary[]>;
  iterateEvents(runId: string, sceneId: string, visit: EventVisitor): Promise<number>;
  listFrames(runId: string, sceneId: string): Promise<FrameEntry[]>;
  getFrameBlob(runId: string, sceneId: string, frameIndex: number): Promise<Blob | undefined>;
}

// ---------------------------------------------------------------------------------------------
// Promise helpers
// ---------------------------------------------------------------------------------------------

function request<T>(req: IDBRequest<T>, context: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(toCorpusError(req.error, context));
  });
}

function done(tx: IDBTransaction, context: string): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(toCorpusError(tx.error, context));
    tx.onabort = () => reject(toCorpusError(tx.error ?? new Error('transaction aborted'), context));
  });
}

/** [runId] .. [runId, []] — an empty array sorts after every string and number, so this spans the run. */
function runRange(runId: string): IDBKeyRange {
  return IDBKeyRange.bound([runId], [runId, []]);
}

/** [runId, sceneId] .. [runId, sceneId, []] — every frameIndex of one scene. */
function sceneRange(runId: string, sceneId: string): IDBKeyRange {
  return IDBKeyRange.bound([runId, sceneId], [runId, sceneId, []]);
}

function sceneKey(runId: string, sceneId: string): IDBKeyRange {
  return IDBKeyRange.only([runId, sceneId]);
}

/** Deletes every primary key the index range points at, streaming through a key cursor. */
function deleteViaIndex(store: IDBObjectStore, index: IDBIndex, range: IDBKeyRange): void {
  const req = index.openKeyCursor(range);
  req.onsuccess = () => {
    const cursor = req.result;
    if (!cursor) return;
    store.delete(cursor.primaryKey);
    cursor.continue();
  };
}

function createSchema(db: IDBDatabase): void {
  const names = db.objectStoreNames;
  if (!names.contains(STORE_RUNS)) db.createObjectStore(STORE_RUNS, { keyPath: 'sessionId' });
  if (!names.contains(STORE_SCENES)) {
    db.createObjectStore(STORE_SCENES, { keyPath: ['runId', 'sceneId'] });
  }
  if (!names.contains(STORE_EVENTS)) {
    const events = db.createObjectStore(STORE_EVENTS, { keyPath: 'id', autoIncrement: true });
    events.createIndex(INDEX_EVENTS_BY_SCENE, ['runId', 'sceneId'], { unique: false });
  }
  if (!names.contains(STORE_FRAMES)) {
    db.createObjectStore(STORE_FRAMES, { keyPath: ['runId', 'sceneId', 'frameIndex'] });
  }
}

// ---------------------------------------------------------------------------------------------
// Open
// ---------------------------------------------------------------------------------------------

export interface OpenCorpusDbOptions {
  /** Defaults to the global indexedDB; injectable for tests. */
  factory?: IDBFactory;
  /** Defaults to CORPUS_DB_NAME. */
  name?: string;
}

export function openCorpusDb(options: OpenCorpusDbOptions = {}): Promise<CorpusDb> {
  const factory =
    options.factory ?? (typeof indexedDB === 'undefined' ? undefined : (indexedDB as IDBFactory));
  if (!factory) {
    return Promise.reject(
      new CorpusError('blocked', 'open: IndexedDB is not available in this context', {
        messagePl:
          'Ta przeglądarka nie udostępnia pamięci lokalnej (tryb prywatny?). Otwórz stronę w zwykłej karcie Safari lub Chrome.',
      }),
    );
  }
  const name = options.name ?? CORPUS_DB_NAME;
  return new Promise<CorpusDb>((resolve, reject) => {
    let settled = false;
    const fail = (error: CorpusError) => {
      if (settled) return;
      settled = true;
      reject(error);
    };
    let req: IDBOpenDBRequest;
    try {
      req = factory.open(name, CORPUS_DB_VERSION);
    } catch (error) {
      fail(toCorpusError(error, 'open'));
      return;
    }
    req.onupgradeneeded = () => createSchema(req.result);
    req.onblocked = () =>
      fail(new CorpusError('blocked', `open: ${name} is held open by another tab or version`));
    req.onerror = () => fail(toCorpusError(req.error, 'open'));
    req.onsuccess = () => {
      const db = req.result;
      if (settled) {
        // A late success after onblocked already rejected: do not leak the connection.
        db.close();
        return;
      }
      const missing = ALL_STORES.filter((store) => !db.objectStoreNames.contains(store));
      if (missing.length > 0) {
        db.close();
        fail(
          new CorpusError(
            'blocked',
            `open: ${name} v${db.version} lacks stores [${missing.join(', ')}] — another schema owns this database name`,
            {
              messagePl:
                'Lokalna baza ma inny układ niż oczekiwany. Wyczyść dane tej strony w przeglądarce i otwórz ją ponownie.',
            },
          ),
        );
        return;
      }
      // Let a future version (another tab) upgrade instead of being blocked by us forever.
      db.onversionchange = () => db.close();
      settled = true;
      resolve(new CorpusDb(db));
    };
  });
}

// ---------------------------------------------------------------------------------------------
// The store
// ---------------------------------------------------------------------------------------------

export class CorpusDb implements CorpusReader {
  constructor(private readonly db: IDBDatabase) {}

  get name(): string {
    return this.db.name;
  }

  close(): void {
    this.db.close();
  }

  private transaction(
    stores: string | string[],
    mode: IDBTransactionMode,
    context: string,
  ): IDBTransaction {
    try {
      return this.db.transaction(stores, mode);
    } catch (error) {
      throw toCorpusError(error, context);
    }
  }

  // --- runs ----------------------------------------------------------------------------------

  /** Inserts a new run; fails (code 'unknown') when the sessionId already exists. */
  async createRun(run: SessionRecord): Promise<void> {
    const tx = this.transaction(STORE_RUNS, 'readwrite', 'createRun');
    tx.objectStore(STORE_RUNS).add(run);
    await done(tx, 'createRun');
  }

  /** Shallow-merges `patch` into the stored run inside one transaction and returns the result. */
  async updateRun(runId: string, patch: Partial<SessionRecord>): Promise<SessionRecord> {
    const tx = this.transaction(STORE_RUNS, 'readwrite', 'updateRun');
    const store = tx.objectStore(STORE_RUNS);
    let merged: SessionRecord | undefined;
    const getReq = store.get(runId) as IDBRequest<SessionRecord | undefined>;
    getReq.onsuccess = () => {
      const current = getReq.result;
      if (!current) {
        tx.abort();
        return;
      }
      merged = { ...current, ...patch, sessionId: current.sessionId };
      store.put(merged);
    };
    try {
      await done(tx, 'updateRun');
    } catch (error) {
      if (!merged) {
        throw new CorpusError('unknown', `updateRun: run ${runId} not found`, {
          cause: error,
          messagePl: 'Nie znaleziono tej sesji w pamięci telefonu.',
        });
      }
      throw error;
    }
    if (!merged) throw new CorpusError('unknown', `updateRun: run ${runId} not found`);
    return merged;
  }

  async getRun(runId: string): Promise<SessionRecord | undefined> {
    const tx = this.transaction(STORE_RUNS, 'readonly', 'getRun');
    return request(
      tx.objectStore(STORE_RUNS).get(runId) as IDBRequest<SessionRecord | undefined>,
      'getRun',
    );
  }

  /** All runs, newest first. */
  async listRuns(): Promise<SessionRecord[]> {
    const tx = this.transaction(STORE_RUNS, 'readonly', 'listRuns');
    const runs = await request(
      tx.objectStore(STORE_RUNS).getAll() as IDBRequest<SessionRecord[]>,
      'listRuns',
    );
    return runs.sort((a, b) =>
      a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0,
    );
  }

  // --- scenes --------------------------------------------------------------------------------

  /** Upserts the summary of one scene (key [runId, sceneId]; a retry overwrites the earlier attempt). */
  async putSceneResult(runId: string, result: SceneRunSummary): Promise<void> {
    const tx = this.transaction(STORE_SCENES, 'readwrite', 'putSceneResult');
    // retries keep their own row (key sceneId#attempt) so per-attempt loop/transfer evidence survives
    const row: SceneRow = {
      runId,
      sceneId: result.attempt > 1 ? `${result.sceneId}#${result.attempt}` : result.sceneId,
      result,
      updatedAt: new Date().toISOString(),
    };
    tx.objectStore(STORE_SCENES).put(row);
    await done(tx, 'putSceneResult');
  }

  /** Scene summaries of one run in sceneId key order. */
  async getSceneResults(runId: string): Promise<SceneRunSummary[]> {
    const tx = this.transaction(STORE_SCENES, 'readonly', 'getSceneResults');
    const rows = await request(
      tx.objectStore(STORE_SCENES).getAll(runRange(runId)) as IDBRequest<SceneRow[]>,
      'getSceneResults',
    );
    return rows.map((row) => row.result);
  }

  // --- events --------------------------------------------------------------------------------

  /** Appends a batch of per-frame evidence in ONE transaction; insertion order is preserved. */
  async appendEvents(
    runId: string,
    sceneId: string,
    events: readonly FrameEvidence[],
  ): Promise<void> {
    if (events.length === 0) return;
    const tx = this.transaction(STORE_EVENTS, 'readwrite', 'appendEvents');
    const store = tx.objectStore(STORE_EVENTS);
    for (const event of events) {
      const row: EventRow = { runId, sceneId, event };
      store.add(row);
    }
    await done(tx, 'appendEvents');
  }

  /**
   * Walks the events of one scene through a cursor in insertion order without materialising the
   * whole list. Resolves with the number of events visited.
   */
  async iterateEvents(runId: string, sceneId: string, visit: EventVisitor): Promise<number> {
    const tx = this.transaction(STORE_EVENTS, 'readonly', 'iterateEvents');
    const index = tx.objectStore(STORE_EVENTS).index(INDEX_EVENTS_BY_SCENE);
    let count = 0;
    await new Promise<void>((resolve, reject) => {
      const req = index.openCursor(sceneKey(runId, sceneId));
      req.onerror = () => reject(toCorpusError(req.error, 'iterateEvents'));
      req.onsuccess = () => {
        const cursor = req.result;
        if (!cursor) {
          resolve();
          return;
        }
        const row = cursor.value as EventRow;
        let keepGoing: void | boolean;
        try {
          keepGoing = visit(row.event, count);
        } catch (error) {
          reject(error);
          return;
        }
        count += 1;
        if (keepGoing === false) {
          resolve();
          return;
        }
        cursor.continue();
      };
    });
    return count;
  }

  async countEvents(runId: string, sceneId: string): Promise<number> {
    const tx = this.transaction(STORE_EVENTS, 'readonly', 'countEvents');
    const index = tx.objectStore(STORE_EVENTS).index(INDEX_EVENTS_BY_SCENE);
    return request(index.count(sceneKey(runId, sceneId)), 'countEvents');
  }

  // --- frames --------------------------------------------------------------------------------

  /** Stores (or replaces) one encoded frame; `bytes` is taken from the Blob. */
  async putFrame(
    runId: string,
    sceneId: string,
    frameIndex: number,
    blob: Blob,
    meta: FrameMetaInput,
  ): Promise<void> {
    const tx = this.transaction(STORE_FRAMES, 'readwrite', 'putFrame');
    const row: FrameRow = { runId, sceneId, frameIndex, blob, meta: { ...meta, bytes: blob.size } };
    tx.objectStore(STORE_FRAMES).put(row);
    await done(tx, 'putFrame');
  }

  /**
   * Frame metadata of one scene in frameIndex order. IndexedDB cannot project a value, so rows are
   * read through a cursor and the Blob reference is dropped immediately; browsers hand Blobs out of
   * IndexedDB as lazily-backed handles, so this does not pull the encoded bytes into memory.
   */
  async listFrames(runId: string, sceneId: string): Promise<FrameEntry[]> {
    const tx = this.transaction(STORE_FRAMES, 'readonly', 'listFrames');
    const store = tx.objectStore(STORE_FRAMES);
    const entries: FrameEntry[] = [];
    await new Promise<void>((resolve, reject) => {
      const req = store.openCursor(sceneRange(runId, sceneId));
      req.onerror = () => reject(toCorpusError(req.error, 'listFrames'));
      req.onsuccess = () => {
        const cursor = req.result;
        if (!cursor) {
          resolve();
          return;
        }
        const row = cursor.value as FrameRow;
        entries.push({ runId, sceneId, frameIndex: row.frameIndex, meta: row.meta });
        cursor.continue();
      };
    });
    return entries;
  }

  async countFrames(runId: string, sceneId: string): Promise<number> {
    const tx = this.transaction(STORE_FRAMES, 'readonly', 'countFrames');
    return request(tx.objectStore(STORE_FRAMES).count(sceneRange(runId, sceneId)), 'countFrames');
  }

  async getFrameBlob(
    runId: string,
    sceneId: string,
    frameIndex: number,
  ): Promise<Blob | undefined> {
    const tx = this.transaction(STORE_FRAMES, 'readonly', 'getFrameBlob');
    const row = await request(
      tx.objectStore(STORE_FRAMES).get([runId, sceneId, frameIndex]) as IDBRequest<
        FrameRow | undefined
      >,
      'getFrameBlob',
    );
    return row?.blob;
  }

  // --- deletion ------------------------------------------------------------------------------

  /** Removes the run and every scene, event and frame that belongs to it, in one transaction. */
  async deleteRun(runId: string): Promise<void> {
    const tx = this.transaction([...ALL_STORES], 'readwrite', 'deleteRun');
    tx.objectStore(STORE_RUNS).delete(runId);
    tx.objectStore(STORE_SCENES).delete(runRange(runId));
    tx.objectStore(STORE_FRAMES).delete(runRange(runId));
    const events = tx.objectStore(STORE_EVENTS);
    deleteViaIndex(events, events.index(INDEX_EVENTS_BY_SCENE), runRange(runId));
    await done(tx, 'deleteRun');
  }

  /** Drops one scene's summary, events and frames (used before re-recording a scene). */
  async deleteSceneData(runId: string, sceneId: string): Promise<void> {
    const tx = this.transaction(
      [STORE_SCENES, STORE_EVENTS, STORE_FRAMES],
      'readwrite',
      'deleteSceneData',
    );
    tx.objectStore(STORE_SCENES).delete([runId, sceneId]);
    tx.objectStore(STORE_FRAMES).delete(sceneRange(runId, sceneId));
    const events = tx.objectStore(STORE_EVENTS);
    deleteViaIndex(events, events.index(INDEX_EVENTS_BY_SCENE), sceneKey(runId, sceneId));
    await done(tx, 'deleteSceneData');
  }
}

// ---------------------------------------------------------------------------------------------
// Storage quota (feature-detected; iOS Safari < 17 lacks estimate(), some builds lack persist())
// ---------------------------------------------------------------------------------------------

export interface CorpusStorageEstimate {
  usageBytes: number | null;
  quotaBytes: number | null;
  /** navigator.storage.persisted(), null when the API is missing. */
  persisted: boolean | null;
}

type StorageNavigator = { storage?: Partial<StorageManager> | undefined };

function defaultNavigator(): StorageNavigator | undefined {
  return typeof navigator === 'undefined' ? undefined : (navigator as StorageNavigator);
}

/** navigator.storage.estimate() wrapped; resolves null when unsupported or when the call throws. */
export async function estimateStorage(
  nav: StorageNavigator | undefined = defaultNavigator(),
): Promise<CorpusStorageEstimate | null> {
  const storage = nav?.storage;
  if (!storage || typeof storage.estimate !== 'function') return null;
  try {
    const estimate = await storage.estimate();
    let persisted: boolean | null = null;
    if (typeof storage.persisted === 'function') {
      persisted = await storage.persisted().catch(() => null);
    }
    return {
      usageBytes: typeof estimate.usage === 'number' ? estimate.usage : null,
      quotaBytes: typeof estimate.quota === 'number' ? estimate.quota : null,
      persisted,
    };
  } catch {
    return null;
  }
}

/** navigator.storage.persist(); resolves null when the API is missing, false when refused. */
export async function requestPersistentStorage(
  nav: StorageNavigator | undefined = defaultNavigator(),
): Promise<boolean | null> {
  const storage = nav?.storage;
  if (!storage || typeof storage.persist !== 'function') return null;
  try {
    return await storage.persist();
  } catch {
    return null;
  }
}
