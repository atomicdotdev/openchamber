import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import type {
  AtomicAPI,
  AtomicChangeDetail,
  AtomicDiffRequest,
  AtomicDiffResult,
  AtomicHistoryOptions,
  AtomicHistoryResult,
  AtomicOverview,
  AtomicProvenanceResult,
} from '@/lib/api/types';
import { getRuntimeKey } from '@/lib/runtime-switch';
import { getRegisteredRuntimeAPIs } from '@/contexts/runtimeAPIRegistry';

export const ATOMIC_DIFF_CACHE_MAX_ENTRIES = 30;
export const ATOMIC_DIFF_CACHE_MAX_BYTES = 20 * 1024 * 1024;

export interface AtomicQueryState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
}

export interface AtomicDirectoryState {
  overview: AtomicQueryState<AtomicOverview>;
  histories: ReadonlyMap<string, AtomicQueryState<AtomicHistoryResult>>;
  changes: ReadonlyMap<string, AtomicQueryState<AtomicChangeDetail>>;
  diffs: ReadonlyMap<string, AtomicQueryState<AtomicDiffResult>>;
  provenance: ReadonlyMap<string, AtomicQueryState<AtomicProvenanceResult>>;
  diffCacheBytes: number;
}

interface AtomicStore {
  runtimeKey: string;
  directories: ReadonlyMap<string, AtomicDirectoryState>;
  getDirectoryState: (directory: string) => AtomicDirectoryState | null;
  loadOverview: (directory: string, atomic: AtomicAPI) => Promise<AtomicOverview>;
  loadHistory: (directory: string, atomic: AtomicAPI, options?: AtomicHistoryOptions) => Promise<AtomicHistoryResult>;
  loadChange: (directory: string, change: string, atomic: AtomicAPI) => Promise<AtomicChangeDetail>;
  loadDiff: (directory: string, request: AtomicDiffRequest, atomic: AtomicAPI) => Promise<AtomicDiffResult>;
  loadProvenance: (directory: string, change: string, atomic: AtomicAPI) => Promise<AtomicProvenanceResult>;
  resetForRuntimeSwitch: (runtimeKey: string) => void;
}

type AtomicChannel = 'overview' | 'history' | 'change' | 'diff' | 'provenance';
type RequestToken = {
  runtimeKey: string;
  runtimeGeneration: number;
  generationKey: string;
  generation: number;
};

const EMPTY_QUERY_STATE: AtomicQueryState<never> = Object.freeze({ data: null, loading: false, error: null });
const textEncoder = new TextEncoder();
const inFlightRequests = new Map<string, Promise<unknown>>();
const requestGenerations = new Map<string, number>();
let runtimeGeneration = 0;
let activeRuntimeKey = getRuntimeKey();
let diffCacheSequence = 0;
const diffCacheSequenceByEntry = new Map<string, number>();

const normalizeDirectory = (directory: string): string => directory.trim();
const historyRequestKey = (options?: AtomicHistoryOptions): string =>
  JSON.stringify([options?.limit ?? null, options?.view ?? null]);
export const getAtomicDiffRequestKey = (request: AtomicDiffRequest): string => request.target === 'working'
  ? JSON.stringify(['working', request.paths ?? null])
  : JSON.stringify(['change', request.change]);
const scopedKey = (runtimeKey: string, directory: string, channel: AtomicChannel, requestKey?: string): string =>
  JSON.stringify([runtimeKey, directory, channel, requestKey ?? null]);

const emptyQuery = <T>(): AtomicQueryState<T> => EMPTY_QUERY_STATE;

const createDirectoryState = (): AtomicDirectoryState => ({
  overview: emptyQuery(),
  histories: new Map(),
  changes: new Map(),
  diffs: new Map(),
  provenance: new Map(),
  diffCacheBytes: 0,
});

const errorMessage = (error: Error): string => error.message;

const isTokenCurrent = (token: RequestToken): boolean => (
  token.runtimeKey === activeRuntimeKey
  && token.runtimeKey === getRuntimeKey()
  && token.runtimeGeneration === runtimeGeneration
  && requestGenerations.get(token.generationKey) === token.generation
);

const startRequest = (directory: string, channel: AtomicChannel): RequestToken => {
  const runtimeKey = getRuntimeKey();
  const generationKey = scopedKey(runtimeKey, directory, channel);
  const generation = (requestGenerations.get(generationKey) ?? 0) + 1;
  requestGenerations.set(generationKey, generation);
  return { runtimeKey, runtimeGeneration, generationKey, generation };
};

const updateDirectory = (directory: string, update: (current: AtomicDirectoryState) => AtomicDirectoryState): void => {
  useAtomicStore.setState((state) => {
    const current = state.directories.get(directory) ?? createDirectoryState();
    const next = update(current);
    if (next === current) return state;
    const directories = new Map(state.directories);
    directories.set(directory, next);
    return { directories };
  });
};

const startKeyedQuery = <T>(
  queries: ReadonlyMap<string, AtomicQueryState<T>>,
  requestKey: string,
): ReadonlyMap<string, AtomicQueryState<T>> => {
  const next = new Map(queries);
  for (const [key, query] of next) {
    if (query.loading) next.set(key, { ...query, loading: false });
  }
  const current = next.get(requestKey) ?? emptyQuery<T>();
  next.delete(requestKey);
  next.set(requestKey, { ...current, loading: true, error: null });
  return next;
};

type KeyedRequestOptions<T> = {
  directory: string;
  channel: Exclude<AtomicChannel, 'overview'>;
  requestKey: string;
  request: () => Promise<T>;
  read: (state: AtomicDirectoryState) => ReadonlyMap<string, AtomicQueryState<T>>;
  write: (
    state: AtomicDirectoryState,
    queries: ReadonlyMap<string, AtomicQueryState<T>>,
    result?: T,
  ) => AtomicDirectoryState;
  validate?: (result: T) => void;
};

const runKeyedRequest = <T>(options: KeyedRequestOptions<T>): Promise<T> => {
  const directory = normalizeDirectory(options.directory);
  if (!directory) return Promise.reject(new Error('Atomic requests require a directory'));

  const runtimeKey = getRuntimeKey();
  const inFlightKey = scopedKey(runtimeKey, directory, options.channel, options.requestKey);
  // SAFETY: each in-flight key includes the channel and canonical request key,
  // whose action fixes the promise result type for the lifetime of that entry.
  const existing = inFlightRequests.get(inFlightKey) as Promise<T> | undefined;
  if (existing) return existing;

  const token = startRequest(directory, options.channel);
  updateDirectory(directory, (state) => options.write(state, startKeyedQuery(options.read(state), options.requestKey)));

  const promise = options.request().then((result) => {
    if (!isTokenCurrent(token)) throw new Error('Atomic request was superseded');
    options.validate?.(result);
    updateDirectory(directory, (state) => {
      const queries = new Map(options.read(state));
      queries.set(options.requestKey, { data: result, loading: false, error: null });
      return options.write(state, queries, result);
    });
    return result;
  }).catch((error: Error) => {
    if (isTokenCurrent(token)) {
      updateDirectory(directory, (state) => {
        const queries = new Map(options.read(state));
        const current = queries.get(options.requestKey) ?? emptyQuery<T>();
        queries.set(options.requestKey, { ...current, loading: false, error: errorMessage(error) });
        return options.write(state, queries);
      });
    }
    throw error;
  }).finally(() => {
    if (inFlightRequests.get(inFlightKey) === promise) inFlightRequests.delete(inFlightKey);
  });

  inFlightRequests.set(inFlightKey, promise);
  return promise;
};

const boundDiffCache = (
  runtimeKey: string,
  directory: string,
  state: AtomicDirectoryState,
  queries: ReadonlyMap<string, AtomicQueryState<AtomicDiffResult>>,
  committedRequestKey: string,
  result?: AtomicDiffResult,
): AtomicDirectoryState => {
  if (!result) return { ...state, diffs: queries };

  const previous = state.diffs.get(committedRequestKey)?.data;
  const resultBytes = textEncoder.encode(result.diff).byteLength;
  let diffCacheBytes = state.diffCacheBytes - (previous ? textEncoder.encode(previous.diff).byteLength : 0) + resultBytes;
  const next = new Map(queries);
  const sequenceKey = scopedKey(runtimeKey, directory, 'diff', committedRequestKey);
  diffCacheSequenceByEntry.set(sequenceKey, ++diffCacheSequence);

  let successfulCount = 0;
  for (const query of next.values()) {
    if (query.data) successfulCount += 1;
  }
  while (successfulCount > ATOMIC_DIFF_CACHE_MAX_ENTRIES || diffCacheBytes > ATOMIC_DIFF_CACHE_MAX_BYTES) {
    let oldestKey: string | null = null;
    let oldestSequence = Number.POSITIVE_INFINITY;
    for (const [requestKey, query] of next) {
      if (!query.data || requestKey === committedRequestKey) continue;
      const candidate = diffCacheSequenceByEntry.get(scopedKey(runtimeKey, directory, 'diff', requestKey)) ?? 0;
      if (candidate < oldestSequence) {
        oldestKey = requestKey;
        oldestSequence = candidate;
      }
    }
    if (!oldestKey) break;
    const evicted = next.get(oldestKey)?.data;
    if (evicted) diffCacheBytes -= textEncoder.encode(evicted.diff).byteLength;
    next.delete(oldestKey);
    diffCacheSequenceByEntry.delete(scopedKey(runtimeKey, directory, 'diff', oldestKey));
    successfulCount -= 1;
  }

  return { ...state, diffs: next, diffCacheBytes };
};

export const useAtomicStore = create<AtomicStore>()(
  devtools(
    (set, get) => ({
      runtimeKey: activeRuntimeKey,
      directories: new Map(),
      getDirectoryState: (directory) => get().directories.get(normalizeDirectory(directory)) ?? null,
      loadOverview: (requestedDirectory, atomic) => {
        const directory = normalizeDirectory(requestedDirectory);
        if (!directory) return Promise.reject(new Error('Atomic requests require a directory'));
        const runtimeKey = getRuntimeKey();
        const inFlightKey = scopedKey(runtimeKey, directory, 'overview');
        // SAFETY: the overview channel key is written only with AtomicOverview promises.
        const existing = inFlightRequests.get(inFlightKey) as Promise<AtomicOverview> | undefined;
        if (existing) return existing;

        const token = startRequest(directory, 'overview');
        updateDirectory(directory, (state) => ({
          ...state,
          overview: { ...state.overview, loading: true, error: null },
        }));
        const promise = atomic.overview(directory).then((result) => {
          if (!isTokenCurrent(token)) throw new Error('Atomic request was superseded');
          updateDirectory(directory, (state) => ({ ...state, overview: { data: result, loading: false, error: null } }));
          return result;
        }).catch((error: Error) => {
          if (isTokenCurrent(token)) {
            updateDirectory(directory, (state) => ({
              ...state,
              overview: { ...state.overview, loading: false, error: errorMessage(error) },
            }));
          }
          throw error;
        }).finally(() => {
          if (inFlightRequests.get(inFlightKey) === promise) inFlightRequests.delete(inFlightKey);
        });
        inFlightRequests.set(inFlightKey, promise);
        return promise;
      },
      loadHistory: (directory, atomic, options) => {
        const requestKey = historyRequestKey(options);
        return runKeyedRequest({
          directory,
          channel: 'history',
          requestKey,
          request: () => atomic.history(normalizeDirectory(directory), options),
          read: (state) => state.histories,
          write: (state, histories) => ({ ...state, histories }),
        });
      },
      loadChange: (directory, change, atomic) => runKeyedRequest({
        directory,
        channel: 'change',
        requestKey: change,
        request: () => atomic.change(normalizeDirectory(directory), change),
        read: (state) => state.changes,
        write: (state, changes) => ({ ...state, changes }),
      }),
      loadDiff: (directory, request, atomic) => {
        const requestKey = getAtomicDiffRequestKey(request);
        return runKeyedRequest({
          directory,
          channel: 'diff',
          requestKey,
          request: () => atomic.diff(normalizeDirectory(directory), request),
          read: (state) => state.diffs,
          validate: (result) => {
            if (textEncoder.encode(result.diff).byteLength > ATOMIC_DIFF_CACHE_MAX_BYTES) {
              throw new Error('Atomic diff exceeds the cache byte limit');
            }
          },
          write: (state, diffs, result) => boundDiffCache(
            getRuntimeKey(),
            normalizeDirectory(directory),
            state,
            diffs,
            requestKey,
            result,
          ),
        });
      },
      loadProvenance: (directory, change, atomic) => runKeyedRequest({
        directory,
        channel: 'provenance',
        requestKey: change,
        request: () => atomic.provenance(normalizeDirectory(directory), change),
        read: (state) => state.provenance,
        write: (state, provenance) => ({ ...state, provenance }),
      }),
      resetForRuntimeSwitch: (runtimeKey) => {
        runtimeGeneration += 1;
        activeRuntimeKey = runtimeKey;
        requestGenerations.clear();
        inFlightRequests.clear();
        diffCacheSequenceByEntry.clear();
        set({ runtimeKey, directories: new Map() });
      },
    }),
    { name: 'atomic-store' },
  ),
);

export const useAtomicOverview = (directory: string): AtomicQueryState<AtomicOverview> =>
  useAtomicStore((state) => state.directories.get(normalizeDirectory(directory))?.overview ?? emptyQuery());

export const useAtomicHistory = (
  directory: string,
  options?: AtomicHistoryOptions,
): AtomicQueryState<AtomicHistoryResult> => useAtomicStore((state) =>
  state.directories.get(normalizeDirectory(directory))?.histories.get(historyRequestKey(options)) ?? emptyQuery());

export const useAtomicChange = (directory: string, change: string): AtomicQueryState<AtomicChangeDetail> =>
  useAtomicStore((state) => state.directories.get(normalizeDirectory(directory))?.changes.get(change) ?? emptyQuery());

export const useAtomicDiff = (
  directory: string,
  request: AtomicDiffRequest,
): AtomicQueryState<AtomicDiffResult> => {
  const requestKey = getAtomicDiffRequestKey(request);
  return useAtomicStore((state) =>
    state.directories.get(normalizeDirectory(directory))?.diffs.get(requestKey) ?? emptyQuery());
};

export const useAtomicProvenance = (directory: string, change: string): AtomicQueryState<AtomicProvenanceResult> =>
  useAtomicStore((state) => state.directories.get(normalizeDirectory(directory))?.provenance.get(change) ?? emptyQuery());

const requireAtomicAPI = (): AtomicAPI => {
  const atomic = getRegisteredRuntimeAPIs()?.atomic;
  if (!atomic) throw new Error('Atomic API is unavailable');
  return atomic;
};

const atomicRepositoryActions = {
  async ensure(directory: string): Promise<void> {
    const atomic = requireAtomicAPI();
    await Promise.allSettled([
      useAtomicStore.getState().loadOverview(directory, atomic),
      useAtomicStore.getState().loadHistory(directory, atomic),
    ]);
  },
  async refresh(directory: string): Promise<void> {
    const atomic = requireAtomicAPI();
    await Promise.allSettled([
      useAtomicStore.getState().loadOverview(directory, atomic),
      useAtomicStore.getState().loadHistory(directory, atomic),
    ]);
  },
  selectWorkingPath(directory: string, path: string): void {
    const atomic = requireAtomicAPI();
    void useAtomicStore.getState().loadDiff(directory, { target: 'working', paths: [path] }, atomic).catch(() => undefined);
  },
  selectChange(directory: string, change: string): void {
    const atomic = requireAtomicAPI();
    void useAtomicStore.getState().loadDiff(directory, { target: 'change', change }, atomic).catch(() => undefined);
    void useAtomicStore.getState().loadChange(directory, change, atomic).then((detail) => {
      if (detail.hasProvenance !== false) {
        void useAtomicStore.getState().loadProvenance(directory, change, atomic).catch(() => undefined);
      }
    }).catch(() => undefined);
  },
  // Load the change log for a specific view without touching the repository's
  // current view. Histories are cached per { limit, view }, so inspecting a
  // non-current view never clobbers the current view's cached log.
  selectHistoryView(directory: string, view: string): void {
    const atomic = requireAtomicAPI();
    void useAtomicStore.getState().loadHistory(directory, atomic, { view }).catch(() => undefined);
  },
};

export const useAtomicRepositoryActions = () => atomicRepositoryActions;
