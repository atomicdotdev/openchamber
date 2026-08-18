import React from 'react';

import { Icon } from '@/components/icon/Icon';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { dropdownTriggerVariants } from '@/components/ui/dropdown-trigger';
import { lazyWithChunkRecovery } from '@/lib/chunkLoadRecovery';
import type { AtomicAttestation, AtomicDiffRequest, AtomicHistoryEntry, AtomicStatusEntry, AtomicUnavailableReason, AtomicView } from '@/lib/api/types';
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
import { parseAtomicChangeLineCounts, type AtomicFileLineCounts } from './atomicChangeFiles';

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

const statusLabel = (kind: AtomicStatusEntry['kind'], t: ReturnType<typeof useI18n>['t']) => t(`atomic.status.${kind}`);

// Single-letter status indicator + its color, mirroring the Git tab's ChangeRow
// so a working-copy entry reads the same in either rail. Each kind keeps a
// distinct semantic status token rather than a shared muted color.
const STATUS_INDICATORS = {
  added: { code: 'A', color: 'var(--status-success)' },
  modified: { code: 'M', color: 'var(--status-warning)' },
  deleted: { code: 'D', color: 'var(--status-error)' },
  renamed: { code: 'R', color: 'var(--status-info)' },
  untracked: { code: '?', color: 'var(--status-info)' },
  conflicted: { code: '!', color: 'var(--status-error)' },
} satisfies Record<AtomicStatusEntry['kind'], { code: string; color: string }>;

// Atomic returns one hunk per edited region, so a single-file change can carry
// many same-file hunks. Group them by path (first-appearance order) into one
// summary row per file. A file whose hunks carry different kinds keeps all
// distinct kinds so the summary never hides that the file was e.g. both renamed
// and edited. Added/removed line counts are joined from the change's own diff
// (parsed separately); a file with no resolvable diff section shows no counts.
type ChangeFileSummary = { path: string; kinds: string[]; counts: AtomicFileLineCounts | null };

const summarizeChangeFiles = (
  hunks: readonly { kind: string; path: string }[],
  lineCounts: ReadonlyMap<string, AtomicFileLineCounts>,
): ChangeFileSummary[] => {
  const byPath = new Map<string, ChangeFileSummary>();
  for (const hunk of hunks) {
    const existing = byPath.get(hunk.path);
    if (existing) {
      if (!existing.kinds.includes(hunk.kind)) existing.kinds.push(hunk.kind);
    } else {
      byPath.set(hunk.path, { path: hunk.path, kinds: [hunk.kind], counts: lineCounts.get(hunk.path) ?? null });
    }
  }
  return [...byPath.values()];
};

// Squared, full-width selectable list row. Deliberately not the shared Button:
// the Button's squircle/pill chrome and focus glow are wrong for a dense
// selection list, so this uses a rectangular hit target with a theme-bordered
// selected state (no rounding, edge-to-edge highlight) — matching the Git tab.
const selectableRowClass = (selected: boolean) => cn(
  'w-full border-l-2 border-transparent px-3 py-1.5 text-left outline-none transition-colors',
  'hover:bg-interactive-hover focus-visible:bg-interactive-hover',
  selected && 'border-l-[color:var(--interactive-border)] bg-interactive-selection text-interactive-selection-foreground',
);

// Collapsible section header, mirroring the Git ChangesPanel group header: a
// title, an optional count, and a chevron that rotates when collapsed.
const SectionHeader = ({ title, count, collapsed, onToggle }: {
  title: string;
  count?: number;
  collapsed: boolean;
  onToggle: () => void;
}) => (
  <button
    type="button"
    onClick={onToggle}
    aria-expanded={!collapsed}
    className="flex w-full items-center gap-2 px-3 py-2 text-left outline-none focus-visible:bg-interactive-hover"
  >
    <h3 className="typography-ui-header font-semibold text-foreground">{title}</h3>
    {count !== undefined ? <span className="typography-meta text-muted-foreground">{count}</span> : null}
    <Icon name="arrow-down-s" className={cn('ml-auto size-3.5 shrink-0 text-muted-foreground transition-transform', collapsed && '-rotate-90')} />
  </button>
);

// Top value-picker for Atomic views, mirroring the Git branch dropdown. Its
// chrome comes from `dropdownTriggerVariants`; the trigger only adds layout.
// Picking a view drives which view's history the History section reads; it does
// not switch the repository's current view (the panel is read-only).
const ViewPicker = ({ views, selectedView, onSelectView }: {
  views: AtomicView[];
  selectedView: string;
  onSelectView: (name: string) => void;
}) => {
  const { t } = useI18n();
  const active = views.find((view) => view.name === selectedView) ?? views.find((view) => view.current) ?? views[0] ?? null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={cn(dropdownTriggerVariants({ size: 'default' }), 'min-w-0 max-w-full flex-1')}
          aria-label={t('atomic.views.pickerLabel')}
        >
          <Icon name="git-branch" className="size-4 text-primary" />
          <span className="min-w-0 flex-1 truncate font-medium">{active?.name ?? t('atomic.views.none')}</span>
          <Icon name="arrow-down-s" className="size-4 opacity-60" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-72">
        {views.map((view) => (
          <DropdownMenuItem key={view.name} onSelect={() => onSelectView(view.name)}>
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate typography-ui-label text-foreground">{view.name}</span>
              <span className="flex flex-wrap gap-x-2 typography-micro text-muted-foreground">
                {view.current ? <span className="text-primary">{t('atomic.view.current')}</span> : null}
                {view.state ? <span>{view.state}</span> : null}
                {view.changeCount !== null ? <span>{t('atomic.view.changeCount', { count: view.changeCount })}</span> : null}
              </span>
            </span>
            {view.name === selectedView ? <Icon name="check" className="ml-auto size-4 shrink-0 text-primary" /> : null}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

const WorkingRow = ({ entry, selected, onSelect }: { entry: AtomicStatusEntry; selected: boolean; onSelect: () => void }) => {
  const { t } = useI18n();
  const indicator = STATUS_INDICATORS[entry.kind];
  return (
    <button type="button" onClick={onSelect} className={cn(selectableRowClass(selected), 'flex items-center gap-2')} title={statusLabel(entry.kind, t)}>
      <span className="w-4 shrink-0 text-center typography-micro font-semibold uppercase" style={{ color: indicator.color }} aria-label={statusLabel(entry.kind, t)}>
        {indicator.code}
      </span>
      <span className="min-w-0 flex-1 truncate typography-code text-foreground" style={{ direction: 'rtl', textAlign: 'left', unicodeBidi: 'plaintext' }}>{entry.path}</span>
    </button>
  );
};

const HistoryRow = ({ entry, selected, onSelect }: { entry: AtomicHistoryEntry; selected: boolean; onSelect: () => void }) => {
  const { locale, t } = useI18n();
  const timestamp = entry.timestamp ? new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(entry.timestamp)) : null;
  return (
    <button type="button" onClick={onSelect} className={selectableRowClass(selected)}>
      <span className="min-w-0 flex-1">
        <span className="block truncate typography-ui-label">{entry.message}</span>
        <span className="mt-0.5 flex flex-wrap gap-x-2 typography-micro text-muted-foreground">
          <span className="font-mono">{entry.hash}</span>
          {entry.sequence !== null ? <span>{t('atomic.change.sequence', { sequence: entry.sequence })}</span> : null}
          {timestamp ? <span>{timestamp}</span> : null}
        </span>
      </span>
    </button>
  );
};

// Format a micro-dollar cost as a currency string, e.g. 417296 micros USD →
// "$0.417296". amountMicros is millionths of the currency unit.
const formatAttestationCost = (cost: NonNullable<AtomicAttestation['cost']>, locale: string): string => {
  const amount = cost.amountMicros / 1_000_000;
  try {
    return new Intl.NumberFormat(locale, { style: 'currency', currency: cost.currency, maximumFractionDigits: 6 }).format(amount);
  } catch {
    // Unknown/invalid currency code: fall back to a plain number + code.
    return `${amount} ${cost.currency}`;
  }
};

// Readable AI attestation panel: the vendor/model/tool/tokens/cost/session and
// metadata the change carries inline. Rendered only when a change has an
// attestation (the parent gates on it), so it never shows an empty shell.
const AtomicAttestationPanel = ({ attestation }: { attestation: AtomicAttestation }) => {
  const { locale, t } = useI18n();
  const tokens = attestation.tokens;
  const rows: Array<{ label: string; value: string }> = [];
  if (attestation.vendor) rows.push({ label: t('atomic.attestation.vendor'), value: attestation.vendor });
  if (attestation.model) rows.push({ label: t('atomic.attestation.model'), value: attestation.model });
  if (attestation.tool) rows.push({ label: t('atomic.attestation.tool'), value: attestation.tool });
  if (attestation.suggestionType) rows.push({ label: t('atomic.attestation.type'), value: attestation.suggestionType });
  if (tokens && (tokens.input !== null || tokens.output !== null || tokens.total !== null)) {
    rows.push({
      label: t('atomic.attestation.tokens'),
      value: t('atomic.attestation.tokensValue', {
        input: tokens.input ?? 0,
        output: tokens.output ?? 0,
        total: tokens.total ?? 0,
      }),
    });
  }
  if (attestation.cost) rows.push({ label: t('atomic.attestation.cost'), value: formatAttestationCost(attestation.cost, locale) });
  if (attestation.sessionId) rows.push({ label: t('atomic.attestation.session'), value: attestation.sessionId });
  if (attestation.finishReason) rows.push({ label: t('atomic.attestation.finishReason'), value: attestation.finishReason });
  if (attestation.stepCount !== null) rows.push({ label: t('atomic.attestation.steps'), value: String(attestation.stepCount) });

  return (
    <section aria-labelledby="atomic-attestation-title" className="rounded-lg border border-border bg-[var(--surface-elevated)] p-3">
      <h3 id="atomic-attestation-title" className="mb-3 typography-ui-header text-foreground">
        {t('atomic.section.attestation')}
      </h3>
      <dl className="grid grid-cols-[minmax(5rem,auto)_minmax(0,1fr)] gap-x-3 gap-y-1">
        {rows.map((row) => (
          <React.Fragment key={row.label}>
            <dt className="typography-ui-label text-muted-foreground">{row.label}</dt>
            <dd className="min-w-0 break-words typography-code text-foreground">{row.value}</dd>
          </React.Fragment>
        ))}
      </dl>
      {attestation.metadata.length ? (
        <>
          <h4 className="mb-1 mt-3 typography-ui-label text-muted-foreground">{t('atomic.attestation.metadata')}</h4>
          <dl className="grid grid-cols-[minmax(5rem,auto)_minmax(0,1fr)] gap-x-3 gap-y-1">
            {attestation.metadata.map((entry) => (
              <React.Fragment key={entry.key}>
                <dt className="truncate typography-code text-muted-foreground" title={entry.key}>{entry.key}</dt>
                <dd className="min-w-0 break-words typography-code text-foreground">{entry.value}</dd>
              </React.Fragment>
            ))}
          </dl>
        </>
      ) : null}
    </section>
  );
};

export const AtomicRepositoryView = ({ directory }: { directory: string }) => {
  const { t } = useI18n();
  const [selection, setSelection] = React.useState<
    { kind: 'working'; path: string } | { kind: 'change'; hash: string } | null
  >(null);
  // Which view's history the History section shows. Empty string means the
  // repository's current view (the default, un-scoped history request).
  const [selectedViewName, setSelectedViewName] = React.useState<string>('');
  const [changesCollapsed, setChangesCollapsed] = React.useState(false);
  const [historyCollapsed, setHistoryCollapsed] = React.useState(false);
  const overviewQuery = useAtomicOverview(directory);
  const isCurrentViewSelected = selectedViewName === '' || overviewQuery.data?.status === 'ready' && overviewQuery.data.currentView.name === selectedViewName;
  const historyQuery = useAtomicHistory(directory, isCurrentViewSelected ? undefined : { view: selectedViewName });
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
    setSelectedViewName('');
  }, [directory]);

  const selectView = (name: string) => {
    const activeName = selectedViewName || (overviewQuery.data?.status === 'ready' ? overviewQuery.data.currentView.name : '');
    if (name === activeName) return;
    setSelectedViewName(name);
    // A picked view scopes the History section; the previously selected change
    // or working path belongs to the old view, so reset the detail region.
    setSelection(null);
    if (overviewQuery.data?.status === 'ready' && overviewQuery.data.currentView.name !== name) {
      actions.selectHistoryView(directory, name);
    }
  };

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
  // Per-file line counts come from the selected change's own unified diff; until
  // that diff loads a file simply shows no counts (never a fabricated one).
  const changeLineCounts = selection?.kind === 'change' && diffQuery.data?.diff
    ? parseAtomicChangeLineCounts(diffQuery.data.diff)
    : new Map<string, AtomicFileLineCounts>();
  const changeFiles = selectedChange ? summarizeChangeFiles(selectedChange.hunks, changeLineCounts) : [];
  const provenance = provenanceQuery.data;
  const selectedWorkingPath = selection?.kind === 'working' ? selection.path : null;
  const selectedHistoricalChange = selection?.kind === 'change' ? selection.hash : null;
  const activeViewName = selectedViewName || currentView.name;
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

      <header className="flex items-center gap-2 px-3 py-2">
        <ViewPicker views={views} selectedView={activeViewName} onSelectView={selectView} />
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-8 shrink-0"
          disabled={overviewQuery.loading}
          onClick={() => void actions.refresh(directory)}
          aria-label={t('atomic.action.refresh')}
          title={t('atomic.action.refresh')}
        >
          <Icon name="refresh" className={cn('size-4', overviewQuery.loading && 'animate-spin')} />
        </Button>
      </header>

      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        <section className="border-t border-border">
          <SectionHeader
            title={t('atomic.section.changes')}
            count={workingCopy.entries.length}
            collapsed={changesCollapsed}
            onToggle={() => setChangesCollapsed((value) => !value)}
          />
          {changesCollapsed ? null : workingCopy.clean ? (
            <p className="px-3 pb-3 typography-ui-label text-muted-foreground">{t('atomic.state.clean')}</p>
          ) : (
            <div role="list" aria-label={t('atomic.section.changes')}>
              {workingCopy.entries.map((entry) => (
                <WorkingRow
                  key={`${entry.kind}:${entry.path}`}
                  entry={entry}
                  selected={selectedWorkingPath === entry.path}
                  onSelect={() => selectWorkingPath(entry.path)}
                />
              ))}
            </div>
          )}
        </section>

        <section className="border-t border-border">
          <SectionHeader
            title={t('atomic.section.history')}
            count={historyQuery.data?.changes.length}
            collapsed={historyCollapsed}
            onToggle={() => setHistoryCollapsed((value) => !value)}
          />
          {historyCollapsed ? null : historyQuery.data?.changes.length ? (
            <div role="list" aria-label={t('atomic.section.history')}>
              {historyQuery.data.changes.map((entry) => (
                <HistoryRow key={entry.hash} entry={entry} selected={selectedHistoricalChange === entry.hash} onSelect={() => selectChange(entry.hash)} />
              ))}
            </div>
          ) : historyQuery.loading ? (
            <p className="px-3 pb-3 typography-ui-label text-muted-foreground">{t('atomic.state.loading')}</p>
          ) : historyQuery.error ? (
            <p className="mx-3 mb-3 rounded-md border border-[var(--status-error-border)] bg-[var(--status-error-background)] p-3 typography-ui-label text-[var(--status-error-foreground)]">{t('atomic.state.initialError.description')}</p>
          ) : (
            <p className="px-3 pb-3 typography-ui-label text-muted-foreground">{t('atomic.state.noHistory')}</p>
          )}
        </section>

        <section className="min-h-[16rem] flex-1 border-t border-border p-3">
          {changeQuery.loading || diffQuery.loading ? (
            <StatePanel icon="loader-4" title={t('atomic.state.loadingDetail')} />
          ) : selectedChange ? (
            <div className="space-y-3">
              <div className="rounded-lg border border-border bg-[var(--surface-elevated)] p-3">
                <h3 className="typography-ui-header text-foreground">{selectedChange.message}</h3>
                <dl className="mt-2 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 typography-ui-label">
                  <dt className="text-muted-foreground">{t('atomic.change.hash')}</dt><dd className="font-mono">{selectedChange.hash}</dd>
                  {selectedChange.author ? <><dt className="text-muted-foreground">{t('atomic.change.author')}</dt><dd>{selectedChange.author}</dd></> : null}
                  {selectedChange.state ? <><dt className="text-muted-foreground">{t('atomic.change.state')}</dt><dd>{selectedChange.state}</dd></> : null}
                </dl>
                {changeFiles.length ? <ul className="mt-3 space-y-1">{changeFiles.map((file) => (
                  <li key={file.path} className="flex items-baseline gap-2 typography-code text-muted-foreground">
                    <span className="min-w-0 flex-1 truncate"><span className="text-foreground">{file.kinds.join(', ')}</span> {file.path}</span>
                    {file.counts ? (
                      <span className="shrink-0 typography-micro">
                        <span className="text-[var(--status-success)]">+{file.counts.added}</span>
                        <span className="mx-0.5 text-muted-foreground">/</span>
                        <span className="text-[var(--status-error)]">-{file.counts.removed}</span>
                      </span>
                    ) : null}
                  </li>
                ))}</ul> : null}
              </div>
              {selectedChange.attestation ? <AtomicAttestationPanel attestation={selectedChange.attestation} /> : null}
              {diffQuery.data?.diff ? <React.Suspense fallback={<RawPatch patch={diffQuery.data.diff} />}><PatchDiffViewer patch={diffQuery.data.diff} /></React.Suspense> : diffQuery.error ? <StatePanel icon="error-warning" title={t('atomic.state.initialError.title')} description={t('atomic.state.initialError.description')} error /> : <StatePanel icon="information" title={t('atomic.state.noDiff')} />}
              {provenance?.status === 'available' ? <AtomicProvenancePanel document={provenance.document} /> : provenanceQuery.loading ? <StatePanel icon="loader-4" title={t('atomic.state.loadingProvenance')} /> : provenanceQuery.error || provenance?.reason === 'error' ? <StatePanel icon="error-warning" title={t('atomic.state.initialError.title')} description={t('atomic.state.initialError.description')} error /> : <StatePanel icon="information" title={t('atomic.state.noProvenance')} />}
            </div>
          ) : selectedWorkingPath ? (
            diffQuery.data?.diff ? <React.Suspense fallback={<RawPatch patch={diffQuery.data.diff} />}><PatchDiffViewer patch={diffQuery.data.diff} /></React.Suspense> : diffQuery.error ? <StatePanel icon="error-warning" title={t('atomic.state.initialError.title')} description={t('atomic.state.initialError.description')} error /> : <StatePanel icon="information" title={t('atomic.state.noDiff')} />
          ) : (
            <StatePanel icon="information" title={workingCopy.clean ? t('atomic.state.clean') : t('atomic.state.selectChange')} />
          )}
        </section>
      </div>
    </div>
  );
};
