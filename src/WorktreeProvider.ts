import * as vscode from "vscode";
import type { WorktreeData } from "./WorktreeData";
import type { Repo } from "./models/Repo";
import type { BranchState, PullRequestInfo, Worktree } from "./models/Worktree";
import { formatDiffStat } from "./utils/formatDiffStat";
import { worktreeLabel as label } from "./utils/worktreeLabel";
import { branchState } from "./utils/branchState";
import { worktreeIcon, type IconTone } from "./utils/worktreeIcon";

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
    // GitHub owner avatar when available, else a generic repo icon.
    this.iconPath = repo.avatarUrl
      ? vscode.Uri.parse(repo.avatarUrl)
      : new vscode.ThemeIcon("repo");
    this.tooltip = repo.root;
    this.contextValue = "repo";
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
    const state = branchState(worktree);

    // Decluttered: only the diff stat (and a "current" hint) on the row.
    this.description = [worktree.current ? "current" : "", stat]
      .filter(Boolean)
      .join(" · ");
    // Details live in the tooltip on hover.
    this.tooltip = [
      label(worktree),
      worktree.path,
      `Branch: ${stateLabel(state)}`,
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
    // Situation-appropriate git icon (branch / merge / pull-request variants),
    // colored by lifecycle tone.
    const descriptor = worktreeIcon(worktree);
    this.iconPath = new vscode.ThemeIcon(descriptor.icon, toneColor(descriptor.tone));

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

/** Icon color by tone. `default` uses the theme foreground. */
function toneColor(tone: IconTone): vscode.ThemeColor | undefined {
  switch (tone) {
    case "purple":
      return new vscode.ThemeColor("charts.purple");
    case "orange":
      return new vscode.ThemeColor("charts.orange");
    case "red":
      return new vscode.ThemeColor("charts.red");
    case "gray":
      return new vscode.ThemeColor("descriptionForeground");
    default:
      return undefined;
  }
}

function stateLabel(state: BranchState): string {
  return state === "merged"
    ? "merged"
    : state === "pushed"
      ? "pushed (in progress)"
      : "local only";
}

/** Placeholder node (e.g. no repositories). */
export class MessageItem extends vscode.TreeItem {
  constructor(message: string) {
    super(message, vscode.TreeItemCollapsibleState.None);
    this.contextValue = "message";
  }
}
