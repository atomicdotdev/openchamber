import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { createVSCodeAtomicRuntime, handleAtomicBridgeMessage, type AtomicRuntime } from './bridge-atomic-runtime';
// @ts-expect-error The shared server runtime is JavaScript and intentionally owns its runtime contract.
import { AtomicRuntimeError } from '../../web/server/lib/atomic/runtime.js';

const history = { changes: [], metadata: { completeness: 'complete' as const } };

const createRuntime = () => ({
  overview: async () => ({ status: 'unavailable' as const, reason: 'not-repository' as const, message: 'Not a repository' }),
  diff: async (directory, request) => ({ diff: JSON.stringify({ directory, request }) }),
  history: async () => history,
  change: async (_directory, change) => ({
    hash: change, sequence: null, state: null, message: '', timestamp: null, author: null, tagged: null,
    hunks: [], hasProvenance: null, attestation: null, ledger: [],
  }),
  provenance: async () => ({ status: 'unavailable' as const, reason: 'unsupported' as const, message: 'Unavailable' }),
  vault: async () => ({ status: 'available' as const, intents: [], memories: [] }),
}) satisfies AtomicRuntime;

describe('VS Code Atomic runtime bridge', () => {
  test('adapts shared requests to the server Atomic runtime contract', async () => {
    const calls: Array<{ directory: string; options: { change: string | null; paths: string[]; context: number } }> = [];
    const server = {
      overview: async () => ({ status: 'unavailable' as const, reason: 'not-repository' as const, message: 'No repository' }),
      diff: async (directory: string, options: { change: string | null; paths: string[]; context: number }) => {
        calls.push({ directory, options });
        return { diff: '' };
      },
      history: async () => history,
      change: async (_directory: string, change: string) => ({
        hash: change, sequence: null, state: null, message: '', timestamp: null, author: null, tagged: null,
        hunks: [], hasProvenance: null, attestation: null, ledger: [],
      }),
      provenance: async () => ({ status: 'unavailable' as const, reason: 'unsupported' as const, message: 'Unavailable' }),
      vault: async () => ({ status: 'available' as const, intents: [], memories: [] }),
    };
    const runtime = createVSCodeAtomicRuntime(server);

    await runtime.diff('/workspace', { target: 'working', paths: ['src/a.ts'] });

    assert.deepEqual(calls, [{ directory: '/workspace', options: { change: null, paths: ['src/a.ts'], context: 3 } }]);
  });

  test('parses read requests and delegates to the Atomic runtime', async () => {
    const response = await handleAtomicBridgeMessage({
      id: '1',
      type: 'api:atomic:diff',
      payload: { directory: ' /workspace ', request: { target: 'change', change: 'ABCD2345' } },
    }, createRuntime());

    assert.deepEqual(response, {
      id: '1', type: 'api:atomic:diff', success: true,
      data: { diff: JSON.stringify({ directory: '/workspace', request: { target: 'change', change: 'ABCD2345' } }) },
    });
  });

  test('rejects mutation-like and malformed diff requests before delegation', async () => {
    let calls = 0;
    const base = createRuntime();
    const runtime: AtomicRuntime = {
      ...base,
      diff: async () => {
        calls += 1;
        return { diff: '' };
      },
    };
    const response = await handleAtomicBridgeMessage({
      id: '2', type: 'api:atomic:diff', payload: { directory: '/workspace', request: { target: 'record' } },
    }, runtime);

    assert.equal(response?.success, false);
    assert.match(response?.error ?? '', /working or change/);
    assert.equal(calls, 0);
  });

  test('returns an explicit error when the server Atomic runtime is unavailable', async () => {
    const response = await handleAtomicBridgeMessage({
      id: '3', type: 'api:atomic:overview', payload: { directory: '/workspace' },
    });

    assert.deepEqual(response, {
      id: '3', type: 'api:atomic:overview', success: false,
      error: 'Atomic runtime is unavailable in this VS Code host',
    });
  });

  test('delegates the directory-only vault request', async () => {
    const response = await handleAtomicBridgeMessage({
      id: '4', type: 'api:atomic:vault', payload: { directory: ' /workspace ' },
    }, createRuntime());

    assert.deepEqual(response, {
      id: '4', type: 'api:atomic:vault', success: true,
      data: { status: 'available', intents: [], memories: [] },
    });
  });

  test('classifies a CLI failure during vault as an unavailable result', async () => {
    const runtime = createVSCodeAtomicRuntime({
      overview: async () => ({ status: 'unavailable' as const, reason: 'not-repository' as const, message: 'No repository' }),
      diff: async () => ({ diff: '' }),
      history: async () => history,
      change: async (_directory: string, change: string) => ({
        hash: change, sequence: null, state: null, message: '', timestamp: null, author: null, tagged: null,
        hunks: [], hasProvenance: null, attestation: null, ledger: [],
      }),
      provenance: async () => ({ status: 'unavailable' as const, reason: 'unsupported' as const, message: 'Unavailable' }),
      vault: async () => {
        throw new AtomicRuntimeError('CLI_MISSING', 'Atomic CLI is not installed');
      },
    });

    const result = await runtime.vault('/workspace');

    assert.deepEqual(result, { status: 'unavailable', reason: 'not-installed', message: 'Atomic CLI is not installed' });
  });
});
