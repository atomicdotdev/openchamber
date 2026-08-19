import React from 'react';

import { Icon } from '@/components/icon/Icon';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { useAtomicProvenanceTrace, useAtomicRepositoryActions } from '@/stores/useAtomicStore';
import { AtomicProvenanceDocument } from './AtomicProvenancePanel';

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

/**
 * The dedicated provenance-chain surface: shows the full provenance chain for
 * one change hash (walked across turn-parent links), opened when a user
 * activates a change/activity `@id` in a provenance graph. Read-only.
 */
export const AtomicProvenanceView = ({ directory, changeHash }: { directory: string; changeHash: string }) => {
  const { t } = useI18n();
  const actions = useAtomicRepositoryActions();
  const traceQuery = useAtomicProvenanceTrace(directory, changeHash);

  React.useEffect(() => {
    if (directory && changeHash) actions.loadProvenanceTrace(directory, changeHash);
  }, [actions, directory, changeHash]);

  const trace = traceQuery.data;

  return (
    <div className="flex h-full min-h-0 flex-col bg-background text-foreground">
      <header className="flex items-center justify-between gap-3 border-b border-border px-3 py-2">
        <div className="min-w-0">
          <h2 className="typography-ui-header text-foreground">{t('atomic.provenanceChain.title')}</h2>
          <p className="truncate font-mono typography-micro text-muted-foreground">{changeHash.slice(0, HASH_DISPLAY_LENGTH)}</p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-8 shrink-0"
          disabled={traceQuery.loading}
          onClick={() => actions.loadProvenanceTrace(directory, changeHash)}
          aria-label={t('atomic.action.refresh')}
          title={t('atomic.action.refresh')}
        >
          <Icon name="refresh" className={cn('size-4', traceQuery.loading && 'animate-spin')} />
        </Button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {traceQuery.loading && !trace ? (
          <StatePanel icon="loader-4" title={t('atomic.state.loadingProvenance')} />
        ) : trace?.status === 'available' ? (
          <AtomicProvenanceDocument document={trace.document} directory={directory} />
        ) : traceQuery.error || trace?.status === 'unavailable' ? (
          <StatePanel icon="error-warning" title={t('atomic.state.initialError.title')} description={t('atomic.state.initialError.description')} error />
        ) : (
          <StatePanel icon="information" title={t('atomic.state.noProvenance')} />
        )}
      </div>
    </div>
  );
};
