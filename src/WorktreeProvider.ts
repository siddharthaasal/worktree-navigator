import * as vscode from "vscode";
import * as path from "node:path";
import { discoverRepos } from "./repos";
import { getUncommittedDiffStat } from "./git";
import type { Repo } from "./models/Repo";
import type { DiffStat, Worktree } from "./models/Worktree";
import { formatDiffStat } from "./utils/formatDiffStat";

type Node = RepoItem | WorktreeItem | MessageItem;

/**
 * TreeDataProvider rendering repositories (parent) and their worktrees
 * (children). Diff stats are computed off the render path and cached; the tree
 * refreshes once a batch of stats resolves.
 */
export class WorktreeProvider implements vscode.TreeDataProvider<Node> {
  private readonly _onDidChangeTreeData = new vscode.EventEmitter<
    Node | undefined | void
  >();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  /** Diff stat cache keyed by worktree path; absence ⇒ not yet computed. */
  private statCache = new Map<string, DiffStat>();
  private statInFlight = new Set<string>();
  private fireTimer: ReturnType<typeof setTimeout> | undefined;

  /** Full reload: drop the stat cache and re-render from scratch. */
  refresh(): void {
    this.statCache.clear();
    this.statInFlight.clear();
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: Node): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: Node): Promise<Node[]> {
    if (element instanceof RepoItem) {
      return element.repo.worktrees.map((wt) => this.makeWorktreeItem(wt));
    }
    if (element) {
      return []; // worktree / message leaves have no children
    }

    const repos = await discoverRepos();
    if (repos.length === 0) {
      return [new MessageItem("No git repositories found")];
    }
    return repos.map((repo) => new RepoItem(repo));
  }

  private makeWorktreeItem(wt: Worktree): WorktreeItem {
    const cached = this.statCache.get(wt.path);
    if (cached) {
      wt.diffStat = cached;
    } else if (!wt.bare) {
      this.scheduleStat(wt.path);
    }
    return new WorktreeItem(wt);
  }

  /** Compute a worktree's diff stat once, then coalesce a tree refresh. */
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

  /** Debounce refreshes so a batch of stat results triggers one redraw. */
  private scheduleFire(): void {
    if (this.fireTimer) {
      return;
    }
    this.fireTimer = setTimeout(() => {
      this.fireTimer = undefined;
      this._onDidChangeTreeData.fire();
    }, 80);
  }
}

/** Repository (project) parent node. */
export class RepoItem extends vscode.TreeItem {
  constructor(readonly repo: Repo) {
    super(repo.name, vscode.TreeItemCollapsibleState.Expanded);
    this.iconPath = new vscode.ThemeIcon("repo");
    this.tooltip = repo.root;
    this.contextValue = "repo";
    this.resourceUri = vscode.Uri.file(repo.root);
  }
}

/** Worktree leaf node — click to switch (unless it's the current one). */
export class WorktreeItem extends vscode.TreeItem {
  constructor(readonly worktree: Worktree) {
    super(label(worktree), vscode.TreeItemCollapsibleState.None);

    this.description = formatDiffStat(worktree.diffStat);
    this.tooltip = `${label(worktree)}\n${worktree.path}`;
    this.resourceUri = vscode.Uri.file(worktree.path);
    this.contextValue = worktree.current ? "worktree-current" : "worktree";
    this.iconPath = new vscode.ThemeIcon(
      worktree.current ? "circle-filled" : "circle-outline",
    );

    if (!worktree.current) {
      this.command = {
        command: "worktreeNavigator.switch",
        title: "Switch to Worktree",
        arguments: [this],
      };
    }
  }
}

/** Placeholder node (e.g. no repositories). */
export class MessageItem extends vscode.TreeItem {
  constructor(message: string) {
    super(message, vscode.TreeItemCollapsibleState.None);
    this.contextValue = "message";
  }
}

function label(wt: Worktree): string {
  if (wt.bare) {
    return "(bare)";
  }
  if (wt.detached || !wt.branch) {
    return path.basename(wt.path) || "(detached HEAD)";
  }
  return wt.branch;
}
