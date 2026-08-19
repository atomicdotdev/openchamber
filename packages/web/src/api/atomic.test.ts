import { afterEach, describe, expect, it, vi } from 'vitest';

const runtimeFetchMock = vi.fn();

afterEach(() => runtimeFetchMock.mockReset());

describe('web Atomic API', () => {
  it('uses runtimeFetch at call time and encodes only supported diff targets', async () => {
    const { createWebAtomicAPI } = await import('./atomic');
    const api = createWebAtomicAPI(runtimeFetchMock);
    runtimeFetchMock.mockResolvedValueOnce(Response.json({ diff: 'working diff' }));
    runtimeFetchMock.mockResolvedValueOnce(Response.json({ diff: 'change diff' }));

    await expect(api.diff('/workspace', { target: 'working', paths: ['a.ts', 'b.ts'] })).resolves.toEqual({ diff: 'working diff' });
    await expect(api.diff('/workspace', { target: 'change', change: 'ABCD2345' })).resolves.toEqual({ diff: 'change diff' });

    expect(runtimeFetchMock).toHaveBeenNthCalledWith(1, '/api/atomic/diff', expect.objectContaining({
      method: 'GET', query: new URLSearchParams([['directory', '/workspace'], ['target', 'working'], ['path', 'a.ts'], ['path', 'b.ts']]),
    }));
    expect(runtimeFetchMock).toHaveBeenNthCalledWith(2, '/api/atomic/diff', expect.objectContaining({
      method: 'GET', query: new URLSearchParams({ directory: '/workspace', target: 'change', change: 'ABCD2345' }),
    }));
  });

  it('preserves unavailable overview and partial history metadata', async () => {
    const { createWebAtomicAPI } = await import('./atomic');
    const api = createWebAtomicAPI(runtimeFetchMock);
    runtimeFetchMock.mockResolvedValueOnce(Response.json({
      status: 'unavailable', reason: 'not-installed', message: 'Atomic is not installed',
    }));
    runtimeFetchMock.mockResolvedValueOnce(Response.json({
      changes: [{
        hash: 'ABCD2345', sequence: 4, state: 'STATE', message: 'Change', timestamp: null,
        author: null, tagged: false,
      }],
      metadata: { completeness: 'partial', missing: ['author', 'timestamp'] },
    }));

    await expect(api.overview('/workspace')).resolves.toEqual({
      status: 'unavailable', reason: 'not-installed', message: 'Atomic is not installed',
    });
    await expect(api.history('/workspace')).resolves.toMatchObject({
      changes: [{ author: null, timestamp: null }],
      metadata: { completeness: 'partial', missing: ['author', 'timestamp'] },
    });
  });

  it('rejects malformed successful payloads', async () => {
    const { createWebAtomicAPI } = await import('./atomic');
    runtimeFetchMock.mockResolvedValueOnce(Response.json({ status: 'ready', views: [] }));

    await expect(createWebAtomicAPI(runtimeFetchMock).overview('/workspace')).rejects.toThrow('Invalid Atomic overview response');
  });

  it('fetches the vault by directory only and parses intents with derived memories', async () => {
    const { createWebAtomicAPI } = await import('./atomic');
    const api = createWebAtomicAPI(runtimeFetchMock);
    runtimeFetchMock.mockResolvedValueOnce(Response.json({
      status: 'available',
      intents: [{
        id: 'PROJ::me::1', urn: 'urn:atomic:intent:01INT', title: 'An intent', status: 'done', kind: 'feature',
        why: 'Because', acceptanceCriteria: [], tasks: [], scopeIn: [], scopeOut: [], constraints: [], attested: 'fresh',
      }],
      memories: [{
        id: '01MEM', urn: 'urn:atomic:memory:01MEM', kind: 'decision', status: 'active', text: 'A memory',
        derivedFrom: ['urn:atomic:intent:01INT'], attested: 'none',
      }],
    }));

    await expect(api.vault('/workspace')).resolves.toMatchObject({
      status: 'available',
      intents: [{ id: 'PROJ::me::1', why: 'Because' }],
      memories: [{ id: '01MEM', derivedFrom: ['urn:atomic:intent:01INT'] }],
    });
    expect(runtimeFetchMock).toHaveBeenCalledWith('/api/atomic/vault', expect.objectContaining({
      method: 'GET', query: new URLSearchParams({ directory: '/workspace' }),
    }));
  });

  it('rejects a malformed vault payload', async () => {
    const { createWebAtomicAPI } = await import('./atomic');
    runtimeFetchMock.mockResolvedValueOnce(Response.json({ status: 'available', intents: [{}], memories: [] }));

    await expect(createWebAtomicAPI(runtimeFetchMock).vault('/workspace')).rejects.toThrow('Invalid Atomic vault response');
  });
});
