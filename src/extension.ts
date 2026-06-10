import * as vscode from "vscode";
import { WorktreeProvider, WorktreeItem } from "./WorktreeProvider";

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
    // Keep the tree in sync as worktrees are added/removed on disk.
    createWorktreeWatcher(provider),
  );
}

export function deactivate(): void {}

function switchWorktree(item?: WorktreeItem): void {
  if (!item) {
    return;
  }
  if (item.worktree.current) {
    return;
  }

  vscode.commands.executeCommand(
    "vscode.openFolder",
    vscode.Uri.file(item.worktree.path),
    // reuse current window — do not open a new one
    false,
  );
}

/** Watch the repo's worktree metadata and refresh the tree on changes. */
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
