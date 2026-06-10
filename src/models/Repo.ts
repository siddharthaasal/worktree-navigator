import type { Worktree } from "./Worktree";

export type Repo = {
  /** Main working directory of the repository (display root). */
  root: string;
  /** Display label — basename of `root`. */
  name: string;
  /** Worktrees belonging to this repository. */
  worktrees: Worktree[];
};
