import {
  AtomicChangeBridgeRequestSchema,
  AtomicDiffBridgeRequestSchema,
  AtomicDirectoryRequestSchema,
  AtomicHistoryBridgeRequestSchema,
  type AtomicChangeDetail,
  type AtomicDiffRequest,
  type AtomicDiffResult,
  type AtomicHistoryOptions,
  type AtomicHistoryResult,
  type AtomicOverview,
  type AtomicProvenanceResult,
  type AtomicVaultResult,
} from '../../ui/src/lib/api/types';
// @ts-expect-error The shared server runtime is JavaScript and intentionally owns its runtime contract.
import { AtomicRuntimeError, createAtomicRuntime } from '../../web/server/lib/atomic/runtime.js';

export interface AtomicRuntime {
  overview(directory: string): Promise<AtomicOverview>;
  diff(directory: string, request: AtomicDiffRequest): Promise<AtomicDiffResult>;
  history(directory: string, options?: AtomicHistoryOptions): Promise<AtomicHistoryResult>;
  change(directory: string, change: string): Promise<AtomicChangeDetail>;
  provenance(directory: string, change: string): Promise<AtomicProvenanceResult>;
  vault(directory: string): Promise<AtomicVaultResult>;
}

type BridgeMessage = { id: string; type: string; payload?: unknown };

interface ServerAtomicRuntime {
  overview(directory: string): Promise<AtomicOverview>;
  diff(directory: string, options: { change: string | null; paths: string[]; context: number }): Promise<AtomicDiffResult>;
  history(directory: string, options: { count: number; view: string | null }): Promise<AtomicHistoryResult>;
  change(directory: string, change: string): Promise<AtomicChangeDetail>;
  provenance(directory: string, change: string): Promise<AtomicProvenanceResult>;
  vault(directory: string): Promise<AtomicVaultResult>;
}

const unavailableReason = (code: string) => {
  if (code === 'CLI_MISSING') return 'not-installed' as const;
  if (code === 'NOT_REPOSITORY') return 'not-repository' as const;
  if (code === 'VERSION_INCOMPATIBLE') return 'unsupported' as const;
  return 'error' as const;
};

export const createVSCodeAtomicRuntime = (server: ServerAtomicRuntime = createAtomicRuntime()): AtomicRuntime => {
  const capabilityRead = async <T extends AtomicOverview | AtomicProvenanceResult | AtomicVaultResult>(operation: () => Promise<T>): Promise<T | Extract<AtomicOverview, { status: 'unavailable' }>> => {
    try {
      return await operation();
    } catch (error) {
      if (!(error instanceof AtomicRuntimeError)) throw error;
      // SAFETY: AtomicRuntimeError instances always define the stable string code used by server routes.
      const runtimeError = error as Error & { code: string };
      return { status: 'unavailable', reason: unavailableReason(runtimeError.code), message: runtimeError.message };
    }
  };

  return {
    overview: (directory) => capabilityRead(() => server.overview(directory)),
    diff: (directory, request) => server.diff(directory, {
      change: request.target === 'change' ? request.change : null,
      paths: request.target === 'working' ? request.paths ?? [] : [],
      context: 3,
    }),
    history: (directory, options) => server.history(directory, {
      count: Math.min(100, Math.max(1, options?.limit ?? 20)),
      view: options?.view ?? null,
    }),
    change: (directory, change) => server.change(directory, change),
    provenance: (directory, change) => capabilityRead(() => server.provenance(directory, change)),
    vault: (directory) => capabilityRead(() => server.vault(directory)),
  };
};

export async function handleAtomicBridgeMessage(message: BridgeMessage, runtime?: AtomicRuntime) {
  if (!message.type.startsWith('api:atomic:')) return null;
  if (!runtime) {
    return { id: message.id, type: message.type, success: false, error: 'Atomic runtime is unavailable in this VS Code host' };
  }

  try {
    let data: AtomicOverview | AtomicDiffResult | AtomicHistoryResult | AtomicChangeDetail | AtomicProvenanceResult | AtomicVaultResult;
    switch (message.type) {
      case 'api:atomic:overview': {
        const parsed = AtomicDirectoryRequestSchema.safeParse(message.payload);
        if (!parsed.success) throw new Error('A valid directory is required for Atomic overview');
        data = await runtime.overview(parsed.data.directory);
        break;
      }
      case 'api:atomic:diff': {
        const parsed = AtomicDiffBridgeRequestSchema.safeParse(message.payload);
        if (!parsed.success) throw new Error('Atomic diff target must be working or change');
        data = await runtime.diff(parsed.data.directory, parsed.data.request);
        break;
      }
      case 'api:atomic:history': {
        const parsed = AtomicHistoryBridgeRequestSchema.safeParse(message.payload);
        if (!parsed.success) throw new Error('Invalid Atomic history request');
        data = await runtime.history(parsed.data.directory, parsed.data.options);
        break;
      }
      case 'api:atomic:change': {
        const parsed = AtomicChangeBridgeRequestSchema.safeParse(message.payload);
        if (!parsed.success) throw new Error('A valid directory and change are required for Atomic change detail');
        data = await runtime.change(parsed.data.directory, parsed.data.change);
        break;
      }
      case 'api:atomic:provenance': {
        const parsed = AtomicChangeBridgeRequestSchema.safeParse(message.payload);
        if (!parsed.success) throw new Error('A valid directory and change are required for Atomic provenance');
        data = await runtime.provenance(parsed.data.directory, parsed.data.change);
        break;
      }
      case 'api:atomic:vault': {
        const parsed = AtomicDirectoryRequestSchema.safeParse(message.payload);
        if (!parsed.success) throw new Error('A valid directory is required for the Atomic vault');
        data = await runtime.vault(parsed.data.directory);
        break;
      }
      default:
        return { id: message.id, type: message.type, success: false, error: `Unknown Atomic message type: ${message.type}` };
    }
    return { id: message.id, type: message.type, success: true, data };
  } catch (error) {
    return {
      id: message.id,
      type: message.type,
      success: false,
      error: error instanceof Error ? error.message : 'Atomic runtime request failed',
    };
  }
}
