import React from 'react';

import { Icon } from '@/components/icon/Icon';
import type { AtomicIntent, AtomicMemory, AtomicUnavailableReason } from '@/lib/api/types';
import { useI18n } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { useAtomicRepositoryActions, useAtomicVault } from '@/stores/useAtomicStore';

type TranslateFn = ReturnType<typeof useI18n>['t'];

const unavailableKeys = {
  'not-installed': { title: 'atomic.unavailable.cli.title', description: 'atomic.unavailable.cli.description' },
  'not-repository': { title: 'atomic.unavailable.repository.title', description: 'atomic.unavailable.repository.description' },
  unsupported: { title: 'atomic.unavailable.unsupported.title', description: 'atomic.unavailable.unsupported.description' },
  error: { title: 'atomic.unavailable.error.title', description: 'atomic.unavailable.error.description' },
} satisfies Record<AtomicUnavailableReason, { title: Parameters<TranslateFn>[0]; description: Parameters<TranslateFn>[0] }>;

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

// A single labelled field with a monospace/prose body. Used for why, scope, and
// constraint text so every block in an intent reads the same way.
const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="space-y-1">
    <div className="typography-ui-label text-muted-foreground">{label}</div>
    <div className="typography-ui-label whitespace-pre-wrap break-words text-foreground">{children}</div>
  </div>
);

const TextList = ({ items }: { items: readonly string[] }) => (
  <ul className="space-y-1">
    {items.map((item, index) => (
      <li key={index} className="flex gap-1.5">
        <span className="mt-1 size-1 shrink-0 rounded-full bg-muted-foreground" aria-hidden="true" />
        <span className="min-w-0 whitespace-pre-wrap break-words">{item}</span>
      </li>
    ))}
  </ul>
);

// A small status pill. Each tone maps to a semantic status color so intents,
// criteria, tasks, and memories are visually distinguishable at a glance.
const StatusPill = ({ label, tone }: { label: string; tone: 'success' | 'info' | 'warning' | 'neutral' }) => (
  <span
    className={cn(
      'inline-flex items-center rounded-full px-1.5 py-0.5 typography-micro font-medium',
      tone === 'success' && 'bg-[color-mix(in_oklch,var(--status-success)_18%,transparent)] text-[var(--status-success-foreground)]',
      tone === 'info' && 'bg-[color-mix(in_oklch,var(--status-info)_18%,transparent)] text-[var(--status-info-foreground)]',
      tone === 'warning' && 'bg-[color-mix(in_oklch,var(--status-warning)_18%,transparent)] text-[var(--status-warning-foreground)]',
      tone === 'neutral' && 'bg-interactive-hover text-muted-foreground',
    )}
  >
    {label}
  </span>
);

const criterionTone = (status: string): 'success' | 'info' | 'warning' | 'neutral' =>
  status === 'met' ? 'success' : status === 'unmet' ? 'warning' : 'neutral';

const intentStatusTone = (status: string): 'success' | 'info' | 'warning' | 'neutral' =>
  status === 'completed' || status === 'done' ? 'success'
    : status === 'active' || status === 'in_progress' ? 'info'
      : status === 'pending' || status === 'open' ? 'warning'
        : 'neutral';

const memoryKindIcon = 'sticky-note' as const;

const MemoryCard = ({ memory, t }: { memory: AtomicMemory; t: TranslateFn }) => (
  <div className="rounded-md border border-border bg-[var(--surface-base)] p-2.5">
    <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
      <Icon name={memoryKindIcon} className="size-3.5 shrink-0 text-muted-foreground" />
      {memory.kind ? <StatusPill label={memory.kind} tone="neutral" /> : null}
      {memory.attested && memory.attested !== 'none'
        ? <StatusPill label={t('atomic.vault.attested')} tone="success" />
        : null}
    </div>
    <p className="whitespace-pre-wrap break-words typography-ui-label text-foreground">{memory.text}</p>
  </div>
);

// One intent card: heading (title + status), the why, acceptance criteria,
// tasks, scope, and constraints, followed by the memories derived from it. Read
// only — nothing here mutates the vault.
const IntentCard = ({ intent, memories, t }: { intent: AtomicIntent; memories: AtomicMemory[]; t: TranslateFn }) => {
  const [expanded, setExpanded] = React.useState(false);

  return (
    <div className="rounded-lg border border-border bg-[var(--surface-elevated)]">
      <button
        type="button"
        onClick={() => setExpanded((value) => !value)}
        aria-expanded={expanded}
        className="flex w-full items-start gap-2 rounded-lg px-3 py-2.5 text-left outline-none hover:bg-interactive-hover focus-visible:bg-interactive-hover"
      >
        <Icon name="arrow-down-s" className={cn('mt-0.5 size-3.5 shrink-0 text-muted-foreground transition-transform', !expanded && '-rotate-90')} />
        <span className="min-w-0 flex-1">
          <span className="block break-words typography-ui-label font-semibold text-foreground">
            {intent.title ?? intent.id}
          </span>
          <span className="mt-1 flex flex-wrap items-center gap-1.5">
            <span className="font-mono typography-micro text-muted-foreground">{intent.id}</span>
            <StatusPill label={intent.status} tone={intentStatusTone(intent.status)} />
            {intent.kind ? <StatusPill label={intent.kind} tone="neutral" /> : null}
            {intent.attested && intent.attested !== 'none'
              ? <StatusPill label={t('atomic.vault.attested')} tone="success" />
              : null}
            {memories.length > 0
              ? <span className="typography-micro text-muted-foreground">{t('atomic.vault.derivedCount', { count: memories.length })}</span>
              : null}
          </span>
        </span>
      </button>

      {expanded ? (
        <div className="space-y-3 border-t border-border px-3 py-3">
          {intent.why ? <Field label={t('atomic.vault.field.why')}>{intent.why}</Field> : null}

          {intent.acceptanceCriteria.length > 0 ? (
            <div className="space-y-1.5">
              <div className="typography-ui-label text-muted-foreground">{t('atomic.vault.field.acceptanceCriteria')}</div>
              <ul className="space-y-1.5">
                {intent.acceptanceCriteria.map((criterion) => (
                  <li key={criterion.id} className="rounded-md border border-border bg-[var(--surface-base)] p-2">
                    <div className="mb-1 flex flex-wrap items-center gap-1.5">
                      <StatusPill label={criterion.status} tone={criterionTone(criterion.status)} />
                    </div>
                    <p className="whitespace-pre-wrap break-words typography-ui-label text-foreground">{criterion.text}</p>
                    {criterion.verifiedBy ? (
                      <p className="mt-1 typography-micro text-muted-foreground">
                        {t('atomic.vault.field.verifiedBy', { value: criterion.verifiedBy })}
                      </p>
                    ) : null}
                    {criterion.evidence ? (
                      <p className="typography-micro text-muted-foreground">
                        {t('atomic.vault.field.evidence', { value: criterion.evidence })}
                      </p>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {intent.tasks.length > 0 ? (
            <div className="space-y-1.5">
              <div className="typography-ui-label text-muted-foreground">{t('atomic.vault.field.tasks')}</div>
              <ul className="space-y-1.5">
                {intent.tasks.map((task) => (
                  <li key={task.id} className="rounded-md border border-border bg-[var(--surface-base)] p-2">
                    <div className="mb-1 flex flex-wrap items-center gap-1.5">
                      <StatusPill label={task.status} tone={task.status === 'done' ? 'success' : 'neutral'} />
                    </div>
                    <p className="whitespace-pre-wrap break-words typography-ui-label text-foreground">{task.text}</p>
                    {task.touchesFile.length > 0 ? (
                      <ul className="mt-1 space-y-0.5">
                        {task.touchesFile.map((path) => (
                          <li key={path} className="break-all font-mono typography-micro text-muted-foreground">{path}</li>
                        ))}
                      </ul>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {intent.scopeIn.length > 0 ? (
            <Field label={t('atomic.vault.field.scopeIn')}><TextList items={intent.scopeIn} /></Field>
          ) : null}
          {intent.scopeOut.length > 0 ? (
            <Field label={t('atomic.vault.field.scopeOut')}><TextList items={intent.scopeOut} /></Field>
          ) : null}
          {intent.constraints.length > 0 ? (
            <Field label={t('atomic.vault.field.constraints')}><TextList items={intent.constraints} /></Field>
          ) : null}

          {memories.length > 0 ? (
            <div className="space-y-1.5">
              <div className="typography-ui-label text-muted-foreground">{t('atomic.vault.derivedMemories')}</div>
              <div className="space-y-1.5">
                {memories.map((memory) => <MemoryCard key={memory.urn} memory={memory} t={t} />)}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
};

// Group memories under the intent they were derived from. A memory links to an
// intent through `derivedFrom` containing that intent's urn or one of its
// acceptance-criterion ids (memories are often derived from a specific
// criterion). A memory that matches no listed intent falls into the orphan set,
// so a fetch that returns memories but no matching intent never silently drops
// them.
const groupMemories = (intents: readonly AtomicIntent[], memories: readonly AtomicMemory[]) => {
  const intentUrnByLink = new Map<string, string>();
  for (const intent of intents) {
    intentUrnByLink.set(intent.urn, intent.urn);
    for (const criterion of intent.acceptanceCriteria) {
      intentUrnByLink.set(criterion.id, intent.urn);
    }
  }

  const byIntentUrn = new Map<string, AtomicMemory[]>();
  const orphans: AtomicMemory[] = [];
  for (const memory of memories) {
    const targetUrn = memory.derivedFrom.map((link) => intentUrnByLink.get(link)).find((urn) => urn !== undefined);
    if (targetUrn) {
      const list = byIntentUrn.get(targetUrn);
      if (list) list.push(memory);
      else byIntentUrn.set(targetUrn, [memory]);
    } else {
      orphans.push(memory);
    }
  }

  return { byIntentUrn, orphans };
};

/**
 * Read-only Atomic vault view for the active project directory: the directory's
 * intents (their why, acceptance criteria, tasks, scope, constraints) with the
 * memories that derive from each intent grouped beneath it, and any orphan
 * memories in their own section. Replaces the project-notes surface. It never
 * writes to the vault.
 */
export const AtomicVaultPanel: React.FC<{ directory: string | null }> = ({ directory }) => {
  const { t } = useI18n();
  const actions = useAtomicRepositoryActions();
  const vaultQuery = useAtomicVault(directory ?? '');

  React.useEffect(() => {
    if (!directory) return;
    void actions.loadVault(directory);
  }, [actions, directory]);

  if (!directory) {
    return <StatePanel icon="information" title={t('atomic.vault.noProject')} />;
  }

  const vault = vaultQuery.data;

  if (!vault && vaultQuery.loading) {
    return <StatePanel icon="loader-4" title={t('atomic.vault.loading')} />;
  }

  if (!vault && vaultQuery.error) {
    return (
      <StatePanel
        icon="error-warning"
        title={t('atomic.state.initialError.title')}
        description={t('atomic.state.initialError.description')}
        error
      />
    );
  }

  if (!vault) {
    return <StatePanel icon="information" title={t('atomic.vault.loading')} />;
  }

  if (vault.status === 'unavailable') {
    const keys = unavailableKeys[vault.reason];
    return <StatePanel icon="information" title={t(keys.title)} description={t(keys.description)} />;
  }

  const { byIntentUrn, orphans } = groupMemories(vault.intents, vault.memories);

  if (vault.intents.length === 0 && vault.memories.length === 0) {
    return <StatePanel icon="information" title={t('atomic.vault.empty.title')} description={t('atomic.vault.empty.description')} />;
  }

  return (
    <div className="h-full min-h-0 overflow-y-auto">
      <div className="space-y-4 p-3">
        {vaultQuery.error ? (
          <p className="rounded-md bg-interactive-hover px-3 py-2 typography-micro text-muted-foreground">
            {t('atomic.state.refreshError')}
          </p>
        ) : null}

        {vault.intents.length > 0 ? (
          <section aria-labelledby="atomic-vault-intents" className="space-y-2">
            <h3 id="atomic-vault-intents" className="typography-ui-header text-foreground">
              {t('atomic.vault.section.intents')}
            </h3>
            <div className="space-y-2">
              {vault.intents.map((intent) => (
                <IntentCard key={intent.urn} intent={intent} memories={byIntentUrn.get(intent.urn) ?? []} t={t} />
              ))}
            </div>
          </section>
        ) : null}

        {orphans.length > 0 ? (
          <section aria-labelledby="atomic-vault-memories" className="space-y-2">
            <h3 id="atomic-vault-memories" className="typography-ui-header text-foreground">
              {t('atomic.vault.section.otherMemories')}
            </h3>
            <div className="space-y-1.5">
              {orphans.map((memory) => <MemoryCard key={memory.urn} memory={memory} t={t} />)}
            </div>
          </section>
        ) : null}
      </div>
    </div>
  );
};
