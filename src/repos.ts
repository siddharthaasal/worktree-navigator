import * as vscode from "vscode";
import * as path from "node:path";
import { getCommonDir, listWorktrees } from "./git";
import type { Repo } from "./models/Repo";

/**
 * Minimal shape of the built-in `vscode.git` extension API (v1) that we use.
 * We avoid a hard dependency on its types and only read what we need.
 */
interface GitAPI {
  repositories: { rootUri: vscode.Uri }[];
  onDidOpenRepository: vscode.Event<unknown>;
  onDidCloseRepository: vscode.Event<unknown>;
}
interface GitExtensionExports {
  getAPI(version: 1): GitAPI;
}

/** Return the Git extension API, activating the extension if needed. */
export async function getGitAPI(): Promise<GitAPI | undefined> {
  const ext = vscode.extensions.getExtension<GitExtensionExports>("vscode.git");
  if (!ext) {
    return undefined;
  }
  const exports = ext.isActive ? ext.exports : await ext.activate();
  return exports?.getAPI(1);
}

/**
 * Discover all repositories in the current workspace and their worktrees,
 * grouped by shared git common-dir so that worktrees of the same repo collapse
 * into a single group. Worktrees open in the window are marked `current`.
 */
export async function discoverRepos(): Promise<Repo[]> {
  const openPaths = new Set(
    (vscode.workspace.workspaceFolders ?? []).map((f) => normalize(f.uri.fsPath)),
  );

  const candidates = await candidateRoots();

  // Map common-dir -> the first candidate path seen for it (any worktree of
  // the repo can enumerate the whole group).
  const byCommonDir = new Map<string, string>();
  for (const root of candidates) {
    const commonDir = await getCommonDir(root);
    if (commonDir && !byCommonDir.has(commonDir)) {
      byCommonDir.set(commonDir, root);
    }
  }

  const repos: Repo[] = [];
  for (const [commonDir, anyPath] of byCommonDir) {
    const repoRoot = mainWorktreeRoot(commonDir);
    const worktrees = await listWorktrees(anyPath, undefined, repoRoot);
    if (worktrees.length === 0) {
      continue;
    }
    for (const wt of worktrees) {
      if (openPaths.has(normalize(wt.path))) {
        wt.current = true;
      }
    }
    repos.push({
      root: repoRoot,
      name: path.basename(repoRoot) || repoRoot,
      worktrees,
    });
  }

  repos.sort((a, b) => a.name.localeCompare(b.name));
  return repos;
}

/**
 * Candidate repository roots to probe: the Git extension's tracked
 * repositories (primary), unioned with workspace folders (fallback / extra
 * coverage). Deduped; common-dir grouping happens in `discoverRepos`.
 */
async function candidateRoots(): Promise<string[]> {
  const roots = new Set<string>();

  const api = await getGitAPI();
  for (const repo of api?.repositories ?? []) {
    roots.add(repo.rootUri.fsPath);
  }

  for (const folder of vscode.workspace.workspaceFolders ?? []) {
    roots.add(folder.uri.fsPath);
  }

  return [...roots];
}

/**
 * Derive the main worktree directory from a common-dir. Normal repos report
 * `<root>/.git`; bare repos report the bare directory itself.
 */
function mainWorktreeRoot(commonDir: string): string {
  const trimmed = normalize(commonDir);
  return path.basename(trimmed) === ".git" ? path.dirname(trimmed) : trimmed;
}

function normalize(p: string): string {
  return p.replace(/[\\/]+$/, "");
}
