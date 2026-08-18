import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import type { AtomicBridge } from './atomic';

describe('VS Code webview Atomic API', () => {
  test('bridges requests and parses the response at the webview boundary', async () => {
    const originalWindow = globalThis.window;
    try {
      Object.defineProperty(globalThis, 'window', { configurable: true, value: new EventTarget() });
      const { createVSCodeAtomicAPI } = await import('./atomic');
      const requests: Array<{ type: string; payload?: Parameters<AtomicBridge>[1] }> = [];
      const bridge: AtomicBridge = async (type, payload) => {
        requests.push({ type, payload });
        return { status: 'available', document: { '@id': 'urn:atomic:change:ABCD2345' } };
      };

      const result = await createVSCodeAtomicAPI(bridge).provenance('/workspace', 'ABCD2345');

      assert.deepEqual(requests, [{ type: 'api:atomic:provenance', payload: { directory: '/workspace', change: 'ABCD2345' } }]);
      assert.deepEqual(result, { status: 'available', document: { '@id': 'urn:atomic:change:ABCD2345' } });
    } finally {
      Object.defineProperty(globalThis, 'window', { configurable: true, value: originalWindow });
    }
  });

  test('rejects malformed successful bridge responses', async () => {
    const originalWindow = globalThis.window;
    try {
      Object.defineProperty(globalThis, 'window', { configurable: true, value: new EventTarget() });
      const { createVSCodeAtomicAPI } = await import('./atomic');
      const bridge: AtomicBridge = async () => null;
      await assert.rejects(createVSCodeAtomicAPI(bridge).overview('/workspace'), /Invalid Atomic overview response/);
    } finally {
      Object.defineProperty(globalThis, 'window', { configurable: true, value: originalWindow });
    }
  });
});
