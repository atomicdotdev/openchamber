import {
  AtomicChangeDetailSchema,
  AtomicDiffResultSchema,
  AtomicHistoryResultSchema,
  AtomicOverviewSchema,
  AtomicProvenanceResultSchema,
  AtomicVaultResultSchema,
  type AtomicAPI,
  type AtomicChangeDetail,
  type AtomicDiffRequest,
  type AtomicDiffResult,
  type AtomicHistoryOptions,
  type AtomicHistoryResult,
  type AtomicOverview,
  type AtomicProvenanceResult,
  type AtomicVaultResult,
} from '@openchamber/ui/lib/api/types';
import { sendBridgeMessage } from './bridge';
import { z } from 'zod';

type AtomicBridgePayload =
  | { directory: string }
  | { directory: string; request: AtomicDiffRequest }
  | { directory: string; options?: AtomicHistoryOptions }
  | { directory: string; change: string };

type AtomicBridgeResult = AtomicOverview | AtomicDiffResult | AtomicHistoryResult | AtomicChangeDetail | AtomicProvenanceResult | AtomicVaultResult | null;

export type AtomicBridge = (type: string, payload: AtomicBridgePayload) => Promise<AtomicBridgeResult>;

const sendAtomicBridgeMessage: AtomicBridge = (type, payload) => sendBridgeMessage<AtomicBridgeResult>(type, payload);

const bridgeResult = async <TSchema extends z.ZodType>(
  bridge: AtomicBridge,
  type: string,
  payload: AtomicBridgePayload,
  label: string,
  schema: TSchema,
): Promise<z.output<TSchema>> => {
  const parsed = schema.safeParse(await bridge(type, payload));
  if (!parsed.success) throw new Error(`Invalid Atomic ${label} response`);
  return parsed.data;
};

export const createVSCodeAtomicAPI = (bridge: AtomicBridge = sendAtomicBridgeMessage): AtomicAPI => ({
  overview(directory) {
    return bridgeResult(bridge, 'api:atomic:overview', { directory }, 'overview', AtomicOverviewSchema);
  },
  diff(directory, request) {
    return bridgeResult(bridge, 'api:atomic:diff', { directory, request }, 'diff', AtomicDiffResultSchema);
  },
  history(directory, options) {
    return bridgeResult(bridge, 'api:atomic:history', { directory, options }, 'history', AtomicHistoryResultSchema);
  },
  change(directory, change) {
    return bridgeResult(bridge, 'api:atomic:change', { directory, change }, 'change', AtomicChangeDetailSchema);
  },
  provenance(directory, change) {
    return bridgeResult(bridge, 'api:atomic:provenance', { directory, change }, 'provenance', AtomicProvenanceResultSchema);
  },
  vault(directory) {
    return bridgeResult(bridge, 'api:atomic:vault', { directory }, 'vault', AtomicVaultResultSchema);
  },
});
