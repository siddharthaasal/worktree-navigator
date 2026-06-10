import * as vscode from "vscode";
import { discoverRepos } from "./repos";
import {
  getMergedBranches,
  getUncommittedDiffStat,
  resolveBaseBranch,
} from "./git";
import type { Repo } from "./models/Repo";
import type { DiffStat } from "./models/Worktree";

/**
 * Shared worktree data source for both the tree and webview views.
 *
 * Owns repository discovery and the asynchronous diff-stat cache, and fires
 * `onDidChange` when callers should re-render — on refresh, and once a batch of
 * diff stats resolves. Keeping this in one place ensures the two views never
 * drift in caching or refresh behavior.
 */
export class WorktreeData implements vscode.Disposable {
  private readonly _onDidChange = new vscode.EventEmitter<void>();
  readonly onDidChange = this._onDidChange.event;

  private statCache = new Map<string, DiffStat>();
  private statInFlight = new Set<string>();
  /** Per-repo merged-branch info, keyed by repo root. */
  private mergedCache = new Map<string, Set<string>>();
  private fireTimer: ReturnType<typeof setTimeout> | undefined;

  /**
   * Discover repositories, attach cached diff stats, and flag worktrees whose
   * branch is merged into the repo's base branch. Uncached, non-bare worktrees
   * have their stats scheduled; `onDidChange` fires once they resolve so
   * callers can re-`load`. Worktrees are sorted current-first, merged-last.
   */
  async load(): Promise<Repo[]> {
    const repos = await discoverRepos();
    await Promise.all(repos.map((repo) => this.markMerged(repo)));
    for (const repo of repos) {
      for (const wt of repo.worktrees) {
        const cached = this.statCache.get(wt.path);
        if (cached) {
          wt.diffStat = cached;
        } else if (!wt.bare) {
          this.scheduleStat(wt.path);
        }
      }
      repo.worktrees.sort(compareWorktrees);
    }
    return repos;
  }

  /** Full reload: drop cached stats/merged info and notify. */
  refresh(): void {
    this.statCache.clear();
    this.statInFlight.clear();
    this.mergedCache.clear();
    this._onDidChange.fire();
  }

  /** Compute (cached) the merged-branch set for a repo and flag worktrees. */
  private async markMerged(repo: Repo): Promise<void> {
    let merged = this.mergedCache.get(repo.root);
    if (!merged) {
      const base = await resolveBaseBranch(repo.root);
      merged = base ? await getMergedBranches(repo.root, base) : new Set();
      this.mergedCache.set(repo.root, merged);
    }
    for (const wt of repo.worktrees) {
      wt.merged = !!wt.branch && merged.has(wt.branch);
    }
  }

  dispose(): void {
    if (this.fireTimer) {
      clearTimeout(this.fireTimer);
    }
    this._onDidChange.dispose();
  }

  private scheduleStat(worktreePath: string): void {
    if (this.statInFlight.has(worktreePath)) {
      return;
    }
    this.statInFlight.add(worktreePath);
    void getUncommittedDiffStat(worktreePath).then((stat) => {
      this.statCache.set(worktreePath, stat);
      this.statInFlight.delete(worktreePath);
      this.scheduleFire();
    });
  }

  /** Debounce so a batch of resolved stats triggers a single re-render. */
  private scheduleFire(): void {
    if (this.fireTimer) {
      return;
    }
    this.fireTimer = setTimeout(() => {
      this.fireTimer = undefined;
      this._onDidChange.fire();
    }, 80);
  }
}

/** Sort order within a repo group: current first, merged last, else by label. */
function compareWorktrees(
  a: { current: boolean; merged?: boolean; branch?: string; path: string },
  b: { current: boolean; merged?: boolean; branch?: string; path: string },
): number {
  if (a.current !== b.current) {
    return a.current ? -1 : 1;
  }
  if (!!a.merged !== !!b.merged) {
    return a.merged ? 1 : -1;
  }
  return (a.branch ?? a.path).localeCompare(b.branch ?? b.path);
}
