import type { BranchState } from "../models/Worktree";

/**
 * Derive a worktree's branch lifecycle state, which drives its icon color:
 * - `merged`  — merged into the base branch, or its PR is merged (purple)
 * - `pushed`  — exists on a remote / has a PR, not yet merged (orange)
 * - `local`   — local-only (default/white)
 */
export function branchState(wt: {
  merged?: boolean;
  pushed?: boolean;
  pr?: { state: string };
}): BranchState {
  if (wt.merged || wt.pr?.state === "MERGED") {
    return "merged";
  }
  if (wt.pushed || (wt.pr && wt.pr.state !== "MERGED")) {
    return "pushed";
  }
  return "local";
}
