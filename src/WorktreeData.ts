import * as vscode from "vscode";
import { discoverRepos } from "./repos";
import { getUncommittedDiffStat } from "./git";
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
  private fireTimer: ReturnType<typeof setTimeout> | undefined;

  /**
   * Discover repositories and attach any cached diff stats. Uncached,
   * non-bare worktrees have their stats scheduled; `onDidChange` fires once
   * they resolve so callers can re-`load`.
   */
  async load(): Promise<Repo[]> {
    const repos = await discoverRepos();
    for (const repo of repos) {
      for (const wt of repo.worktrees) {
        const cached = this.statCache.get(wt.path);
        if (cached) {
          wt.diffStat = cached;
        } else if (!wt.bare) {
          this.scheduleStat(wt.path);
        }
      }
    }
    return repos;
  }

  /** Full reload: drop cached stats and notify. */
  refresh(): void {
    this.statCache.clear();
    this.statInFlight.clear();
    this._onDidChange.fire();
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
