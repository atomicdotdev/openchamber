import express from 'express';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';

import { AtomicRuntimeError } from './runtime.js';
import { registerAtomicRoutes } from './routes.js';

const createApp = (runtimeOverrides = {}, directoryResult = { directory: '/repo', error: null }) => {
  const atomicRuntime = {
    overview: vi.fn(async () => ({ status: 'ready', workingCopy: { clean: true, entries: [] }, views: [], currentView: null })),
    diff: vi.fn(async () => ({ diff: '' })),
    history: vi.fn(async () => ({ changes: [], metadata: { completeness: 'complete' } })),
    change: vi.fn(async () => ({ hash: 'ABCD2345' })),
    provenance: vi.fn(async () => ({ status: 'available', document: { '@context': 'x', '@graph': [] } })),
    vault: vi.fn(async () => ({ status: 'available', intents: [], memories: [] })),
    ...runtimeOverrides,
  };
  const resolveProjectDirectory = vi.fn(async () => directoryResult);
  const app = express();
  registerAtomicRoutes(app, { atomicRuntime, resolveProjectDirectory });
  return { app, atomicRuntime, resolveProjectDirectory };
};

describe('Atomic read-only routes', () => {
  it('resolves the project directory for overview', async () => {
    const { app, atomicRuntime, resolveProjectDirectory } = createApp();

    await request(app).get('/api/atomic/overview?directory=/repo').expect(200);

    expect(resolveProjectDirectory).toHaveBeenCalledOnce();
    expect(atomicRuntime.overview).toHaveBeenCalledWith('/repo');
  });

  it('clamps diff context and history count', async () => {
    const { app, atomicRuntime } = createApp();

    await request(app).get('/api/atomic/diff?target=working&context=200&path=src/a.js&path=src/b.js').expect(200);
    await request(app).get('/api/atomic/history?limit=0&view=dev').expect(200);

    expect(atomicRuntime.diff).toHaveBeenCalledWith('/repo', { change: null, paths: ['src/a.js', 'src/b.js'], context: 20 });
    expect(atomicRuntime.history).toHaveBeenCalledWith('/repo', { view: 'dev', count: 1 });
  });

  it.each([
    ['/api/atomic/diff?target=working&path=../secret', 'path parameter'],
    ['/api/atomic/diff?target=other', 'target parameter'],
    ['/api/atomic/history?limit=lots', 'limit parameter'],
    ['/api/atomic/change?change=not-a-hash', 'change parameter'],
    ['/api/atomic/provenance?change=123', 'change parameter'],
  ])('rejects invalid input before executing Atomic: %s', async (url, message) => {
    const { app, atomicRuntime } = createApp();

    const response = await request(app).get(url).expect(400);

    expect(response.body.error).toContain(message);
    expect(atomicRuntime.diff).not.toHaveBeenCalled();
    expect(atomicRuntime.history).not.toHaveBeenCalled();
    expect(atomicRuntime.change).not.toHaveBeenCalled();
    expect(atomicRuntime.provenance).not.toHaveBeenCalled();
  });

  it('passes validated hashes and views to detail operations', async () => {
    const { app, atomicRuntime } = createApp();

    await request(app).get('/api/atomic/change?change=ABCD2345').expect(200);
    await request(app).get('/api/atomic/provenance?change=ABCD2345').expect(200);

    expect(atomicRuntime.change).toHaveBeenCalledWith('/repo', 'ABCD2345');
    expect(atomicRuntime.provenance).toHaveBeenCalledWith('/repo', 'ABCD2345');
  });

  it.each([
    ['BUSY', 503],
    ['TIMEOUT', 504],
    ['OUTPUT_LIMIT', 413],
    ['COMMAND_FAILED', 502],
  ])('maps %s without returning CLI output', async (code, status) => {
    const error = new AtomicRuntimeError(code, 'Safe message', new Error('secret CLI output'));
    const { app } = createApp({ history: async () => { throw error; } });

    const response = await request(app).get('/api/atomic/history').expect(status);

    expect(response.body).toEqual({ error: 'Safe message', code });
    expect(response.text).not.toContain('secret CLI output');
  });

  it.each([
    ['CLI_MISSING', 'not-installed'],
    ['NOT_REPOSITORY', 'not-repository'],
    ['VERSION_INCOMPATIBLE', 'unsupported'],
    ['BUSY', 'error'],
  ])('returns overview capability failures as %s', async (code, reason) => {
    const error = new AtomicRuntimeError(code, 'Safe message', new Error('secret CLI output'));
    const { app } = createApp({ overview: async () => { throw error; } });

    const response = await request(app).get('/api/atomic/overview').expect(200);

    expect(response.body).toEqual({ status: 'unavailable', reason, message: 'Safe message' });
  });

  it('does not execute when project directory resolution fails', async () => {
    const { app, atomicRuntime } = createApp({}, { directory: null, error: 'directory parameter is required' });

    await request(app).get('/api/atomic/overview').expect(400);

    expect(atomicRuntime.overview).not.toHaveBeenCalled();
  });

  it('resolves the project directory for the vault', async () => {
    const { app, atomicRuntime, resolveProjectDirectory } = createApp();

    await request(app).get('/api/atomic/vault?directory=/repo').expect(200);

    expect(resolveProjectDirectory).toHaveBeenCalledOnce();
    expect(atomicRuntime.vault).toHaveBeenCalledWith('/repo');
  });

  it('returns vault capability failures as an unavailable result', async () => {
    const error = new AtomicRuntimeError('CLI_MISSING', 'Safe message', new Error('secret CLI output'));
    const { app } = createApp({ vault: async () => { throw error; } });

    const response = await request(app).get('/api/atomic/vault').expect(200);

    expect(response.body).toEqual({ status: 'unavailable', reason: 'not-installed', message: 'Safe message' });
    expect(response.text).not.toContain('secret CLI output');
  });
});
