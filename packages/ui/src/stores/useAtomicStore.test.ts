import { beforeEach, describe, expect, test } from 'bun:test';
import type {
  AtomicAPI,
  AtomicChangeDetail,
  AtomicDiffResult,
  AtomicHistoryResult,
  AtomicOverview,
  AtomicProvenanceResult,
  AtomicVaultResult,
} from '@/lib/api/types';
import { getRuntimeKey } from '@/lib/runtime-switch';
import {
  ATOMIC_DIFF_CACHE_MAX_BYTES,
  ATOMIC_DIFF_CACHE_MAX_ENTRIES,
  getAtomicDiffRequestKey,
  useAtomicStore,
} from './useAtomicStore';

type Deferred<T> = {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (error: Error) => void;
};

const deferred = <T>(): Deferred<T> => {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
};

const overview = (entries: string[] = []): AtomicOverview => ({
  status: 'ready',
  currentView: { name: 'main', current: true, scope: 'shared', changeCount: 0, state: null },
  views: [],
  workingCopy: {
    clean: entries.length === 0,
    entries: entries.map((path) => ({ path, kind: 'modified' })),
  },
});

const history = (hashes: string[]): AtomicHistoryResult => ({
  changes: hashes.map((hash) => ({
    hash,
    sequence: null,
    state: null,
    message: hash,
    timestamp: null,
    author: null,
    tagged: null,
  })),
  metadata: { completeness: 'complete' },
});

const change = (hash: string): AtomicChangeDetail => ({
  ...history([hash]).changes[0],
  hunks: [],
  hasProvenance: false,
  attestation: null,
  ledger: [],
});

const provenance: AtomicProvenanceResult = { status: 'available', document: {} };

const vault: AtomicVaultResult = { status: 'available', intents: [], memories: [] };

const api = (overrides: Partial<AtomicAPI> = {}): AtomicAPI => ({
  overview: async () => overview(),
  history: async () => history([]),
  change: async (_directory, hash) => change(hash),
  diff: async () => ({ diff: '' }),
  provenance: async () => provenance,
  vault: async () => vault,
  ...overrides,
});

describe('useAtomicStore', () => {
  beforeEach(() => {
    useAtomicStore.getState().resetForRuntimeSwitch(getRuntimeKey());
  });

  test('deduplicates identical in-flight requests and keeps channel loading independent', async () => {
    const pending = deferred<AtomicOverview>();
    let calls = 0;
    const atomic = api({ overview: () => { calls += 1; return pending.promise; } });

    const first = useAtomicStore.getState().loadOverview('/repo', atomic);
    const second = useAtomicStore.getState().loadOverview('/repo', atomic);
    const historyPromise = useAtomicStore.getState().loadHistory('/repo', atomic);

    expect(first).toBe(second);
    expect(calls).toBe(1);
    expect(useAtomicStore.getState().getDirectoryState('/repo')?.overview.loading).toBe(true);
    await historyPromise;
    expect(useAtomicStore.getState().getDirectoryState('/repo')?.overview.loading).toBe(true);

    pending.resolve(overview(['a.ts']));
    await first;
    expect(useAtomicStore.getState().getDirectoryState('/repo')?.overview.data).toEqual(overview(['a.ts']));
  });

  test('deduplicates identical keyed requests and isolates channel errors', async () => {
    const pending = deferred<AtomicHistoryResult>();
    let calls = 0;
    const atomic = api({ history: () => { calls += 1; return pending.promise; } });
    const first = useAtomicStore.getState().loadHistory('/repo', atomic, { limit: 10 });
    const second = useAtomicStore.getState().loadHistory('/repo', atomic, { limit: 10 });
    expect(first).toBe(second);
    expect(calls).toBe(1);

    pending.reject(new Error('history unavailable'));
    await expect(first).rejects.toThrow('history unavailable');
    const state = useAtomicStore.getState().getDirectoryState('/repo');
    expect(state?.histories.get('[10,null]')?.error).toBe('history unavailable');
    expect(state?.overview.error).toBeNull();
  });

  test('preserves successful data on failure and treats successful empty as authoritative', async () => {
    await useAtomicStore.getState().loadOverview('/repo', api({ overview: async () => overview(['old.ts']) }));
    await expect(useAtomicStore.getState().loadOverview('/repo', api({
      overview: async () => { throw new Error('offline'); },
    }))).rejects.toThrow('offline');

    let state = useAtomicStore.getState().getDirectoryState('/repo');
    expect(state?.overview.data).toEqual(overview(['old.ts']));
    expect(state?.overview.error).toBe('offline');

    await useAtomicStore.getState().loadOverview('/repo', api({ overview: async () => overview() }));
    state = useAtomicStore.getState().getDirectoryState('/repo');
    expect(state?.overview.data).toEqual(overview());
    expect(state?.overview.error).toBeNull();
  });

  test('rejects stale channel and runtime completions', async () => {
    const older = deferred<AtomicHistoryResult>();
    const newer = deferred<AtomicHistoryResult>();
    const atomic = api({ history: (_directory, options) => options?.limit === 1 ? older.promise : newer.promise });

    const oldLoad = useAtomicStore.getState().loadHistory('/repo', atomic, { limit: 1 });
    const newLoad = useAtomicStore.getState().loadHistory('/repo', atomic, { limit: 2 });
    newer.resolve(history(['new']));
    await newLoad;
    older.resolve(history(['old']));
    await expect(oldLoad).rejects.toThrow('superseded');

    const staleOverview = deferred<AtomicOverview>();
    const staleLoad = useAtomicStore.getState().loadOverview('/repo', api({ overview: () => staleOverview.promise }));
    useAtomicStore.getState().resetForRuntimeSwitch('runtime-b');
    staleOverview.resolve(overview(['stale.ts']));
    await expect(staleLoad).rejects.toThrow('superseded');
    expect(useAtomicStore.getState().runtimeKey).toBe('runtime-b');
    expect(useAtomicStore.getState().directories.size).toBe(0);
  });

  test('loads every keyed channel without publishing selection state', async () => {
    const atomic = api();
    await useAtomicStore.getState().loadChange('/repo', 'ABC2', atomic);
    await useAtomicStore.getState().loadDiff('/repo', { target: 'change', change: 'ABC2' }, atomic);
    await useAtomicStore.getState().loadProvenance('/repo', 'ABC2', atomic);

    const state = useAtomicStore.getState().getDirectoryState('/repo');
    expect(state?.changes.get('ABC2')?.data).toEqual(change('ABC2'));
    expect(state?.diffs.get(getAtomicDiffRequestKey({ target: 'change', change: 'ABC2' }))?.data).toEqual({ diff: '' });
    expect(state?.provenance.get('ABC2')?.data).toEqual(provenance);
    expect('selection' in useAtomicStore.getState()).toBe(false);
  });

  test('preserves unrelated directory references', async () => {
    await useAtomicStore.getState().loadOverview('/first', api());
    await useAtomicStore.getState().loadOverview('/second', api());
    const second = useAtomicStore.getState().getDirectoryState('/second');

    await useAtomicStore.getState().loadHistory('/first', api());
    expect(useAtomicStore.getState().getDirectoryState('/second')).toBe(second);
  });

  test('bounds diff cache by count', async () => {
    const atomic = api({ diff: async (_directory, request): Promise<AtomicDiffResult> => ({
      diff: request.target === 'change' ? request.change : 'working',
    }) });
    for (let index = 0; index <= ATOMIC_DIFF_CACHE_MAX_ENTRIES; index += 1) {
      await useAtomicStore.getState().loadDiff('/repo', { target: 'change', change: `CHG${index}` }, atomic);
    }

    const state = useAtomicStore.getState().getDirectoryState('/repo');
    expect(state?.diffs.size).toBe(ATOMIC_DIFF_CACHE_MAX_ENTRIES);
    expect(state?.diffs.has(getAtomicDiffRequestKey({ target: 'change', change: 'CHG0' }))).toBe(false);
  });

  test('counts UTF-8 bytes and rejects an oversized diff while preserving prior data', async () => {
    const request = { target: 'working' } as const;
    await useAtomicStore.getState().loadDiff('/repo', request, api({ diff: async () => ({ diff: 'prior' }) }));
    const oversized = 'é'.repeat(Math.floor(ATOMIC_DIFF_CACHE_MAX_BYTES / 2) + 1);

    await expect(useAtomicStore.getState().loadDiff('/repo', request, api({
      diff: async () => ({ diff: oversized }),
    }))).rejects.toThrow('byte limit');

    const query = useAtomicStore.getState().getDirectoryState('/repo')?.diffs.get(getAtomicDiffRequestKey(request));
    expect(query?.data).toEqual({ diff: 'prior' });
    expect(query?.error).toContain('byte limit');
    expect(useAtomicStore.getState().getDirectoryState('/repo')?.diffCacheBytes).toBe(5);
  });
});
