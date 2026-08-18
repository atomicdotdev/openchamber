import React from 'react';

import type { AtomicJsonValue } from '@/lib/api/types';
import { useI18n } from '@/lib/i18n';

const ProvenanceValue = ({ value, depth = 0 }: { value: AtomicJsonValue; depth?: number }) => {
  if (value === null) {
    return <span className="text-muted-foreground">null</span>;
  }
  if (!Array.isArray(value) && Object.getPrototypeOf(value) !== Object.prototype) {
    return <span className="break-words text-[var(--syntax-base-foreground)]">{String(value)}</span>;
  }

  const entries: Array<[string, AtomicJsonValue]> = Array.isArray(value)
    ? value.map((entry, index) => [String(index), entry])
    : Object.entries(value);

  return (
    <dl className={depth === 0 ? 'space-y-1' : 'ml-3 space-y-1 border-l border-border pl-3'}>
      {entries.map(([key, entry]) => (
        <div key={key} className="grid min-w-0 grid-cols-[minmax(5rem,auto)_minmax(0,1fr)] gap-3 py-0.5">
          <dt className="truncate typography-code text-muted-foreground" title={key}>{key}</dt>
          <dd className="min-w-0 typography-code text-foreground">
            <ProvenanceValue value={entry} depth={depth + 1} />
          </dd>
        </div>
      ))}
    </dl>
  );
};

export const AtomicProvenancePanel = ({ document }: { document: AtomicJsonValue }) => {
  const { t } = useI18n();

  return (
    <section aria-labelledby="atomic-provenance-title" className="rounded-lg border border-border bg-[var(--surface-elevated)] p-3">
      <h3 id="atomic-provenance-title" className="mb-3 typography-ui-header text-foreground">
        {t('atomic.section.provenance')}
      </h3>
      <ProvenanceValue value={document} />
    </section>
  );
};
