import * as vscode from "vscode";
import * as path from "node:path";
import { listWorktrees } from "./git";
import type { Worktree } from "./models/Worktree";

/**
 * TreeDataProvider that renders the list of Git worktrees.
 *
 * Holds no git logic of its own beyond invoking `listWorktrees`; parsing and
 * execution live in git.ts / utils.
 */
export class WorktreeProvider
  implements vscode.TreeDataProvider<WorktreeItem>
{
  private readonly _onDidChangeTreeData = new vscode.EventEmitter<
    WorktreeItem | undefined | void
  >();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: WorktreeItem): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: WorktreeItem): Promise<WorktreeItem[]> {
    // Flat list — worktrees have no children.
    if (element) {
      return [];
    }

    const cwd = workspaceRoot();
    if (!cwd) {
      return [];
    }

    const worktrees = await listWorktrees(cwd, cwd);
    return worktrees.map((wt) => new WorktreeItem(wt));
  }
}

/** Tree node for a single worktree. */
export class WorktreeItem extends vscode.TreeItem {
  constructor(readonly worktree: Worktree) {
    super(label(worktree), vscode.TreeItemCollapsibleState.None);

    this.description = path.basename(worktree.path);
    this.tooltip = `${label(worktree)}\n${worktree.path}`;
    this.resourceUri = vscode.Uri.file(worktree.path);
    this.contextValue = worktree.current ? "worktree-current" : "worktree";

    // Filled (current) vs hollow (other) circle, mirroring the plan's UX.
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

function label(wt: Worktree): string {
  if (wt.bare) {
    return "(bare)";
  }
  if (wt.detached || !wt.branch) {
    return "(detached HEAD)";
  }
  return wt.branch;
}

/** Absolute path of the first workspace folder, if any. */
function workspaceRoot(): string | undefined {
  return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
}
