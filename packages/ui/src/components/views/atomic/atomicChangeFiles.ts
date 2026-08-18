/**
 * Client-side per-file view of an Atomic change.
 *
 * The Atomic backend is read-only and its change-diff endpoint returns ONE
 * whole-change unified patch and refuses per-path filtering. To show a
 * files-changed list with +/- line counts and to open a single file's diff, we
 * split that one patch into per-file sections here, on the client. The change's
 * hunks (from the change JSON) stay authoritative for which files exist and in
 * what order; the parsed patch only contributes each file's added/removed
 * counts and its sliced patch text. A file that has hunks but no resolvable
 * patch section is still listed, just without counts or a diff.
 */

// A patch section starts at a `diff --git` line (git-style) or a `--- ` header
// (bare unified). Atomic emits bare unified diffs, but git-style is handled too
// so the split is robust to either shape.
const GIT_FILE_BREAK = /(?=^diff --git\s+)/gm;
const GIT_FILE_BREAK_TEST = /^diff --git\s+/m;
const UNIFIED_FILE_BREAK = /(?=^---\s+\S)/gm;
const UNIFIED_FILE_BREAK_TEST = /^---\s+\S/m;

/**
 * Normalize a diff path so it lines up with a change hunk's path: strip a
 * trailing tab-metadata, drop the leading `a/` or `b/` git prefix, unify
 * separators, and map `/dev/null` (used for pure adds/deletes) to empty.
 */
export const normalizeAtomicDiffPath = (raw: string | undefined): string => {
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
    const gitHeader = /^diff --git\s+a\/(.+?)\s+b\/(.+)$/.exec(line);
    if (gitHeader) {
      const path = normalizeAtomicDiffPath(gitHeader[2]) || normalizeAtomicDiffPath(gitHeader[1]);
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

const countLines = (section: string): { added: number; removed: number } => {
  let added = 0;
  let removed = 0;
  for (const line of section.split('\n')) {
    if (line.startsWith('+') && !line.startsWith('+++')) added += 1;
    else if (line.startsWith('-') && !line.startsWith('---')) removed += 1;
  }
  return { added, removed };
};

export type AtomicPatchSection = { added: number; removed: number; patch: string };

/**
 * Split a whole-change unified patch into per-file sections keyed by normalized
 * path. Multiple sections for the same normalized path are merged (their counts
 * summed, their patch text concatenated) so a lookup by path is unambiguous.
 */
export const splitAtomicChangePatch = (patch: string): Map<string, AtomicPatchSection> => {
  const result = new Map<string, AtomicPatchSection>();
  const normalized = patch.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const isGit = GIT_FILE_BREAK_TEST.test(normalized);
  const isUnified = UNIFIED_FILE_BREAK_TEST.test(normalized);
  if (!isGit && !isUnified) return result;

  for (const rawSection of normalized.split(isGit ? GIT_FILE_BREAK : UNIFIED_FILE_BREAK)) {
    const section = rawSection.trim();
    if (!section) continue;
    const path = sectionPath(section);
    if (!path) continue;
    const { added, removed } = countLines(section);
    const existing = result.get(path);
    if (existing) {
      result.set(path, {
        added: existing.added + added,
        removed: existing.removed + removed,
        patch: `${existing.patch}\n${section}`,
      });
    } else {
      result.set(path, { added, removed, patch: section });
    }
  }
  return result;
};
