import { describe, expect, it, vi } from 'vitest';

import { AtomicRuntimeError, createAtomicRuntime } from './runtime.js';

const createExecFile = (responses) => {
  const calls = [];
  const execFile = vi.fn((binary, args, options, callback) => {
    calls.push({ binary, args, options });
    const response = responses.shift();
    callback(response.error ?? null, response.stdout ?? '', response.stderr ?? '');
  });
  return { execFile, calls };
};

describe('Atomic runtime CLI boundary', () => {
  it('parses text status and view output without a shell', async () => {
    const { execFile, calls } = createExecFile([
      { stdout: 'M  src/a.js\nAD src/new-directory\nDD src/old-directory\n?? notes.txt\n' },
      { stdout: '  dev\n* main\n' },
    ]);
    const runtime = createAtomicRuntime({ execFile });

    await expect(runtime.overview('/repo')).resolves.toEqual({
      status: 'ready',
      currentView: { name: 'main', scope: 'unknown', changeCount: null, state: null, current: true },
      workingCopy: { clean: false, entries: [
        { kind: 'modified', path: 'src/a.js' },
        { kind: 'added', path: 'src/new-directory' },
        { kind: 'deleted', path: 'src/old-directory' },
        { kind: 'untracked', path: 'notes.txt' },
      ] },
      views: [
        { name: 'dev', scope: 'unknown', changeCount: null, state: null, current: false },
        { name: 'main', scope: 'unknown', changeCount: null, state: null, current: true },
      ],
    });
    expect(calls[1].args).toEqual(['view', 'list', '--short', '--no-color']);
    expect(calls[0].binary).toBe('atomic');
    expect(calls[0].options).toMatchObject({
      cwd: '/repo',
      shell: false,
      timeout: 15_000,
      maxBuffer: 4 * 1024 * 1024,
    });
    expect(calls[0].options.env).toMatchObject({ NO_COLOR: '1', CLICOLOR: '0', RUST_LOG: 'off', TERM: 'dumb' });
  });

  it('marks incomplete history metadata instead of dropping the entry', async () => {
    const { execFile } = createExecFile([{ stdout: JSON.stringify([{
      sequence: 3,
      hash: 'ABCD2345',
      message: 'A change',
    }]) }]);
    const runtime = createAtomicRuntime({ execFile });

    const result = await runtime.history('/repo', { count: 10 });

    expect(result.changes).toHaveLength(1);
    expect(result.changes[0]).toEqual({
      hash: 'ABCD2345',
      sequence: 3,
      state: null,
      message: 'A change',
      timestamp: null,
      author: null,
      tagged: null,
    });
    expect(result.metadata).toEqual({
      completeness: 'partial',
      missing: ['author', 'timestamp', 'tagged'],
    });
  });

  it('rejects malformed history rather than returning authoritative empty data', async () => {
    const { execFile } = createExecFile([{ stdout: '{not-json' }]);
    const runtime = createAtomicRuntime({ execFile });

    await expect(runtime.history('/repo', { count: 20 })).rejects.toMatchObject({
      code: 'VERSION_INCOMPATIBLE',
    });
  });

  it('keeps the known missing author metadata explicit for empty history', async () => {
    const { execFile } = createExecFile([{ stdout: '[]' }]);
    const runtime = createAtomicRuntime({ execFile });

    await expect(runtime.history('/repo', { count: 20 })).resolves.toEqual({
      changes: [],
      metadata: { completeness: 'partial', missing: ['author'] },
    });
  });

  it('validates change JSON and normalizes hunks', async () => {
    const { execFile } = createExecFile([{ stdout: JSON.stringify({
      hash: 'ABCD2345',
      message: 'Change',
      authors: [],
      timestamp: '2026-08-18T12:00:00Z',
      dependencies: [],
      hunks: [{ hunk_type: 'Edit', path: 'src/a.js' }],
      has_provenance: true,
      sequence: 4,
    }) }]);
    const runtime = createAtomicRuntime({ execFile });

    await expect(runtime.change('/repo', 'ABCD2345')).resolves.toMatchObject({
      hash: 'ABCD2345',
      state: null,
      author: null,
      tagged: null,
      hunks: [{ kind: 'Edit', path: 'src/a.js' }],
      hasProvenance: true,
      sequence: 4,
      attestation: null,
    });
  });

  it('normalizes the change provenance object into an attestation', async () => {
    const { execFile } = createExecFile([{ stdout: JSON.stringify({
      hash: 'ABCD2345',
      message: 'Change',
      authors: [],
      timestamp: '2026-08-18T12:00:00Z',
      dependencies: [],
      hunks: [{ hunk_type: 'Edit', path: 'src/a.js' }],
      provenance: {
        vendor: 'Other("openrouter")',
        model: 'anthropic/claude-opus-4.8',
        tool: 'Cli("opencode")',
        suggestion_type: 'Complete',
        tokens: { input: 12, output: 1429, total: 1441 },
        cost: { amount_micros: 417296, currency: 'USD' },
        session_id: 'ses_fe907d359ffe',
        finish_reason: 'tool-calls',
        step_count: 7,
        metadata: [
          { key: 'turn_number', value: '7' },
          { key: 'agent_name', value: 'opencode' },
          { key: 42, value: 'ignored-non-string-key' },
        ],
      },
    }) }]);
    const runtime = createAtomicRuntime({ execFile });

    await expect(runtime.change('/repo', 'ABCD2345')).resolves.toMatchObject({
      attestation: {
        vendor: 'Other("openrouter")',
        model: 'anthropic/claude-opus-4.8',
        tool: 'Cli("opencode")',
        suggestionType: 'Complete',
        tokens: { input: 12, output: 1429, total: 1441 },
        cost: { amountMicros: 417296, currency: 'USD' },
        sessionId: 'ses_fe907d359ffe',
        finishReason: 'tool-calls',
        stepCount: 7,
        metadata: [
          { key: 'turn_number', value: '7' },
          { key: 'agent_name', value: 'opencode' },
        ],
      },
    });
  });

  it('degrades a malformed change provenance to a null attestation without failing', async () => {
    const { execFile } = createExecFile([{ stdout: JSON.stringify({
      hash: 'ABCD2345',
      message: 'Change',
      authors: [],
      timestamp: '2026-08-18T12:00:00Z',
      dependencies: [],
      hunks: [{ hunk_type: 'Edit', path: 'src/a.js' }],
      provenance: { tokens: 'not-an-object', cost: { amount_micros: 'nope' } },
    }) }]);
    const runtime = createAtomicRuntime({ execFile });

    await expect(runtime.change('/repo', 'ABCD2345')).resolves.toMatchObject({
      attestation: null,
    });
  });

  it('normalizes the change decision ledger, skipping malformed entries and nodes', async () => {
    const { execFile } = createExecFile([{ stdout: JSON.stringify({
      hash: 'ABCD2345',
      message: 'Change',
      authors: [],
      timestamp: '2026-08-18T12:00:00Z',
      dependencies: [],
      hunks: [{ hunk_type: 'Edit', path: 'src/a.js' }],
      ledger: [
        {
          graph_hash: 'GRAPH1',
          session_id: 'ses_1',
          agent_display_name: 'OpenCode',
          agent_vendor: 'openrouter',
          timestamp: 1787000000,
          node_count: 2,
          edge_count: 1,
          change_count: 1,
          changes_explained: ['ABCD2345', 42],
          previous: 'GRAPH0',
          nodes: [
            { id: 'n1', kind: 'goal', timestamp: 1, summary: 'do the thing', classified: false },
            { id: 'n2', kind: 'execution', timestamp: 2, summary: 'ran it', classified: true },
            { id: 'bad', kind: 'goal' },
          ],
          edges: [
            { from: 'n1', to: 'n2', kind: 'led_to' },
            { from: 'n1', kind: 'broken' },
          ],
        },
        { session_id: 'no-graph-hash' },
      ],
    }) }]);
    const runtime = createAtomicRuntime({ execFile });

    const result = await runtime.change('/repo', 'ABCD2345');
    expect(result.ledger).toHaveLength(1);
    expect(result.ledger[0]).toMatchObject({
      graphHash: 'GRAPH1',
      sessionId: 'ses_1',
      agentDisplayName: 'OpenCode',
      agentVendor: 'openrouter',
      nodeCount: 2,
      edgeCount: 1,
      changeCount: 1,
      changesExplained: ['ABCD2345'],
      previous: 'GRAPH0',
    });
    expect(result.ledger[0].nodes).toEqual([
      { id: 'n1', kind: 'goal', timestamp: 1, summary: 'do the thing', classified: false },
      { id: 'n2', kind: 'execution', timestamp: 2, summary: 'ran it', classified: true },
    ]);
    expect(result.ledger[0].edges).toEqual([{ from: 'n1', to: 'n2', kind: 'led_to' }]);
  });

  it('defaults a change with no ledger to an empty array', async () => {
    const { execFile } = createExecFile([{ stdout: JSON.stringify({
      hash: 'ABCD2345',
      message: 'Change',
      authors: [],
      timestamp: '2026-08-18T12:00:00Z',
      dependencies: [],
      hunks: [{ hunk_type: 'Edit', path: 'src/a.js' }],
    }) }]);
    const runtime = createAtomicRuntime({ execFile });

    await expect(runtime.change('/repo', 'ABCD2345')).resolves.toMatchObject({ ledger: [] });
  });

  it('validates provenance as JSON-LD', async () => {
    const graph = { '@context': 'https://www.w3.org/ns/prov.jsonld', '@graph': [] };
    const { execFile } = createExecFile([{ stdout: JSON.stringify(graph) }]);
    const runtime = createAtomicRuntime({ execFile });

    await expect(runtime.provenance('/repo', 'ABCD2345')).resolves.toEqual({ status: 'available', document: graph });
  });

  it('serializes commands for one repository to avoid Atomic database locks', async () => {
    let active = 0;
    let maximumActive = 0;
    const execFile = vi.fn((_binary, _args, _options, callback) => {
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      setTimeout(() => {
        active -= 1;
        callback(null, 'diff', '');
      }, 5);
    });
    const runtime = createAtomicRuntime({ execFile });

    await Promise.all([
      runtime.diff('/repo', { context: 3 }),
      runtime.diff('/repo', { context: 3 }),
    ]);

    expect(maximumActive).toBe(1);
  });

  it.each([
    [{ code: 'ENOENT' }, 'CLI_MISSING'],
    [{ stderr: 'Not in an Atomic repository (or any parent up to mount point)' }, 'NOT_REPOSITORY'],
    [{ stderr: 'Database already open. Cannot acquire lock.' }, 'BUSY'],
    [{ stderr: 'error: unexpected argument --format\nUsage: atomic log' }, 'VERSION_INCOMPATIBLE'],
  ])('classifies execution failures without exposing output', async (failure, code) => {
    const error = Object.assign(new Error('failed'), failure);
    const { execFile } = createExecFile([{ error }]);
    const runtime = createAtomicRuntime({ execFile });

    let caught;
    try {
      await runtime.diff('/repo', { context: 3 });
    } catch (runtimeError) {
      caught = runtimeError;
    }
    expect(caught).toBeInstanceOf(AtomicRuntimeError);
    expect(caught).toMatchObject({ code });
    expect(caught.message).not.toContain(failure.stderr ?? 'ENOENT');
  });

  it('projects the vault: intents with detail and memories with derivedFrom links', async () => {
    const { execFile, calls } = createExecFile([
      { stdout: JSON.stringify([{ id: 'PROJ::me::1', status: 'done', kind: 'feature', attested: 'fresh' }]) },
      { stdout: JSON.stringify([{ id: '01mem0000000000000000000001', kind: 'decision', status: 'active', attested: 'none' }]) },
      { stdout: JSON.stringify({
        '@id': 'urn:atomic:intent:01INT000000000000000000001',
        humanKey: 'PROJ::me::1',
        title: 'An intent',
        status: 'done',
        why: 'Because',
        hasAcceptanceCriterion: [{ '@id': 'urn:atomic:ac:01INT000000000000000000001-ac-1', acStatus: 'met', text: 'Done', verifiedBy: 'test', evidence: 'ran it' }],
        hasTask: [{ '@id': 'urn:atomic:task:01INT000000000000000000001-1', taskStatus: 'open', text: 'Do it', satisfies: ['urn:atomic:ac:01INT000000000000000000001-ac-1'], touchesFile: ['src/a.ts'] }],
        hasScopeIn: [{ '@id': 'x', text: 'in' }],
        hasScopeOut: [{ '@id': 'y', text: 'out' }],
        hasConstraint: [{ '@id': 'z', text: 'rule' }],
      }) },
      { stdout: JSON.stringify({
        '@id': 'urn:atomic:memory:01mem0000000000000000000001',
        memoryKind: 'decision',
        status: 'active',
        text: 'A memory',
        derivedFrom: ['urn:atomic:ac:01INT000000000000000000001-ac-1'],
      }) },
    ]);
    const runtime = createAtomicRuntime({ execFile });

    await expect(runtime.vault('/repo')).resolves.toEqual({
      status: 'available',
      intents: [{
        id: 'PROJ::me::1',
        urn: 'urn:atomic:intent:01INT000000000000000000001',
        title: 'An intent',
        status: 'done',
        kind: null,
        why: 'Because',
        acceptanceCriteria: [{ id: 'urn:atomic:ac:01INT000000000000000000001-ac-1', text: 'Done', status: 'met', verifiedBy: 'test', evidence: 'ran it' }],
        tasks: [{ id: 'urn:atomic:task:01INT000000000000000000001-1', text: 'Do it', status: 'open', satisfies: ['urn:atomic:ac:01INT000000000000000000001-ac-1'], touchesFile: ['src/a.ts'] }],
        scopeIn: ['in'],
        scopeOut: ['out'],
        constraints: ['rule'],
        attested: 'fresh',
      }],
      memories: [{
        id: '01mem0000000000000000000001',
        urn: 'urn:atomic:memory:01mem0000000000000000000001',
        kind: 'decision',
        status: 'active',
        text: 'A memory',
        derivedFrom: ['urn:atomic:ac:01INT000000000000000000001-ac-1'],
        attested: 'none',
      }],
    });

    expect(calls.map((call) => call.args)).toEqual([
      ['intent', 'list', '--json', '--no-color'],
      ['memory', 'list', '--json', '--no-color'],
      ['intent', 'show', 'PROJ::me::1', '--json', '--no-color'],
      ['memory', 'show', '01mem0000000000000000000001', '--json', '--no-color'],
    ]);
  });

  it('skips vault list rows without a usable id rather than failing the whole read', async () => {
    const { execFile } = createExecFile([
      { stdout: JSON.stringify([{ status: 'done' }, { id: '', status: 'done' }]) },
      { stdout: '[]' },
    ]);
    const runtime = createAtomicRuntime({ execFile });

    await expect(runtime.vault('/repo')).resolves.toEqual({ status: 'available', intents: [], memories: [] });
  });

  it('rejects malformed vault list output rather than returning an authoritative empty vault', async () => {
    const { execFile } = createExecFile([{ stdout: '{not-json' }]);
    const runtime = createAtomicRuntime({ execFile });

    await expect(runtime.vault('/repo')).rejects.toMatchObject({ code: 'VERSION_INCOMPATIBLE' });
  });

  it('rejects a malformed intent detail rather than dropping it silently', async () => {
    const { execFile } = createExecFile([
      { stdout: JSON.stringify([{ id: 'PROJ::me::1', status: 'done' }]) },
      { stdout: '[]' },
      { stdout: JSON.stringify({ '@id': 'urn:atomic:intent:x' }) },
    ]);
    const runtime = createAtomicRuntime({ execFile });

    await expect(runtime.vault('/repo')).rejects.toMatchObject({ code: 'VERSION_INCOMPATIBLE' });
  });
});
