import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { Worktree } from "./models/Worktree";
import { parseWorktreeOutput } from "./utils/parseWorktreeOutput";

const execFileAsync = promisify(execFile);

/**
 * List the Git worktrees for the repository containing `cwd`.
 *
 * `currentPath`, when provided, marks the matching worktree as `current`.
 * Returns an empty array if `cwd` is not inside a Git repository.
 */
export async function listWorktrees(
  cwd: string,
  currentPath?: string,
): Promise<Worktree[]> {
  let stdout: string;
  try {
    ({ stdout } = await execFileAsync(
      "git",
      ["worktree", "list", "--porcelain"],
      { cwd, maxBuffer: 10 * 1024 * 1024 },
    ));
  } catch {
    // Not a git repo, git missing, or no worktrees — surface as empty.
    return [];
  }

  const worktrees = parseWorktreeOutput(stdout);

  if (currentPath) {
    const target = normalize(currentPath);
    for (const wt of worktrees) {
      if (normalize(wt.path) === target) {
        wt.current = true;
      }
    }
  }

  return worktrees;
}

/** Normalize a path for comparison (strip trailing separators). */
function normalize(p: string): string {
  return p.replace(/[\\/]+$/, "");
}
