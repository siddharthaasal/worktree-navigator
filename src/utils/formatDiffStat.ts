import type { DiffStat } from "../models/Worktree";

/**
 * Parse the output of `git diff --shortstat`, e.g.:
 *
 *   3 files changed, 407 insertions(+), 25 deletions(-)
 *   1 file changed, 2 deletions(-)
 *   2 files changed, 10 insertions(+)
 *
 * Returns zeroed counts for empty/clean output.
 */
export function parseShortStat(output: string): DiffStat {
  const insMatch = output.match(/(\d+) insertions?\(\+\)/);
  const delMatch = output.match(/(\d+) deletions?\(-\)/);
  return {
    insertions: insMatch ? Number(insMatch[1]) : 0,
    deletions: delMatch ? Number(delMatch[1]) : 0,
  };
}

/** Abbreviate a line count: 999 → "999", 1300 → "1.3k", 12000 → "12k". */
function abbreviate(n: number): string {
  if (n < 1000) {
    return String(n);
  }
  const thousands = n / 1000;
  // One decimal under 10k (1.3k), whole numbers above (12k).
  const text =
    thousands < 10 ? thousands.toFixed(1).replace(/\.0$/, "") : Math.round(thousands).toString();
  return `${text}k`;
}

/**
 * Format a diff stat as Conductor-style `+1.3k -25`. Returns an empty string
 * for a clean tree (nothing added or removed) so callers can hide it.
 */
export function formatDiffStat(stat: DiffStat | undefined): string {
  if (!stat || (stat.insertions === 0 && stat.deletions === 0)) {
    return "";
  }
  const parts: string[] = [];
  if (stat.insertions > 0) {
    parts.push(`+${abbreviate(stat.insertions)}`);
  }
  if (stat.deletions > 0) {
    parts.push(`-${abbreviate(stat.deletions)}`);
  }
  return parts.join(" ");
}
