export type DiffStat = {
  insertions: number;
  deletions: number;
};

export type Worktree = {
  /** Absolute path to the worktree directory. */
  path: string;
  /** Branch name (e.g. "feature/auth"), or undefined if detached/bare. */
  branch?: string;
  /** True when this worktree is the one currently open in the window. */
  current: boolean;
  /** True for a detached-HEAD worktree (no branch checked out). */
  detached: boolean;
  /** True for the bare repository entry, if any. */
  bare: boolean;
  /** Root of the repository (common-dir group) this worktree belongs to. */
  repoRoot: string;
  /**
   * Uncommitted working-tree diff stat. Filled in asynchronously after the
   * tree first renders; stays undefined for a clean tree or until computed.
   */
  diffStat?: DiffStat;
  /** True when this worktree's branch is fully merged into the base branch. */
  merged?: boolean;
  /** True when the branch exists on a remote (has been pushed). */
  pushed?: boolean;
  /** Associated GitHub pull request, when PR status is enabled and found. */
  pr?: PullRequestInfo;
};

/**
 * Branch lifecycle, driving the icon color:
 * - `merged` (purple): merged into the base branch (or PR merged)
 * - `pushed` (orange): exists on a remote but not yet merged
 * - `local`  (default/white): local-only, never pushed
 */
export type BranchState = "merged" | "pushed" | "local";

export type PullRequestInfo = {
  number: number;
  state: "OPEN" | "MERGED" | "CLOSED";
  isDraft: boolean;
  url: string;
};
