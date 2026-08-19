import React from 'react';

import { Icon } from '@/components/icon/Icon';
import type { IconName } from '@/components/icon/icons';
import { Button } from '@/components/ui/button';
import type { AtomicChangeLedgerEntry, AtomicLedgerNode } from '@/lib/api/types';
import { useI18n } from '@/lib/i18n';
import type { I18nKey } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { useAtomicChange, useAtomicRepositoryActions } from '@/stores/useAtomicStore';

const StatePanel = ({ icon, title, description, error = false }: {
  icon: 'loader-4' | 'information' | 'error-warning';
  title: string;
  description?: string;
  error?: boolean;
}) => (
  <div className="flex h-full min-h-48 flex-col items-center justify-center gap-2 p-6 text-center">
    <Icon name={icon} className={cn('size-8 text-muted-foreground', error && 'text-[var(--status-error-foreground)]', icon === 'loader-4' && 'animate-spin')} />
    <h2 className="typography-ui-header text-foreground">{title}</h2>
    {description ? <p className="max-w-md typography-ui-label text-muted-foreground">{description}</p> : null}
  </div>
);

const HASH_DISPLAY_LENGTH = 12;

// Icon + accent + label i18n key per decision-node kind. Unknown kinds fall
// back to a neutral dot + the raw kind so a new Atomic node kind still renders.
const NODE_KINDS = {
  goal: { icon: 'target', color: 'var(--status-info)', labelKey: 'atomic.ledger.kind.goal' },
  exploration: { icon: 'search', color: 'var(--syntax-function)', labelKey: 'atomic.ledger.kind.exploration' },
  execution: { icon: 'terminal-box', color: 'var(--syntax-keyword)', labelKey: 'atomic.ledger.kind.execution' },
  commitment: { icon: 'git-commit', color: 'var(--status-success)', labelKey: 'atomic.ledger.kind.commitment' },
  todo: { icon: 'checkbox-circle', color: 'var(--syntax-type)', labelKey: 'atomic.ledger.kind.todo' },
  verification: { icon: 'shield-check', color: 'var(--status-success)', labelKey: 'atomic.ledger.kind.verification' },
  patch_proposal: { icon: 'git-pull-request', color: 'var(--syntax-string)', labelKey: 'atomic.ledger.kind.patchProposal' },
  llm_response: { icon: 'chat-4', color: 'var(--muted-foreground)', labelKey: 'atomic.ledger.kind.llmResponse' },
} satisfies Record<string, { icon: IconName; color: string; labelKey: I18nKey }>;

const nodeKindStyle = (kind: string): { icon: IconName; color: string; labelKey: I18nKey } | undefined =>
  // SAFETY: Object.hasOwn confirms `kind` is one of NODE_KINDS' own keys before the assertion.
  Object.hasOwn(NODE_KINDS, kind) ? NODE_KINDS[kind as keyof typeof NODE_KINDS] : undefined;

const LedgerNodeRow = ({ node }: { node: AtomicLedgerNode }) => {
  const { t } = useI18n();
  const style = nodeKindStyle(node.kind);
  const label = style ? t(style.labelKey) : node.kind;
  return (
    <li className="flex items-start gap-2 py-1">
      <span className="mt-0.5 flex size-4 shrink-0 items-center justify-center" style={{ color: style?.color ?? 'var(--muted-foreground)' }}>
        {style ? <Icon name={style.icon} className="size-3.5" /> : <span className="size-1.5 rounded-full bg-current" />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="mr-1.5 align-baseline typography-micro font-semibold uppercase" style={{ color: style?.color ?? 'var(--muted-foreground)' }}>
          {label}
        </span>
        <span className="whitespace-pre-wrap break-words typography-ui-label text-foreground">{node.summary}</span>
      </span>
    </li>
  );
};

const LedgerEntryCard = ({ entry }: { entry: AtomicChangeLedgerEntry }) => {
  const { t } = useI18n();
  return (
    <section className="rounded-lg border border-border bg-[var(--surface-elevated)] p-3">
      <div className="mb-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        {entry.agentDisplayName ? (
          <span className="typography-ui-label text-foreground">
            {entry.agentVendor ? t('atomic.ledger.agentWithVendor', { agent: entry.agentDisplayName, vendor: entry.agentVendor }) : entry.agentDisplayName}
          </span>
        ) : null}
        <span className="typography-micro text-muted-foreground">
          {t('atomic.ledger.counts', {
            nodes: entry.nodeCount ?? entry.nodes.length,
            edges: entry.edgeCount ?? entry.edges.length,
            changes: entry.changeCount ?? entry.changesExplained.length,
          })}
        </span>
      </div>
      {entry.nodes.length ? (
        <ol className="-my-1">
          {entry.nodes.map((node) => <LedgerNodeRow key={node.id} node={node} />)}
        </ol>
      ) : (
        <p className="typography-ui-label text-muted-foreground">{t('atomic.ledger.noNodes')}</p>
      )}
    </section>
  );
};

/**
 * The dedicated provenance-chain surface: renders a change's DECISION LEDGER —
 * the ordered goal/exploration/execution/commitment/… reasoning that produced
 * the change, projected from `atomic change`'s `ledger`. Opened when a user
 * activates a change/activity id in a provenance graph. Read-only.
 */
export const AtomicProvenanceView = ({ directory, changeHash }: { directory: string; changeHash: string }) => {
  const { t } = useI18n();
  const actions = useAtomicRepositoryActions();
  const changeQuery = useAtomicChange(directory, changeHash);

  React.useEffect(() => {
    if (directory && changeHash) actions.loadChange(directory, changeHash);
  }, [actions, directory, changeHash]);

  const change = changeQuery.data;
  const ledger = change?.ledger ?? [];

  return (
    <div className="flex h-full min-h-0 flex-col bg-background text-foreground">
      <header className="flex items-center justify-between gap-3 border-b border-border px-3 py-2">
        <div className="min-w-0">
          <h2 className="typography-ui-header text-foreground">{t('atomic.provenanceChain.title')}</h2>
          <p className="truncate typography-micro text-muted-foreground">
            <span className="font-mono">{changeHash.slice(0, HASH_DISPLAY_LENGTH)}</span>
            {change?.message ? <span> · {change.message}</span> : null}
          </p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-8 shrink-0"
          disabled={changeQuery.loading}
          onClick={() => actions.loadChange(directory, changeHash)}
          aria-label={t('atomic.action.refresh')}
          title={t('atomic.action.refresh')}
        >
          <Icon name="refresh" className={cn('size-4', changeQuery.loading && 'animate-spin')} />
        </Button>
      </header>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
        {changeQuery.loading && !change ? (
          <StatePanel icon="loader-4" title={t('atomic.state.loadingProvenance')} />
        ) : changeQuery.error && !change ? (
          <StatePanel icon="error-warning" title={t('atomic.state.initialError.title')} description={t('atomic.state.initialError.description')} error />
        ) : ledger.length ? (
          ledger.map((entry) => <LedgerEntryCard key={entry.graphHash} entry={entry} />)
        ) : (
          <StatePanel icon="information" title={t('atomic.ledger.empty.title')} description={t('atomic.ledger.empty.description')} />
        )}
      </div>
    </div>
  );
};
