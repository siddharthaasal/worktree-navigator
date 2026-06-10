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
  /** Associated GitHub pull request, when PR status is enabled and found. */
  pr?: PullRequestInfo;
};

export type PullRequestInfo = {
  number: number;
  state: "OPEN" | "MERGED" | "CLOSED";
  isDraft: boolean;
  url: string;
};
