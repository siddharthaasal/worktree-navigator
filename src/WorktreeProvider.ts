import * as vscode from "vscode";
import type { WorktreeData } from "./WorktreeData";
import type { Repo } from "./models/Repo";
import type { PullRequestInfo, Worktree } from "./models/Worktree";
import { formatDiffStat } from "./utils/formatDiffStat";
import { worktreeLabel as label } from "./utils/worktreeLabel";

type Node = RepoItem | WorktreeItem | MessageItem;

/**
 * TreeDataProvider rendering repositories (parent) and their worktrees
 * (children). All discovery and diff-stat caching lives in `WorktreeData`;
 * this provider only maps that data to tree items and relays change events.
 */
export class WorktreeProvider implements vscode.TreeDataProvider<Node> {
  private readonly _onDidChangeTreeData = new vscode.EventEmitter<
    Node | undefined | void
  >();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  constructor(private readonly data: WorktreeData) {
    this.data.onDidChange(() => this._onDidChangeTreeData.fire());
  }

  getTreeItem(element: Node): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: Node): Promise<Node[]> {
    if (element instanceof RepoItem) {
      return element.repo.worktrees.map((wt) => new WorktreeItem(wt));
    }
    if (element) {
      return []; // worktree / message leaves have no children
    }

    const repos = await this.data.load();
    if (repos.length === 0) {
      return [new MessageItem("No git repositories found")];
    }
    return repos.map((repo) => new RepoItem(repo));
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

    const isMain =
      worktree.path.replace(/[\\/]+$/, "") ===
      worktree.repoRoot.replace(/[\\/]+$/, "");
    const stat = formatDiffStat(worktree.diffStat);
    const pr = worktree.pr;
    const descParts = [
      pr ? `#${pr.number}` : "",
      worktree.merged ? "merged" : "",
      stat,
    ].filter(Boolean);
    this.description = descParts.join(" · ");
    this.tooltip = [
      label(worktree),
      worktree.path,
      pr ? `PR #${pr.number} · ${prLabel(pr)}` : "",
    ]
      .filter(Boolean)
      .join("\n");
    this.resourceUri = vscode.Uri.file(worktree.path);
    this.contextValue = worktree.current
      ? "worktree-current"
      : isMain
        ? "worktree-main"
        : worktree.merged
          ? "worktree-merged"
          : "worktree";
    this.iconPath = worktree.current
      ? new vscode.ThemeIcon("circle-filled")
      : pr
        ? new vscode.ThemeIcon("git-pull-request", prColor(pr))
        : new vscode.ThemeIcon(worktree.merged ? "git-merge" : "circle-outline");

    if (!worktree.current) {
      this.command = {
        command: "worktreeNavigator.switch",
        title: "Switch to Worktree",
        arguments: [this],
      };
    }
  }
}

/** Human label for a PR state. */
function prLabel(pr: PullRequestInfo): string {
  if (pr.state === "OPEN") {
    return pr.isDraft ? "draft" : "open";
  }
  return pr.state.toLowerCase();
}

/** Theme color for a PR state — open is orange, merged purple, etc. */
function prColor(pr: PullRequestInfo): vscode.ThemeColor {
  if (pr.state === "MERGED") {
    return new vscode.ThemeColor("charts.purple");
  }
  if (pr.state === "CLOSED") {
    return new vscode.ThemeColor("charts.red");
  }
  // OPEN
  return new vscode.ThemeColor(pr.isDraft ? "charts.gray" : "charts.orange");
}

/** Placeholder node (e.g. no repositories). */
export class MessageItem extends vscode.TreeItem {
  constructor(message: string) {
    super(message, vscode.TreeItemCollapsibleState.None);
    this.contextValue = "message";
  }
}
