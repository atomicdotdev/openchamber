import React from 'react';

import { Icon } from '@/components/icon/Icon';
import { Button } from '@/components/ui/button';
import { lazyWithChunkRecovery } from '@/lib/chunkLoadRecovery';
import type { AtomicDiffRequest, AtomicHistoryEntry, AtomicStatusEntry, AtomicUnavailableReason, AtomicView } from '@/lib/api/types';
import { useI18n } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import {
  useAtomicChange,
  useAtomicDiff,
  useAtomicHistory,
  useAtomicOverview,
  useAtomicProvenance,
  useAtomicRepositoryActions,
} from '@/stores/useAtomicStore';
import { AtomicProvenancePanel } from './AtomicProvenancePanel';

const PatchDiffViewer = lazyWithChunkRecovery(() => import('@/components/diff/PatchDiffViewer').then((module) => ({
  default: module.PatchDiffViewer,
})));

const RawPatch = ({ patch }: { patch: string }) => (
  <pre className="m-0 h-full overflow-auto whitespace-pre-wrap break-words bg-[var(--syntax-base-background)] p-3 typography-code text-[var(--syntax-base-foreground)]">
    {patch}
  </pre>
);

const StatePanel = ({ icon, title, description, error = false, action }: {
  icon: 'loader-4' | 'information' | 'error-warning' | 'checkbox-circle';
  title: string;
  description?: string;
  error?: boolean;
  action?: React.ReactNode;
}) => (
  <div className="flex h-full min-h-48 flex-col items-center justify-center gap-2 p-6 text-center">
    <Icon name={icon} className={cn('size-8 text-muted-foreground', error && 'text-[var(--status-error-foreground)]', icon === 'loader-4' && 'animate-spin')} />
    <h2 className="typography-ui-header text-foreground">{title}</h2>
    {description ? <p className="max-w-md typography-ui-label text-muted-foreground">{description}</p> : null}
    {action}
  </div>
);

const unavailableKeys = {
  'not-installed': { title: 'atomic.unavailable.cli.title', description: 'atomic.unavailable.cli.description' },
  'not-repository': { title: 'atomic.unavailable.repository.title', description: 'atomic.unavailable.repository.description' },
  unsupported: { title: 'atomic.unavailable.unsupported.title', description: 'atomic.unavailable.unsupported.description' },
  error: { title: 'atomic.unavailable.error.title', description: 'atomic.unavailable.error.description' },
} satisfies Record<AtomicUnavailableReason, { title: Parameters<ReturnType<typeof useI18n>['t']>[0]; description: Parameters<ReturnType<typeof useI18n>['t']>[0] }>;

const ViewRow = ({ view }: { view: AtomicView }) => {
  const { t } = useI18n();
  return (
    <div className={cn('rounded-md border px-3 py-2', view.current ? 'border-[var(--interactive-border)] bg-interactive-selection' : 'border-border bg-[var(--surface-elevated)]')}>
      <div className="flex items-center justify-between gap-3">
        <span className="truncate typography-ui-label text-foreground">{view.name}</span>
        {view.current ? <span className="typography-micro text-interactive-selection-foreground">{t('atomic.view.current')}</span> : null}
      </div>
      <div className="mt-1 flex flex-wrap gap-x-3 typography-micro text-muted-foreground">
        {view.state ? <span>{view.state}</span> : null}
        {view.changeCount !== null ? <span>{t('atomic.view.changeCount', { count: view.changeCount })}</span> : null}
      </div>
    </div>
  );
};

const statusLabel = (kind: AtomicStatusEntry['kind'], t: ReturnType<typeof useI18n>['t']) => t(`atomic.status.${kind}`);

const HistoryRow = ({ entry, selected, onSelect }: { entry: AtomicHistoryEntry; selected: boolean; onSelect: () => void }) => {
  const { locale, t } = useI18n();
  const timestamp = entry.timestamp ? new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(entry.timestamp)) : null;
  return (
    <Button type="button" variant="ghost" onClick={onSelect} className={cn('h-auto w-full justify-start rounded-md p-2 text-left', selected && 'bg-interactive-selection text-interactive-selection-foreground')}>
      <span className="min-w-0 flex-1">
        <span className="block truncate typography-ui-label">{entry.message}</span>
        <span className="mt-0.5 flex flex-wrap gap-x-2 typography-micro text-muted-foreground">
          <span className="font-mono">{entry.hash}</span>
          {entry.sequence !== null ? <span>{t('atomic.change.sequence', { sequence: entry.sequence })}</span> : null}
          {timestamp ? <span>{timestamp}</span> : null}
        </span>
      </span>
    </Button>
  );
};

export const AtomicRepositoryView = ({ directory }: { directory: string }) => {
  const { t } = useI18n();
  const [selection, setSelection] = React.useState<
    { kind: 'working'; path: string } | { kind: 'change'; hash: string } | null
  >(null);
  const overviewQuery = useAtomicOverview(directory);
  const historyQuery = useAtomicHistory(directory);
  const actions = useAtomicRepositoryActions();
  const selectedChangeHash = selection?.kind === 'change' ? selection.hash : '';
  const changeQuery = useAtomicChange(directory, selectedChangeHash);
  const diffRequest = React.useMemo<AtomicDiffRequest>(() => selection?.kind === 'change'
    ? { target: 'change', change: selection.hash }
    : { target: 'working', paths: selection?.kind === 'working' ? [selection.path] : [] }, [selection]);
  const diffQuery = useAtomicDiff(directory, diffRequest);
  const provenanceQuery = useAtomicProvenance(directory, selectedChangeHash);

  React.useEffect(() => {
    if (directory) void actions.ensure(directory);
  }, [actions, directory]);

  React.useEffect(() => {
    setSelection(null);
  }, [directory]);

  if (!directory) {
    return <StatePanel icon="information" title={t('atomic.unavailable.repository.title')} description={t('atomic.unavailable.repository.description')} />;
  }

  if (overviewQuery.loading && !overviewQuery.data) {
    return <StatePanel icon="loader-4" title={t('atomic.state.loading')} />;
  }
  if (overviewQuery.error && !overviewQuery.data) {
    return (
      <StatePanel
        icon="error-warning"
        title={t('atomic.state.initialError.title')}
        description={t('atomic.state.initialError.description')}
        error
        action={<Button type="button" variant="outline" size="sm" onClick={() => void actions.refresh(directory)}>{t('atomic.action.refresh')}</Button>}
      />
    );
  }
  if (!overviewQuery.data) {
    return <StatePanel icon="information" title={t('atomic.state.loading')} />;
  }
  if (overviewQuery.data.status === 'unavailable') {
    const keys = unavailableKeys[overviewQuery.data.reason];
    return <StatePanel icon="information" title={t(keys.title)} description={t(keys.description)} error={overviewQuery.data.reason === 'error'} />;
  }

  const { currentView, views, workingCopy } = overviewQuery.data;
  const selectedChange = changeQuery.data;
  const provenance = provenanceQuery.data;
  const selectedWorkingPath = selection?.kind === 'working' ? selection.path : null;
  const selectedHistoricalChange = selection?.kind === 'change' ? selection.hash : null;
  const selectWorkingPath = (path: string) => {
    setSelection({ kind: 'working', path });
    actions.selectWorkingPath(directory, path);
  };
  const selectChange = (hash: string) => {
    setSelection({ kind: 'change', hash });
    actions.selectChange(directory, hash);
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-background text-foreground">
      {(overviewQuery.data && overviewQuery.error) || (historyQuery.data && historyQuery.error) ? (
        <div role="status" className="border-b border-[var(--status-error-border)] bg-[var(--status-error-background)] px-3 py-2 typography-ui-label text-[var(--status-error-foreground)]">
          {t('atomic.state.refreshError')}
        </div>
      ) : null}
      <div className="flex items-center justify-between gap-3 border-b border-border px-3 py-2">
        <div className="min-w-0">
          <h2 className="typography-ui-header text-foreground">{t('atomic.title')}</h2>
          <p className="truncate typography-micro text-muted-foreground">{currentView.name}</p>
        </div>
        <Button type="button" variant="ghost" size="sm" disabled={overviewQuery.loading} onClick={() => void actions.refresh(directory)}>
          <Icon name="refresh" className={cn('size-4', overviewQuery.loading && 'animate-spin')} />
          {t('atomic.action.refresh')}
        </Button>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 overflow-auto lg:grid-cols-[18rem_minmax(0,1fr)] lg:overflow-hidden">
        <aside className="space-y-4 border-b border-border p-3 lg:overflow-y-auto lg:border-b-0 lg:border-r">
          <section>
            <h3 className="mb-2 typography-ui-label text-muted-foreground">{t('atomic.section.views')}</h3>
            <div className="space-y-1.5">{views.map((view) => <ViewRow key={view.name} view={view} />)}</div>
          </section>
          <section>
            <h3 className="mb-2 typography-ui-label text-muted-foreground">{t('atomic.section.working')}</h3>
            {workingCopy.clean ? (
              <div className="rounded-md border border-border p-3 typography-ui-label text-muted-foreground">{t('atomic.state.clean')}</div>
            ) : (
              <div className="space-y-1">
                {workingCopy.entries.map((entry) => (
                  <Button
                    key={`${entry.kind}:${entry.path}`}
                    type="button"
                    variant="ghost"
                    onClick={() => selectWorkingPath(entry.path)}
                    className={cn('h-auto w-full justify-start gap-2 rounded-md px-2 py-1.5 text-left', selectedWorkingPath === entry.path && 'bg-interactive-selection text-interactive-selection-foreground')}
                  >
                    <span className="w-16 shrink-0 typography-micro text-muted-foreground">{statusLabel(entry.kind, t)}</span>
                    <span className="min-w-0 truncate typography-code">{entry.path}</span>
                  </Button>
                ))}
              </div>
            )}
          </section>
          <section>
            <h3 className="mb-2 typography-ui-label text-muted-foreground">{t('atomic.section.history')}</h3>
            {historyQuery.data?.changes.length ? (
              <div className="space-y-1">{historyQuery.data.changes.map((entry) => (
                <HistoryRow key={entry.hash} entry={entry} selected={selectedHistoricalChange === entry.hash} onSelect={() => selectChange(entry.hash)} />
              ))}</div>
            ) : historyQuery.loading ? (
              <p className="p-2 typography-ui-label text-muted-foreground">{t('atomic.state.loading')}</p>
            ) : historyQuery.error ? (
              <p className="rounded-md border border-[var(--status-error-border)] bg-[var(--status-error-background)] p-3 typography-ui-label text-[var(--status-error-foreground)]">{t('atomic.state.initialError.description')}</p>
            ) : (
              <p className="rounded-md border border-border p-3 typography-ui-label text-muted-foreground">{t('atomic.state.noHistory')}</p>
            )}
          </section>
        </aside>

        <main className="min-h-[24rem] min-w-0 overflow-auto p-3 lg:min-h-0">
          {changeQuery.loading || diffQuery.loading ? (
            <StatePanel icon="loader-4" title={t('atomic.state.loadingDetail')} />
          ) : selectedChange ? (
            <div className="space-y-3">
              <section className="rounded-lg border border-border bg-[var(--surface-elevated)] p-3">
                <h3 className="typography-ui-header text-foreground">{selectedChange.message}</h3>
                <dl className="mt-2 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 typography-ui-label">
                  <dt className="text-muted-foreground">{t('atomic.change.hash')}</dt><dd className="font-mono">{selectedChange.hash}</dd>
                  {selectedChange.author ? <><dt className="text-muted-foreground">{t('atomic.change.author')}</dt><dd>{selectedChange.author}</dd></> : null}
                  {selectedChange.state ? <><dt className="text-muted-foreground">{t('atomic.change.state')}</dt><dd>{selectedChange.state}</dd></> : null}
                </dl>
                {selectedChange.hunks.length ? <ul className="mt-3 space-y-1">{selectedChange.hunks.map((hunk, index) => <li key={`${hunk.kind}:${hunk.path}:${index}`} className="typography-code text-muted-foreground">{hunk.kind} {hunk.path}</li>)}</ul> : null}
              </section>
              {diffQuery.data?.diff ? <React.Suspense fallback={<RawPatch patch={diffQuery.data.diff} />}><PatchDiffViewer patch={diffQuery.data.diff} /></React.Suspense> : diffQuery.error ? <StatePanel icon="error-warning" title={t('atomic.state.initialError.title')} description={t('atomic.state.initialError.description')} error /> : <StatePanel icon="information" title={t('atomic.state.noDiff')} />}
              {provenance?.status === 'available' ? <AtomicProvenancePanel document={provenance.document} /> : provenanceQuery.loading ? <StatePanel icon="loader-4" title={t('atomic.state.loadingProvenance')} /> : provenanceQuery.error || provenance?.reason === 'error' ? <StatePanel icon="error-warning" title={t('atomic.state.initialError.title')} description={t('atomic.state.initialError.description')} error /> : <StatePanel icon="information" title={t('atomic.state.noProvenance')} />}
            </div>
          ) : selectedWorkingPath ? (
            diffQuery.data?.diff ? <React.Suspense fallback={<RawPatch patch={diffQuery.data.diff} />}><PatchDiffViewer patch={diffQuery.data.diff} /></React.Suspense> : diffQuery.error ? <StatePanel icon="error-warning" title={t('atomic.state.initialError.title')} description={t('atomic.state.initialError.description')} error /> : <StatePanel icon="information" title={t('atomic.state.noDiff')} />
          ) : (
            <StatePanel icon="information" title={workingCopy.clean ? t('atomic.state.clean') : t('atomic.state.selectChange')} />
          )}
        </main>
      </div>
    </div>
  );
};
