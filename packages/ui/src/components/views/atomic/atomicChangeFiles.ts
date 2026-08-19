/**
 * Client-side per-file line counts for an Atomic change.
 *
 * The Atomic change JSON lists a change's hunks (kind + path) but carries NO
 * per-file line counts. The change-diff endpoint returns ONE whole-change
 * unified patch. To show a `+added / -removed` figure per file, we parse that
 * one patch here, on the client, into per-file counts keyed by normalized path.
 * The change's hunks stay authoritative for which files exist and their order;
 * these counts are a display-only join. A file that has hunks but no resolvable
 * patch section simply has no counts (never a fabricated one).
 */

// A patch section starts at a `diff --git`/`diff --atomic` line (either shape is
// handled) or, failing that, a bare `--- ` file header. Atomic emits
// `diff --atomic a/<old> b/<new>` headers.
const DIFF_FILE_BREAK = /(?=^diff --(?:git|atomic)\s+)/gm;
const DIFF_FILE_BREAK_TEST = /^diff --(?:git|atomic)\s+/m;
const UNIFIED_FILE_BREAK = /(?=^---\s+\S)/gm;
const UNIFIED_FILE_BREAK_TEST = /^---\s+\S/m;

/**
 * Normalize a diff path so it lines up with a change hunk's path: strip trailing
 * tab-metadata, drop a leading `a/` or `b/` prefix, unify separators, and map
 * `/dev/null` (pure adds/deletes) to empty.
 */
const normalizeAtomicDiffPath = (raw: string | undefined): string => {
  const trimmed = (raw ?? '').trim().replace(/\t.*$/, '');
  if (!trimmed || trimmed === '/dev/null') return '';
  return trimmed.replace(/\\/g, '/').replace(/^[ab]\//, '');
};

const sectionPath = (section: string): string => {
  for (const line of section.split('\n')) {
    // Prefer the new-side path (`+++ b/...`); it names the file for adds and
    // edits. Fall back to the old-side (`--- a/...`) for pure deletions.
    const plus = /^\+\+\+\s+(.+)$/.exec(line);
    if (plus) {
      const path = normalizeAtomicDiffPath(plus[1]);
      if (path) return path;
    }
    const header = /^diff --(?:git|atomic)\s+a\/(.+?)\s+b\/(.+?)(?:\s+\([^)]*\))?$/.exec(line);
    if (header) {
      const path = normalizeAtomicDiffPath(header[2]) || normalizeAtomicDiffPath(header[1]);
      if (path) return path;
    }
  }
  for (const line of section.split('\n')) {
    const minus = /^---\s+(.+)$/.exec(line);
    if (minus) {
      const path = normalizeAtomicDiffPath(minus[1]);
      if (path) return path;
    }
  }
  return '';
};

const countLines = (section: string): AtomicFileLineCounts => {
  let added = 0;
  let removed = 0;
  for (const line of section.split('\n')) {
    if (line.startsWith('+') && !line.startsWith('+++')) added += 1;
    else if (line.startsWith('-') && !line.startsWith('---')) removed += 1;
  }
  return { added, removed };
};

export type AtomicFileLineCounts = { added: number; removed: number };

/**
 * Split a whole-change unified patch into per-file added/removed counts keyed by
 * normalized path. Sections for the same normalized path are merged (summed) so
 * a lookup by path is unambiguous. Returns an empty map for an empty/unparseable
 * patch.
 */
export const parseAtomicChangeLineCounts = (patch: string): Map<string, AtomicFileLineCounts> => {
  const result = new Map<string, AtomicFileLineCounts>();
  const normalized = patch.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const isDiff = DIFF_FILE_BREAK_TEST.test(normalized);
  const isUnified = UNIFIED_FILE_BREAK_TEST.test(normalized);
  if (!isDiff && !isUnified) return result;

  for (const rawSection of normalized.split(isDiff ? DIFF_FILE_BREAK : UNIFIED_FILE_BREAK)) {
    const section = rawSection.trim();
    if (!section) continue;
    const path = sectionPath(section);
    if (!path) continue;
    const { added, removed } = countLines(section);
    const existing = result.get(path);
    if (existing) {
      result.set(path, { added: existing.added + added, removed: existing.removed + removed });
    } else {
      result.set(path, { added, removed });
    }
  }
  return result;
};
