import * as vscode from "vscode";
import { WorktreeData } from "./WorktreeData";
import { WorktreeProvider, WorktreeItem } from "./WorktreeProvider";
import { WorktreeWebviewProvider } from "./WorktreeWebviewProvider";
import { getGitAPI } from "./repos";
import { getCommonDir } from "./git";

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

/**
 * Switch to a worktree by swapping the matching repository's folder in the
 * workspace, in place — keeping every other repo's folder untouched and
 * avoiding a full window reload.
 *
 * Matching is by shared git common-dir: the workspace folder that belongs to
 * the same repository as the target is replaced with the target path. If no
 * folder belongs to that repo (e.g. the repo is nested under an opened parent
 * folder), the worktree is added as an additional folder instead of wiping the
 * workspace. With no folders open at all, we fall back to opening it.
 */
export async function switchToWorktree(targetPath: string): Promise<void> {
  const folders = vscode.workspace.workspaceFolders ?? [];
  const targetUri = vscode.Uri.file(targetPath);

  if (folders.length === 0) {
    await vscode.commands.executeCommand("vscode.openFolder", targetUri, false);
    return;
  }

  const targetCommon = await getCommonDir(targetPath);
  if (targetCommon) {
    const commons = await Promise.all(
      folders.map((f) => getCommonDir(f.uri.fsPath)),
    );
    const idx = commons.findIndex(
      (c) => c && normalize(c) === normalize(targetCommon),
    );
    if (idx !== -1) {
      if (normalize(folders[idx].uri.fsPath) === normalize(targetPath)) {
        return; // already open at this worktree
      }
      vscode.workspace.updateWorkspaceFolders(idx, 1, { uri: targetUri });
      return;
    }
  }

  // No folder belongs to this repo — add the worktree without dropping others.
  vscode.workspace.updateWorkspaceFolders(folders.length, 0, { uri: targetUri });
}

function normalize(p: string): string {
  return p.replace(/[\\/]+$/, "");
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
