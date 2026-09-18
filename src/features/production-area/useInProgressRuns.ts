import { useEffect, useMemo, useState } from 'react';
import type { ProductionRun } from '@/features/pro-core/productionContracts';
import type { ProductionSession } from '@/features/production-workspace/productionSession';
import { useProductionSessionStore } from '@/features/production-workspace/productionSessionStore';
import type { ProductionRepository } from '@/services/proCore/productionRepository';
import { get as getSavedRecipe } from '@/services/recipes';

/** One PRO run in progress, addressed by its immutable run id and exact recipe version. */
export interface InProgressBatch {
  runId: string;
  recipeId: string;
  recipeVersionId: string;
  recipeVersionNumber: number;
  recipeName: string | null;
  plannedBatchG: number | null;
  startedAt: string;
}

const EMPTY_SESSIONS: Record<string, ProductionSession> = {};
const IN_PROGRESS_LIMIT = 5;

const startedAtOf = (run: ProductionRun): string =>
  run.events?.find((event) => event.type === 'started')?.at ?? run.createdAt;

function fromSession(session: ProductionSession): InProgressBatch | null {
  const { recipeId, recipeVersionId, recipeVersionNumber, recipeName } = session.source;
  if (!recipeId || !recipeVersionId || recipeVersionNumber === null) return null;
  return {
    runId: session.sessionId,
    recipeId,
    recipeVersionId,
    recipeVersionNumber,
    recipeName: recipeName?.trim() || null,
    plannedBatchG: session.plannedInput?.target_batch_grams ?? null,
    startedAt: session.startedAt,
  };
}

function fromRun(run: ProductionRun, local: ProductionSession | undefined): InProgressBatch {
  return {
    runId: run.runId,
    recipeId: run.recipeId,
    recipeVersionId: run.recipeVersionId,
    recipeVersionNumber: run.recipeVersionNumber,
    recipeName: local?.source.recipeName?.trim() || null,
    plannedBatchG: run.plannedBatchG ?? null,
    startedAt: startedAtOf(run),
  };
}

const newestFirst = (a: InProgressBatch, b: InProgressBatch) =>
  b.startedAt.localeCompare(a.startedAt) || b.runId.localeCompare(a.runId);

/**
 * Partie → „W toku”, from the EXISTING sources only (Production v3 §6):
 *  - the server (`listRuns` status `in_progress`) is the truth for the list — a local
 *    „+ Nowa receptura” clears `sessionsById`, the run stays on the server;
 *  - `sessionsById` shows this device's runs at once, before the server answers, and
 *    names them. Nothing is written: no store action is called here.
 */
export function useInProgressRuns({
  enabled,
  ownerUserId,
  repository,
}: {
  enabled: boolean;
  ownerUserId: string | null;
  repository: Pick<ProductionRepository, 'listRuns'> | null;
}): {
  batches: InProgressBatch[];
  state: 'loading' | 'ready' | 'local-only';
} {
  const sessionsById = useProductionSessionStore((state) => state.sessionsById) ?? EMPTY_SESSIONS;
  const [server, setServer] = useState<{
    owner: string;
    runs: ProductionRun[] | null;
  } | null>(null);
  const [names, setNames] = useState<Readonly<Record<string, string>>>({});

  useEffect(() => {
    if (!enabled || !ownerUserId || !repository) return;
    let cancelled = false;
    void (async () => {
      try {
        const page = await repository.listRuns(ownerUserId, {
          status: 'in_progress',
          sort: 'newest',
          limit: IN_PROGRESS_LIMIT,
        });
        if (!cancelled) {
          setServer({
            owner: ownerUserId,
            runs: page.items.filter(
              (run) => run.status === 'in_progress' && run.ownerUserId === ownerUserId,
            ),
          });
        }
      } catch {
        if (!cancelled) setServer({ owner: ownerUserId, runs: null });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [enabled, ownerUserId, repository]);

  const local = useMemo(
    () =>
      Object.values(sessionsById)
        .filter(
          (session) =>
            session.ownerUserId === ownerUserId &&
            ownerUserId !== null &&
            session.status === 'in_progress',
        )
        .map(fromSession)
        .filter((batch): batch is InProgressBatch => batch !== null),
    [ownerUserId, sessionsById],
  );

  const serverForOwner = server?.owner === ownerUserId ? server : null;
  const batches = useMemo(() => {
    const rows = serverForOwner?.runs
      ? serverForOwner.runs.map((run) => fromRun(run, sessionsById[run.runId]))
      : local;
    return rows
      .map((row) => ({ ...row, recipeName: row.recipeName ?? names[row.recipeId] ?? null }))
      .sort(newestFirst);
  }, [local, names, serverForOwner, sessionsById]);

  // A run that is only on the server (another device, or a cleared local copy) is
  // named from its saved recipe — one read per recipe, at most five.
  const unnamedRecipeIds = useMemo(
    () =>
      [...new Set(batches.filter((row) => !row.recipeName).map((row) => row.recipeId))].filter(
        (recipeId) => !(recipeId in names),
      ),
    [batches, names],
  );
  useEffect(() => {
    if (unnamedRecipeIds.length === 0) return;
    let cancelled = false;
    void Promise.all(
      unnamedRecipeIds.map(async (recipeId) => {
        try {
          return [recipeId, (await getSavedRecipe(recipeId))?.name?.trim() ?? ''] as const;
        } catch {
          return [recipeId, ''] as const;
        }
      }),
    ).then((pairs) => {
      if (cancelled) return;
      setNames((current) => ({ ...current, ...Object.fromEntries(pairs) }));
    });
    return () => {
      cancelled = true;
    };
  }, [unnamedRecipeIds]);

  return {
    batches: batches.map((row) => ({ ...row, recipeName: row.recipeName || null })),
    state: serverForOwner ? (serverForOwner.runs ? 'ready' : 'local-only') : 'loading',
  };
}
