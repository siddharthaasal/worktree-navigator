import * as vscode from "vscode";
import * as path from "node:path";
import { randomBytes } from "node:crypto";
import type { WorktreeData } from "./WorktreeData";
import type { Repo } from "./models/Repo";
import { worktreeLabel } from "./utils/worktreeLabel";
import { branchState } from "./utils/branchState";
import { worktreeIcon } from "./utils/worktreeIcon";

/** Serializable view model posted to the webview. */
interface RepoView {
  root: string;
  name: string;
  avatarUrl?: string;
  worktrees: WorktreeView[];
}
interface WorktreeView {
  path: string;
  label: string;
  /** Worktree folder basename, shown as a dimmed subtitle when it differs. */
  dir: string;
  current: boolean;
  bare: boolean;
  /** True for the repository's main worktree (cannot be removed). */
  isMain: boolean;
  /** Branch lifecycle, used in the hover tooltip. */
  state: "merged" | "pushed" | "local";
  /** codicon id for the row icon (branch / merge / pull-request variants). */
  icon: string;
  /** Color tone for the icon. */
  tone: string;
  /** Associated GitHub PR, when enabled and found. */
  pr?: { number: number; state: string; isDraft: boolean; url: string };
  insertions: number;
  deletions: number;
}

/** Messages received from the webview. */
type InboundMessage =
  | { type: "switch"; path: string }
  | { type: "create"; repoRoot: string }
  | { type: "remove"; path: string }
  | { type: "archive"; path: string }
  | { type: "openPr"; url: string }
  | { type: "refresh" }
  | { type: "ready" };

/**
 * Renders the worktree list as a rich webview in the sidebar — the "pane" mode.
 * Shares all data with the tree view through `WorktreeData`; this class only
 * owns the HTML shell and message passing.
 */
export class WorktreeWebviewProvider implements vscode.WebviewViewProvider {
  static readonly viewId = "worktreeNavigator.pane";

  private view?: vscode.WebviewView;

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly data: WorktreeData,
    private readonly onSwitch: (path: string) => void | Promise<void>,
  ) {
    this.data.onDidChange(() => void this.render());
  }

  /** Whether the pane is currently visible in the sidebar. */
  isVisible(): boolean {
    return this.view?.visible ?? false;
  }

  resolveWebviewView(view: vscode.WebviewView): void {
    this.view = view;
    view.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.mediaRoot()],
    };
    view.webview.html = this.html(view.webview);

    view.webview.onDidReceiveMessage((msg: InboundMessage) => {
      switch (msg.type) {
        case "switch":
          void Promise.resolve(this.onSwitch(msg.path));
          break;
        case "create":
          void vscode.commands.executeCommand(
            "worktreeNavigator.createWorktree",
            { repoRoot: msg.repoRoot },
          );
          break;
        case "remove":
          void vscode.commands.executeCommand(
            "worktreeNavigator.removeWorktree",
            { path: msg.path },
          );
          break;
        case "archive":
          void vscode.commands.executeCommand(
            "worktreeNavigator.archiveWorktree",
            { path: msg.path },
          );
          break;
        case "openPr":
          void vscode.env.openExternal(vscode.Uri.parse(msg.url));
          break;
        case "refresh":
          this.data.refresh();
          break;
        case "ready":
          void this.render();
          break;
      }
    });

    // Re-push data whenever the view becomes visible again.
    view.onDidChangeVisibility(() => {
      if (view.visible) {
        void this.render();
      }
    });

    void this.render();
  }

  /** Push the current repo/worktree data to the webview. */
  private async render(): Promise<void> {
    if (!this.view) {
      return;
    }
    const repos = await this.data.load();
    await this.view.webview.postMessage({
      type: "render",
      repos: repos.map(toRepoView),
    });
  }

  private mediaRoot(): vscode.Uri {
    return vscode.Uri.joinPath(this.extensionUri, "media", "webview");
  }

  private html(webview: vscode.Webview): string {
    const nonce = randomBytes(16).toString("base64");
    const asset = (name: string) =>
      webview.asWebviewUri(vscode.Uri.joinPath(this.mediaRoot(), name));
    const csp = [
      `default-src 'none'`,
      `style-src ${webview.cspSource}`,
      `font-src ${webview.cspSource}`,
      `script-src 'nonce-${nonce}'`,
      // Remote avatars from GitHub (github.com redirects to avatars.*).
      `img-src ${webview.cspSource} https://github.com https://avatars.githubusercontent.com`,
    ].join("; ");

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="${csp}" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <link rel="stylesheet" href="${asset("codicons/codicon.css")}" />
  <link rel="stylesheet" href="${asset("main.css")}" />
  <title>Worktrees</title>
</head>
<body>
  <div id="root"></div>
  <script nonce="${nonce}" src="${asset("main.js")}"></script>
</body>
</html>`;
  }
}

function normalizePath(p: string): string {
  return p.replace(/[\\/]+$/, "");
}

function toRepoView(repo: Repo): RepoView {
  return {
    root: repo.root,
    name: repo.name,
    avatarUrl: repo.avatarUrl,
    worktrees: repo.worktrees.map((wt) => ({
      path: wt.path,
      label: worktreeLabel(wt),
      dir: path.basename(wt.path),
      current: wt.current,
      bare: wt.bare,
      isMain: normalizePath(wt.path) === normalizePath(repo.root),
      state: branchState(wt),
      icon: worktreeIcon(wt).icon,
      tone: worktreeIcon(wt).tone,
      pr: wt.pr,
      insertions: wt.diffStat?.insertions ?? 0,
      deletions: wt.diffStat?.deletions ?? 0,
    })),
  };
}
