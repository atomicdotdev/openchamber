import {
  AtomicChangeDetailSchema,
  AtomicDiffResultSchema,
  AtomicHistoryResultSchema,
  AtomicOverviewSchema,
  AtomicProvenanceResultSchema,
  type AtomicAPI,
} from '@openchamber/ui/lib/api/types';
import { runtimeFetch } from '@openchamber/ui/lib/runtime-fetch';
import { z } from 'zod';

type AtomicFetch = typeof runtimeFetch;

const errorResponseSchema = z.object({ error: z.string() });

const getJson = async <TSchema extends z.ZodType>(
  fetchRuntime: AtomicFetch,
  path: string,
  query: URLSearchParams,
  label: string,
  schema: TSchema,
): Promise<z.output<TSchema>> => {
  const response = await fetchRuntime(path, { method: 'GET', headers: { Accept: 'application/json' }, query });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const parsedError = errorResponseSchema.safeParse(payload);
    throw new Error(parsedError.success ? parsedError.data.error : response.statusText || `Failed to load Atomic ${label}`);
  }
  const parsed = schema.safeParse(payload);
  if (!parsed.success) throw new Error(`Invalid Atomic ${label} response`);
  return parsed.data;
};

export const createWebAtomicAPI = (fetchRuntime: AtomicFetch = runtimeFetch): AtomicAPI => ({
  overview(directory) {
    return getJson(fetchRuntime, '/api/atomic/overview', new URLSearchParams({ directory }), 'overview', AtomicOverviewSchema);
  },
  diff(directory, request) {
    const query = new URLSearchParams({ directory, target: request.target });
    if (request.target === 'change') query.set('change', request.change);
    else for (const path of request.paths ?? []) query.append('path', path);
    return getJson(fetchRuntime, '/api/atomic/diff', query, 'diff', AtomicDiffResultSchema);
  },
  history(directory, options) {
    const query = new URLSearchParams({ directory });
    if (options?.limit !== undefined) query.set('limit', String(options.limit));
    if (options?.view) query.set('view', options.view);
    return getJson(fetchRuntime, '/api/atomic/history', query, 'history', AtomicHistoryResultSchema);
  },
  change(directory, change) {
    return getJson(fetchRuntime, '/api/atomic/change', new URLSearchParams({ directory, change }), 'change', AtomicChangeDetailSchema);
  },
  provenance(directory, change) {
    return getJson(fetchRuntime, '/api/atomic/provenance', new URLSearchParams({ directory, change }), 'provenance', AtomicProvenanceResultSchema);
  },
  provenanceTrace(directory, change) {
    return getJson(fetchRuntime, '/api/atomic/provenance/trace', new URLSearchParams({ directory, change }), 'provenance trace', AtomicProvenanceResultSchema);
  },
});
