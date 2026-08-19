import React from 'react';

import { Icon } from '@/components/icon/Icon';
import type { AtomicJsonValue } from '@/lib/api/types';
import { useI18n } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { useUIStore } from '@/stores/useUIStore';

const HASH_PATTERN = /[A-Z2-7]{40,52}/i;

/**
 * Extract an Atomic change hash from a PROV `@id`/relation value, if one is
 * addressable there. Change and activity ids embed the change's Base32 hash:
 *   urn:atomic:change:<HASH>
 *   urn:atomic:activity:<session>#<HASH>
 *   urn:atomic:provgraph:<HASH>
 * A `did:` person or a bare `urn:atomic:agent:*` has no change hash → null, so
 * those ids stay non-activatable.
 */
const changeHashFromAtomicId = (value: string): string | null => {
  if (!/^urn:atomic:(?:change|activity|provgraph):/.test(value)) {
    return null;
  }
  const afterHash = value.includes('#') ? value.slice(value.indexOf('#') + 1) : value;
  const match = HASH_PATTERN.exec(afterHash);
  return match ? match[0] : null;
};

const HASH_DISPLAY_LENGTH = 12;

// Structural classification of AtomicJsonValue without `typeof`: the value is a
// recursive JSON union, so branch on null, array, and plain-object shape and
// treat everything else as a scalar. Mirrors the discriminators the previous
// renderer used.
type AtomicJsonObject = { [key: string]: AtomicJsonValue };

const isJsonArray = (value: AtomicJsonValue): value is AtomicJsonValue[] => Array.isArray(value);
const isJsonObject = (value: AtomicJsonValue): value is AtomicJsonObject =>
  value !== null && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
const asJsonString = (value: AtomicJsonValue): string | null =>
  value !== null && !isJsonArray(value) && !isJsonObject(value) && value.constructor === String ? value : null;

// A single scalar value. Identifiers (URN/DID) render monospace and wrap on any
// character so a long hash fills the line and continues on the next — never one
// character per line (the previous `min-w-0` + `break-words` collapse). Change/
// activity ids become a control that opens that id's provenance chain panel.
const ProvenanceScalar = ({ value, directory }: { value: AtomicJsonValue; directory: string }) => {
  const { t } = useI18n();
  const openProvenance = useUIStore((state) => state.openContextProvenance);

  if (value === null) {
    return <span className="text-muted-foreground">null</span>;
  }
  const text = asJsonString(value);
  if (text === null) {
    return <span className="break-words text-foreground">{String(value)}</span>;
  }

  const hash = changeHashFromAtomicId(text);
  if (hash && directory) {
    return (
      <button
        type="button"
        onClick={() => openProvenance(directory, hash, t('atomic.provenanceChain.tabLabel', { hash: hash.slice(0, HASH_DISPLAY_LENGTH) }))}
        title={t('atomic.provenanceChain.open')}
        className="inline-flex max-w-full items-baseline gap-1 break-all text-left font-mono text-[var(--interactive-selection-foreground)] underline decoration-dotted underline-offset-2 outline-none hover:text-[color:var(--interactive-border)] focus-visible:text-[color:var(--interactive-border)]"
      >
        <span className="min-w-0 break-all">{text}</span>
        <Icon name="node-tree" className="size-3.5 shrink-0 translate-y-0.5 opacity-70" />
      </button>
    );
  }

  return <span className="block break-all font-mono text-foreground">{text}</span>;
};

// One node of the PROV `@graph`: its `@id` heading plus each relation as a
// label/value row. Non-graph documents fall back to the same row rendering over
// their top-level entries.
const ProvenanceNode = ({ node, directory }: { node: AtomicJsonValue; directory: string }) => {
  if (!isJsonObject(node)) {
    return <ProvenanceScalar value={node} directory={directory} />;
  }

  const entries = Object.entries(node);
  const idEntry = entries.find(([key]) => key === '@id');
  const rest = entries.filter(([key]) => key !== '@id');

  return (
    <div className="rounded-md border border-border bg-[var(--surface-base)] p-2.5">
      {idEntry ? (
        <div className="mb-2 min-w-0">
          <ProvenanceScalar value={idEntry[1]} directory={directory} />
        </div>
      ) : null}
      <dl className="space-y-1.5">
        {rest.map(([key, entry]) => (
          <div key={key} className="grid grid-cols-1 gap-x-3 gap-y-0.5 sm:grid-cols-[minmax(6rem,10rem)_minmax(0,1fr)]">
            <dt className="min-w-0 break-words typography-ui-label text-muted-foreground" title={key}>{key}</dt>
            <dd className="min-w-0 typography-code text-foreground">
              {isJsonArray(entry) ? (
                <div className="space-y-1">
                  {entry.map((item, index) => <ProvenanceScalar key={index} value={item} directory={directory} />)}
                </div>
              ) : isJsonObject(entry) ? (
                <ProvenanceNode node={entry} directory={directory} />
              ) : (
                <ProvenanceScalar value={entry} directory={directory} />
              )}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
};

// Render the PROV JSON-LD document readably: the `@graph` array as a stack of
// node cards, with any top-level scalars (e.g. `@context`, `@id`) shown above.
const ProvenanceDocument = ({ document, directory }: { document: AtomicJsonValue; directory: string }) => {
  if (!isJsonObject(document)) {
    return <ProvenanceScalar value={document} directory={directory} />;
  }

  const graph = document['@graph'];
  const topScalars = Object.entries(document).filter(([key, value]) => key !== '@graph' && !isJsonArray(value) && !isJsonObject(value));
  const nodes = isJsonArray(graph) ? graph : null;

  return (
    <div className="space-y-2">
      {topScalars.length ? (
        <dl className="space-y-1">
          {topScalars.map(([key, value]) => (
            <div key={key} className="grid grid-cols-1 gap-x-3 gap-y-0.5 sm:grid-cols-[minmax(6rem,10rem)_minmax(0,1fr)]">
              <dt className="typography-ui-label text-muted-foreground">{key}</dt>
              <dd className="min-w-0 typography-code text-foreground"><ProvenanceScalar value={value} directory={directory} /></dd>
            </div>
          ))}
        </dl>
      ) : null}
      {nodes
        ? nodes.map((node, index) => <ProvenanceNode key={index} node={node} directory={directory} />)
        : <ProvenanceNode node={document} directory={directory} />}
    </div>
  );
};

export const AtomicProvenancePanel = ({ document, directory }: { document: AtomicJsonValue; directory: string }) => {
  const { t } = useI18n();

  return (
    <section aria-labelledby="atomic-provenance-title" className="rounded-lg border border-border bg-[var(--surface-elevated)] p-3">
      <h3 id="atomic-provenance-title" className="mb-3 typography-ui-header text-foreground">
        {t('atomic.section.provenance')}
      </h3>
      <ProvenanceDocument document={document} directory={directory} />
    </section>
  );
};

// Bare document renderer without the section chrome, for the dedicated
// provenance-chain panel which supplies its own header.
export const AtomicProvenanceDocument = ({ document, directory }: { document: AtomicJsonValue; directory: string }) => (
  <ProvenanceDocument document={document} directory={directory} />
);
