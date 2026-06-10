import * as vscode from "vscode";
import { WorktreeProvider, WorktreeItem } from "./WorktreeProvider";
import { getGitAPI } from "./repos";

export function activate(context: vscode.ExtensionContext): void {
  const provider = new WorktreeProvider();

  context.subscriptions.push(
    vscode.window.registerTreeDataProvider(
      "worktreeNavigator.worktrees",
      provider,
    ),
    vscode.commands.registerCommand("worktreeNavigator.refresh", () => {
      provider.refresh();
    }),
    vscode.commands.registerCommand(
      "worktreeNavigator.switch",
      (item?: WorktreeItem) => switchWorktree(item),
    ),
    // Refresh when worktree metadata changes on disk (add/remove/HEAD move).
    createWorktreeWatcher(provider),
  );

  // Refresh when repositories are opened/closed in the workspace.
  void getGitAPI().then((api) => {
    if (!api) {
      return;
    }
    context.subscriptions.push(
      api.onDidOpenRepository(() => provider.refresh()),
      api.onDidCloseRepository(() => provider.refresh()),
    );
  });
}

export function deactivate(): void {}

function switchWorktree(item?: WorktreeItem): void {
  if (!item || item.worktree.current) {
    return;
  }
  vscode.commands.executeCommand(
    "vscode.openFolder",
    vscode.Uri.file(item.worktree.path),
    // reuse current window — do not open a new one
    false,
  );
}

/** Watch repo worktree metadata and refresh the tree on changes. */
function createWorktreeWatcher(provider: WorktreeProvider): vscode.Disposable {
  const watcher = vscode.workspace.createFileSystemWatcher(
    "**/.git/worktrees/**",
  );
  const refresh = () => provider.refresh();
  watcher.onDidCreate(refresh);
  watcher.onDidChange(refresh);
  watcher.onDidDelete(refresh);
  return watcher;
}
