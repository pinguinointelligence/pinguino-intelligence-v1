import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { CharcoalPanel } from '@/components/ui/CharcoalPanel';
import { NotFoundPage } from '@/pages/NotFoundPage';
import { resolveMapperSearch } from '@/features/mapper-search-runtime';
import type { MapperSearchResolution } from '@/features/mapper-search-runtime';
import { isMapperSearchAcceptanceHost } from './mapperSearchAcceptanceBoundary';

const initialParams = () => {
  const params = new URLSearchParams(window.location.search);
  return {
    input: params.get('input') ?? 'bananowo-czekoladowe, sorbet',
    localeVariant: params.get('locale') ?? 'pl-PL',
    marketScope: params.get('market') ?? 'PL',
    autorun: params.get('run') === '1',
  };
};

export function MapperSearchAcceptancePage() {
  const initial = initialParams();
  const [input, setInput] = useState(initial.input);
  const [localeVariant, setLocaleVariant] = useState(initial.localeVariant);
  const [marketScope, setMarketScope] = useState(initial.marketScope);
  const [resolution, setResolution] = useState<MapperSearchResolution | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(initial.autorun);

  const allowed = isMapperSearchAcceptanceHost(window.location.hostname);

  const run = async () => {
    setRunning(true);
    setError(null);
    try {
      setResolution(await resolveMapperSearch(input, { localeVariant, marketScope }));
    } catch (cause) {
      setResolution(null);
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setRunning(false);
    }
  };

  useEffect(() => {
    if (!allowed || !initial.autorun) return;
    void resolveMapperSearch(initial.input, {
      localeVariant: initial.localeVariant,
      marketScope: initial.marketScope,
    })
      .then((result) => setResolution(result))
      .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : String(cause)))
      .finally(() => setRunning(false));
    // Query parameters are intentionally read once so an acceptance result stays stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!allowed) return <NotFoundPage />;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    void run();
  };

  return (
    <main className="min-h-screen bg-[#EFE8DC] px-5 py-10 text-ink md:px-10">
      <div className="mx-auto flex max-w-6xl flex-col gap-6">
        <CharcoalPanel>
          <p className="font-mono text-xs uppercase tracking-[0.22em] text-ivory/60">Staging QA · read only</p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight">Mapper / Search acceptance probe</h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-ivory/70">
            Executes the same immutable central resolver used by HOME and PRO. It performs no database writes
            and is unavailable on production hostnames.
          </p>
        </CharcoalPanel>

        <Card padding="lg">
          <form className="grid gap-5 md:grid-cols-[1fr_180px_140px_auto] md:items-end" onSubmit={submit}>
            <label className="grid gap-2 text-sm font-medium">
              Input
              <input
                className="h-11 rounded-md border border-ink/15 bg-white px-3 font-mono text-sm outline-none focus:border-ink/50"
                value={input}
                onChange={(event) => setInput(event.target.value)}
                data-testid="mapper-search-input"
              />
            </label>
            <label className="grid gap-2 text-sm font-medium">
              Locale
              <input
                className="h-11 rounded-md border border-ink/15 bg-white px-3 font-mono text-sm outline-none focus:border-ink/50"
                value={localeVariant}
                onChange={(event) => setLocaleVariant(event.target.value)}
              />
            </label>
            <label className="grid gap-2 text-sm font-medium">
              Market
              <input
                className="h-11 rounded-md border border-ink/15 bg-white px-3 font-mono text-sm outline-none focus:border-ink/50"
                value={marketScope}
                onChange={(event) => setMarketScope(event.target.value)}
              />
            </label>
            <Button type="submit" disabled={running}>{running ? 'Resolving…' : 'Resolve'}</Button>
          </form>
        </Card>

        <Card padding="lg">
          <div className="flex items-center justify-between gap-4 border-b border-ink/10 pb-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-ink/45">Full resolution</p>
              <p className="mt-1 font-mono text-xs text-ink/60">SEARCH · ROLE · TECHNICAL · gaps · trace</p>
            </div>
            <span className="rounded-sm border border-ink/15 px-2 py-1 font-mono text-[11px] uppercase text-ink/55">
              {error ? 'FAIL' : resolution ? 'PASS' : 'READY'}
            </span>
          </div>
          {error && <p className="mt-5 font-mono text-sm text-red-800" role="alert">{error}</p>}
          <pre
            className="mt-5 max-h-[65vh] overflow-auto rounded-md bg-charcoal p-5 font-mono text-xs leading-5 text-ivory"
            data-testid="mapper-search-resolution"
          >
            {resolution ? JSON.stringify(resolution, null, 2) : 'Run a query to inspect the central resolver.'}
          </pre>
        </Card>
      </div>
    </main>
  );
}
