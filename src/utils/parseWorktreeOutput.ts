import type { Worktree } from "../models/Worktree";

/** Worktree fields known from parsing alone — `repoRoot` is stamped later. */
export type ParsedWorktree = Omit<Worktree, "repoRoot">;

/**
 * Parse the output of `git worktree list --porcelain` into Worktree records.
 *
 * The porcelain format emits one attribute per line, with blank lines
 * separating worktree blocks, e.g.:
 *
 *   worktree /path/to/main
 *   HEAD abc123...
 *   branch refs/heads/main
 *
 *   worktree /path/to/feature
 *   HEAD def456...
 *   branch refs/heads/feature/auth
 *
 * Detached worktrees emit a `detached` line instead of `branch`; the bare
 * repository (if present) emits a `bare` line.
 *
 * `current` is left false here — the caller determines which worktree maps to
 * the active window, since that is not part of the git output.
 */
export function parseWorktreeOutput(output: string): ParsedWorktree[] {
  const worktrees: ParsedWorktree[] = [];
  let current: Partial<ParsedWorktree> | null = null;

  const flush = () => {
    if (current && current.path) {
      worktrees.push({
        path: current.path,
        branch: current.branch,
        current: false,
        detached: current.detached ?? false,
        bare: current.bare ?? false,
      });
    }
    current = null;
  };

  for (const rawLine of output.split("\n")) {
    const line = rawLine.trimEnd();

    if (line === "") {
      flush();
      continue;
    }

    if (line.startsWith("worktree ")) {
      // A new block starts; flush any in-progress one defensively.
      flush();
      current = { path: line.slice("worktree ".length) };
      continue;
    }

    if (!current) {
      continue;
    }

    if (line.startsWith("branch ")) {
      const ref = line.slice("branch ".length);
      current.branch = ref.replace(/^refs\/heads\//, "");
    } else if (line === "detached") {
      current.detached = true;
    } else if (line === "bare") {
      current.bare = true;
    }
    // Other attributes (HEAD, locked, prunable) are ignored for the MVP.
  }

  flush();
  return worktrees;
}
