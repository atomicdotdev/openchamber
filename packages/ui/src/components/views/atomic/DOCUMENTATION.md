# Atomic Views

Read-only surfaces onto the active project directory's Atomic repository and
vault. Every surface here fetches through the shared `AtomicAPI`
(`useAtomicStore`) and never mutates the repository or vault.

## Files

| File | Owns |
|---|---|
| `AtomicRepositoryView.tsx` | the repository surface: working copy, history, per-change diff, attestation |
| `AtomicProvenanceView.tsx` | the dedicated provenance-chain surface (a change's decision ledger) |
| `AtomicProvenancePanel.tsx` | renders a change's W3C PROV JSON-LD graph; `@id`s that carry a change hash become controls that open that id's provenance chain |
| `AtomicVaultPanel.tsx` | the read-only vault view: intents with their derived memories |
| `atomicChangeFiles.ts` | parses a change's diff into per-file added/removed line counts |

## The vault panel replaced project knowledge

The right rail's `notes` surface ("Project knowledge") once rendered the
project-context panel (user notes, todos, plans, and agent memory). It now
renders `AtomicVaultPanel` through `RightSidebarTabs`, so the surface shows the
project's recorded Atomic vault instead. The mobile workspace drawer renders the
same `ProjectContextPanel` wrapper, so both hosts show the vault.

The project-context store, its HTTP client, and the server module are untouched
and still live: the chat "add to notes"/"save plan" actions and the work-status
pinned-context section still write and read them. Only the panel that browsed
them was replaced, and its component files were removed with it.

## One vault read, grouped by semantic linkage

The panel issues a single `vault(directory)` read. The server composes it from
`atomic intent list/show --json` and `atomic memory list/show --json` and returns
every intent (its why, acceptance criteria, tasks, scope, constraints, status,
attestation) and every memory (its kind, text, attestation, and `derivedFrom`
source urns).

Memories are grouped under the intent they were derived from: a memory links to
an intent when its `derivedFrom` contains that intent's urn **or** one of the
intent's acceptance-criterion ids (memories are frequently derived from a
specific criterion, not the whole intent). A memory matching no listed intent
falls into an "Other memories" section rather than being dropped, so a read that
returns memories with no matching intent never silently loses them.

## Read-only and failure-explicit

Nothing in the panel writes to the vault. `vault` is a capability read like
`overview`/`provenance`: a missing CLI, non-Atomic directory, or incompatible
CLI comes back as a classified `unavailable` result and renders as a distinct
informational state, never a blank or a thrown-away panel. A refresh failure
keeps the last good snapshot and shows a quiet inline notice; an authoritative
fetch failure with no prior data shows the error state — it is never converted
into an empty vault.

## Related

- Store + hooks: `packages/ui/src/stores/useAtomicStore.ts` (`useAtomicVault`, `loadVault`)
- Shared contract + schemas: `packages/ui/src/lib/api/types.ts` (`AtomicVaultResult`, `AtomicIntent`, `AtomicMemory`)
- Server runtime + route: `packages/web/server/lib/atomic/` (`vault()`, `GET /api/atomic/vault`)
- Surface wiring: `packages/ui/src/components/layout/RightSidebarTabs.tsx`, `packages/ui/src/lib/surfaces/registry.ts`
