import * as vscode from "vscode";
import { WorktreeData } from "./WorktreeData";
import { WorktreeProvider, WorktreeItem, RepoItem } from "./WorktreeProvider";
import { WorktreeWebviewProvider } from "./WorktreeWebviewProvider";
import { getGitAPI } from "./repos";
import { switchToWorktree } from "./switch";
import { createWorktree, removeWorktreeAction } from "./actions";

type ViewMode = "tree" | "pane";

export function activate(context: vscode.ExtensionContext): void {
  const data = new WorktreeData();
  context.subscriptions.push(data);

  const treeProvider = new WorktreeProvider(data);
  const webviewProvider = new WorktreeWebviewProvider(
    context.extensionUri,
    data,
    switchToWorktree,
  );

  syncViewModeContext();

  const treeView = vscode.window.createTreeView("worktreeNavigator.worktrees", {
    treeDataProvider: treeProvider,
  });

  context.subscriptions.push(
    treeView,
    vscode.window.registerWebviewViewProvider(
      WorktreeWebviewProvider.viewId,
      webviewProvider,
    ),
    vscode.commands.registerCommand("worktreeNavigator.refresh", () => {
      data.refresh();
    }),
    vscode.commands.registerCommand(
      "worktreeNavigator.switch",
      (item?: WorktreeItem) => {
        if (item && !item.worktree.current) {
          void switchToWorktree(item.worktree.path);
        }
      },
    ),
    vscode.commands.registerCommand("worktreeNavigator.switchMode", () => {
      void toggleViewMode();
    }),
    vscode.commands.registerCommand("worktreeNavigator.togglePane", () => {
      void togglePane(() => treeView.visible || webviewProvider.isVisible());
    }),
    vscode.commands.registerCommand(
      "worktreeNavigator.createWorktree",
      (arg?: RepoItem | { repoRoot?: string }) => {
        void createWorktree(data, repoRootOf(arg));
      },
    ),
    vscode.commands.registerCommand(
      "worktreeNavigator.removeWorktree",
      (arg?: WorktreeItem | { path?: string }) => {
        const p = pathOf(arg);
        if (p) {
          void removeWorktreeAction(data, p);
        }
      },
    ),
    vscode.commands.registerCommand(
      "worktreeNavigator.archiveWorktree",
      (arg?: WorktreeItem | { path?: string }) => {
        const p = pathOf(arg);
        if (p) {
          void removeWorktreeAction(data, p, { archive: true });
        }
      },
    ),
    // Refresh when worktree metadata changes on disk (add/remove/HEAD move).
    createWorktreeWatcher(data),
    // Keep the context key in sync if the setting is edited directly.
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration("worktreeNavigator.viewMode")) {
        syncViewModeContext();
      }
    }),
  );

  // Refresh when repositories are opened/closed in the workspace.
  void getGitAPI().then((api) => {
    if (!api) {
      return;
    }
    context.subscriptions.push(
      api.onDidOpenRepository(() => data.refresh()),
      api.onDidCloseRepository(() => data.refresh()),
    );
  });
}

export function deactivate(): void {}

function getViewMode(): ViewMode {
  const mode = vscode.workspace
    .getConfiguration("worktreeNavigator")
    .get<ViewMode>("viewMode", "pane");
  return mode === "tree" ? "tree" : "pane";
}

/** Mirror the viewMode setting into a context key the views' `when` clauses read. */
function syncViewModeContext(): void {
  void vscode.commands.executeCommand(
    "setContext",
    "worktreeNavigator.viewMode",
    getViewMode(),
  );
}

async function toggleViewMode(): Promise<void> {
  const next: ViewMode = getViewMode() === "pane" ? "tree" : "pane";
  await vscode.workspace
    .getConfiguration("worktreeNavigator")
    .update("viewMode", next, vscode.ConfigurationTarget.Global);
  // onDidChangeConfiguration will re-sync the context key.
}

/** Resolve a repo root from a command argument (tree RepoItem or webview msg). */
function repoRootOf(arg?: RepoItem | { repoRoot?: string }): string | undefined {
  if (arg instanceof RepoItem) {
    return arg.repo.root;
  }
  return arg?.repoRoot;
}

/** Resolve a worktree path from a command argument (tree item or webview msg). */
function pathOf(arg?: WorktreeItem | { path?: string }): string | undefined {
  if (arg instanceof WorktreeItem) {
    return arg.worktree.path;
  }
  return arg?.path;
}

/**
 * Open the Worktrees view if it isn't showing, otherwise hide the sidebar —
 * the keyboard-shortcut open/close behavior. `isVisible` reports the real
 * visibility of whichever view (tree or pane) is active.
 */
async function togglePane(isVisible: () => boolean): Promise<void> {
  if (isVisible()) {
    await vscode.commands.executeCommand(
      "workbench.action.toggleSidebarVisibility",
    );
  } else {
    await vscode.commands.executeCommand(
      "workbench.view.extension.worktreeNavigator",
    );
  }
}

/** Watch repo worktree metadata and refresh the tree on changes. */
function createWorktreeWatcher(data: WorktreeData): vscode.Disposable {
  const watcher = vscode.workspace.createFileSystemWatcher(
    "**/.git/worktrees/**",
  );
  const refresh = () => data.refresh();
  watcher.onDidCreate(refresh);
  watcher.onDidChange(refresh);
  watcher.onDidDelete(refresh);
  return watcher;
}
