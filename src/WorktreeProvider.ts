import * as vscode from "vscode";
import type { WorktreeData } from "./WorktreeData";
import type { Repo } from "./models/Repo";
import type { Worktree } from "./models/Worktree";
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
