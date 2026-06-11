import * as vscode from "vscode";
import * as path from "node:path";
import { WorktreeData } from "./WorktreeData";
import { WorktreeProvider, WorktreeItem, RepoItem } from "./WorktreeProvider";
import { WorktreeWebviewProvider } from "./WorktreeWebviewProvider";
import { ChangesProvider } from "./ChangesProvider";
import { FocusManager } from "./focus";
import { BaseContentProvider, DIFF_SCHEME, baseUri, emptyUri } from "./diffContent";
import { getGitAPI } from "./repos";
import { switchToWorktree, switchScoped } from "./switch";
import { createWorktree, removeWorktreeAction } from "./actions";
import type { ChangedFile } from "./git";

type ViewMode = "tree" | "pane";

export function activate(context: vscode.ExtensionContext): void {
  const data = new WorktreeData();
  context.subscriptions.push(data);

  const focus = new FocusManager();
  context.subscriptions.push(focus);

  const treeProvider = new WorktreeProvider(data);
  const webviewProvider = new WorktreeWebviewProvider(
    context.extensionUri,
    data,
    (p) => focusAndSwitch(data, focus, p),
  );
  const changesProvider = new ChangesProvider(focus);
  context.subscriptions.push(changesProvider);
  // Re-render Changes when underlying data refreshes (e.g. files changed).
  data.onDidChange(() => changesProvider.refresh());

  syncViewModeContext();

  const treeView = vscode.window.createTreeView("worktreeNavigator.worktrees", {
    treeDataProvider: treeProvider,
  });
  const changesView = vscode.window.createTreeView("worktreeNavigator.changes", {
    treeDataProvider: changesProvider,
  });

  // Focus the Changes view on the current worktree at startup.
  void data.load().then((repos) => {
    for (const repo of repos) {
      const current = repo.worktrees.find((w) => w.current);
      if (current) {
        focus.set({
          worktreePath: current.path,
          label: current.branch ?? path.basename(current.path),
        });
        break;
      }
    }
  });

  context.subscriptions.push(
    treeView,
    changesView,
    vscode.workspace.registerTextDocumentContentProvider(
      DIFF_SCHEME,
      new BaseContentProvider(),
    ),
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
          void focusAndSwitch(data, focus, item.worktree.path);
        }
      },
    ),
    vscode.commands.registerCommand(
      "worktreeNavigator.openChange",
      (arg?: { worktreePath: string; ref: string; file: ChangedFile }) => {
        if (arg) {
          void openChange(arg);
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
    vscode.commands.registerCommand("worktreeNavigator.signInGitHub", () => {
      void signInGitHub(data);
    }),
    // Refresh when worktree metadata changes on disk (add/remove/HEAD move).
    createWorktreeWatcher(data),
    // Keep the context key in sync if the setting is edited directly.
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration("worktreeNavigator.viewMode")) {
        syncViewModeContext();
      }
      if (e.affectsConfiguration("worktreeNavigator.showPullRequests")) {
        const enabled = vscode.workspace
          .getConfiguration("worktreeNavigator")
          .get<boolean>("showPullRequests", false);
        if (enabled) {
          // Prompt sign-in now so PR data actually loads (then refreshes).
          void signInGitHub(data);
        } else {
          data.refresh();
        }
      }
      if (
        e.affectsConfiguration("worktreeNavigator.showDiffStat") ||
        e.affectsConfiguration("worktreeNavigator.showSubtitle")
      ) {
        data.refresh();
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

/** Trigger an interactive GitHub sign-in, then refresh so PR data loads. */
async function signInGitHub(data: WorktreeData): Promise<void> {
  try {
    const session = await vscode.authentication.getSession("github", ["repo"], {
      createIfNone: true,
    });
    if (session) {
      data.refresh();
    }
  } catch (err) {
    void vscode.window.showErrorMessage(
      `GitHub sign-in failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

/** Focus the Changes view on a worktree, then switch the workspace to it. */
async function focusAndSwitch(
  data: WorktreeData,
  focus: FocusManager,
  targetPath: string,
): Promise<void> {
  const norm = (p: string) => p.replace(/[\\/]+$/, "");
  const repos = await data.load();
  let label = path.basename(targetPath);
  for (const repo of repos) {
    const wt = repo.worktrees.find((w) => norm(w.path) === norm(targetPath));
    if (wt) {
      label = wt.branch ?? path.basename(wt.path);
      break;
    }
  }
  focus.set({ worktreePath: targetPath, label });

  const scope = vscode.workspace
    .getConfiguration("worktreeNavigator")
    .get<boolean>("scopeSourceControl", true);
  // Scope the workspace to one worktree per repo so Source Control isn't
  // cluttered by every worktree; fall back to the in-place folder swap.
  if (!scope || !switchScoped(repos, targetPath)) {
    await switchToWorktree(targetPath);
  }
}

/** Open the diff editor for a changed file (base ref ↔ working tree). */
async function openChange(arg: {
  worktreePath: string;
  ref: string;
  file: ChangedFile;
}): Promise<void> {
  const { worktreePath, ref, file } = arg;
  const onDisk = vscode.Uri.file(path.join(worktreePath, file.path));
  const left =
    file.status === "A" ? emptyUri(file.path) : baseUri(worktreePath, ref, file.oldPath ?? file.path);
  const right = file.status === "D" ? emptyUri(file.path) : onDisk;
  const title = `${path.basename(file.path)} (${shortRef(ref)} ↔ working)`;
  await vscode.commands.executeCommand("vscode.diff", left, right, title);
}

/** Shorten a 40-char SHA to 7; leave named refs untouched. */
function shortRef(ref: string): string {
  return /^[0-9a-f]{40}$/.test(ref) ? ref.slice(0, 7) : ref;
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
