import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import * as path from "node:path";
import { promisify } from "node:util";
import type { DiffStat, Worktree } from "./models/Worktree";
import { parseWorktreeOutput } from "./utils/parseWorktreeOutput";
import { parseShortStat } from "./utils/formatDiffStat";

const execFileAsync = promisify(execFile);

const GIT_OPTS = { maxBuffer: 10 * 1024 * 1024, timeout: 10_000 } as const;

/** Run git in `cwd`, returning stdout, or undefined on any failure. */
async function git(cwd: string, args: string[]): Promise<string | undefined> {
  try {
    const { stdout } = await execFileAsync("git", args, { cwd, ...GIT_OPTS });
    return stdout;
  } catch {
    return undefined;
  }
}

/**
 * Resolve the shared git directory for the repo containing `cwd`. All
 * worktrees of one repository return the same common-dir, so it is the key we
 * group repositories by. Returns undefined outside a repository.
 */
export async function getCommonDir(cwd: string): Promise<string | undefined> {
  const out = await git(cwd, ["rev-parse", "--path-format=absolute", "--git-common-dir"]);
  return out?.trim() || undefined;
}

/**
 * List the Git worktrees for the repository containing `cwd`.
 *
 * `currentPath`, when provided, marks the matching worktree as `current`.
 * `repoRoot` is stamped onto every returned worktree. Returns an empty array
 * if `cwd` is not inside a Git repository.
 */
export async function listWorktrees(
  cwd: string,
  currentPath: string | undefined,
  repoRoot: string,
): Promise<Worktree[]> {
  const stdout = await git(cwd, ["worktree", "list", "--porcelain"]);
  if (stdout === undefined) {
    return [];
  }

  const worktrees = parseWorktreeOutput(stdout).map((wt) => ({
    ...wt,
    repoRoot,
  }));

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

/**
 * Compute the uncommitted working-tree diff stat for a worktree: tracked
 * changes (staged + unstaged vs HEAD) plus the line count of new untracked
 * files (which `git diff` does not report). Returns zeroed counts on a clean
 * tree or any failure.
 */
export async function getUncommittedDiffStat(
  worktreePath: string,
): Promise<DiffStat> {
  const [trackedOut, untracked] = await Promise.all([
    git(worktreePath, ["diff", "--shortstat", "HEAD"]),
    countUntrackedLines(worktreePath),
  ]);
  const tracked = parseShortStat(trackedOut ?? "");
  return {
    insertions: tracked.insertions + untracked,
    deletions: tracked.deletions,
  };
}

/** Largest untracked file we'll read to count lines (skip the rest). */
const MAX_UNTRACKED_BYTES = 2 * 1024 * 1024;

/**
 * Total line count across new untracked, non-ignored files — counted as
 * insertions to mirror how git would stat them once added. Binary and
 * oversized files are skipped.
 */
async function countUntrackedLines(cwd: string): Promise<number> {
  const out = await git(cwd, [
    "ls-files",
    "--others",
    "--exclude-standard",
    "-z",
  ]);
  if (!out) {
    return 0;
  }
  const files = out.split("\0").filter(Boolean);
  let total = 0;
  await Promise.all(
    files.map(async (rel) => {
      try {
        const buf = await readFile(path.join(cwd, rel));
        if (buf.length === 0 || buf.length > MAX_UNTRACKED_BYTES) {
          return;
        }
        if (buf.includes(0)) {
          return; // binary
        }
        total += countLines(buf);
      } catch {
        // unreadable file — ignore
      }
    }),
  );
  return total;
}

/** Number of lines in a buffer (git counts a final unterminated line too). */
function countLines(buf: Buffer): number {
  let newlines = 0;
  for (const byte of buf) {
    if (byte === 0x0a) {
      newlines++;
    }
  }
  const endsWithNewline = buf[buf.length - 1] === 0x0a;
  return endsWithNewline ? newlines : newlines + 1;
}

/** Normalize a path for comparison (strip trailing separators). */
function normalize(p: string): string {
  return p.replace(/[\\/]+$/, "");
}
