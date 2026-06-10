import * as path from "node:path";
import type { Worktree } from "../models/Worktree";

/** Display label for a worktree: branch name, or dir name when detached/bare. */
export function worktreeLabel(wt: Worktree): string {
  if (wt.bare) {
    return "(bare)";
  }
  if (wt.detached || !wt.branch) {
    return path.basename(wt.path) || "(detached HEAD)";
  }
  return wt.branch;
}
