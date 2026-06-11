import * as vscode from "vscode";
import { discoverRepos } from "./repos";
import {
  getMergedBranches,
  getUncommittedDiffStat,
  resolveBaseBranch,
} from "./git";
import { GitHubService, parseGitHubRemote } from "./github";
import { getOriginUrl, listBranches } from "./git";
import type { Repo } from "./models/Repo";
import type { DiffStat } from "./models/Worktree";

/** Cached per-repo branch metadata used to flag worktree state. */
interface RepoState {
  merged: Set<string>;
  remote: Set<string>;
}

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
  /** Per-repo branch state (merged + remote sets), keyed by repo root. */
  private repoStateCache = new Map<string, RepoState>();
  /** Per-repo GitHub owner avatar URL (undefined cached too), by repo root. */
  private avatarCache = new Map<string, string | undefined>();
  private github = new GitHubService();
  private prInFlight = new Set<string>();
  private fireTimer: ReturnType<typeof setTimeout> | undefined;

  /**
   * Discover repositories, attach cached diff stats, and flag worktrees whose
   * branch is merged into the repo's base branch. Uncached, non-bare worktrees
   * have their stats scheduled; `onDidChange` fires once they resolve so
   * callers can re-`load`. Worktrees are sorted current-first, merged-last.
   */
  async load(): Promise<Repo[]> {
    const repos = await discoverRepos();
    await Promise.all(repos.map((repo) => this.markBranchState(repo)));
    const prEnabled = this.prEnabled();
    for (const repo of repos) {
      for (const wt of repo.worktrees) {
        const cached = this.statCache.get(wt.path);
        if (cached) {
          wt.diffStat = cached;
        } else if (!wt.bare) {
          this.scheduleStat(wt.path);
        }
      }
      if (prEnabled) {
        this.applyPullRequests(repo);
      }
      repo.worktrees.sort(compareWorktrees);
    }
    return repos;
  }

  /** Full reload: drop cached stats/branch-state/PR info and notify. */
  refresh(): void {
    this.statCache.clear();
    this.statInFlight.clear();
    this.repoStateCache.clear();
    this.prInFlight.clear();
    this.github.clear();
    this._onDidChange.fire();
  }

  private prEnabled(): boolean {
    return vscode.workspace
      .getConfiguration("worktreeNavigator")
      .get<boolean>("showPullRequests", false);
  }

  /** Attach cached PR info to a repo's worktrees, scheduling a fetch if cold. */
  private applyPullRequests(repo: Repo): void {
    const map = this.github.peek(repo.root);
    if (map) {
      for (const wt of repo.worktrees) {
        wt.pr = wt.branch ? map.get(wt.branch) : undefined;
      }
    } else {
      this.schedulePr(repo.root);
    }
  }

  /** Fetch PR data for a repo once (silent auth), then re-render on success. */
  private schedulePr(repoRoot: string): void {
    if (this.prInFlight.has(repoRoot)) {
      return;
    }
    this.prInFlight.add(repoRoot);
    void this.github
      .getPrMap(repoRoot, { createIfNone: false })
      .then((map) => {
        this.prInFlight.delete(repoRoot);
        if (map) {
          this.scheduleFire();
        }
      });
  }

  /** Compute (cached) merged + remote branch sets and flag worktrees. */
  private async markBranchState(repo: Repo): Promise<void> {
    let state = this.repoStateCache.get(repo.root);
    if (!state) {
      const [base, branches] = await Promise.all([
        resolveBaseBranch(repo.root),
        listBranches(repo.root),
      ]);
      const merged = base
        ? await getMergedBranches(repo.root, base)
        : new Set<string>();
      state = { merged, remote: new Set(branches.remote) };
      this.repoStateCache.set(repo.root, state);
    }
    for (const wt of repo.worktrees) {
      wt.merged = !!wt.branch && state.merged.has(wt.branch);
      wt.pushed = !!wt.branch && state.remote.has(wt.branch);
    }

    if (!this.avatarCache.has(repo.root)) {
      const url = await getOriginUrl(repo.root);
      const slug = url ? parseGitHubRemote(url) : undefined;
      this.avatarCache.set(
        repo.root,
        slug ? `https://github.com/${slug.owner}.png?size=48` : undefined,
      );
    }
    repo.avatarUrl = this.avatarCache.get(repo.root);
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
