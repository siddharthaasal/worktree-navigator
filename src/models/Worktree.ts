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
};
