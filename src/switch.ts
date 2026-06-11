import * as vscode from "vscode";
import { getCommonDir } from "./git";
import type { Repo } from "./models/Repo";

const norm = (p: string): string => p.replace(/[\\/]+$/, "");

/**
 * Compute the workspace folders that scope Source Control to one worktree per
 * repository: the target repo at `targetPath`, and every other known repo at
 * the worktree currently open for it (else its current/main worktree).
 *
 * This deliberately drops any non-worktree folder (e.g. a parent directory that
 * merely contains worktrees), since that's what makes git auto-detect every
 * worktree and clutter Source Control.
 */
export function computeScopedFolders(
  repos: Repo[],
  targetPath: string,
  currentFolderPaths: string[],
): string[] {
  const open = new Set(currentFolderPaths.map(norm));
  const targetRepo = repos.find((r) =>
    r.worktrees.some((w) => norm(w.path) === norm(targetPath)),
  );

  const desired: string[] = [];
  for (const repo of repos) {
    if (repo === targetRepo) {
      desired.push(targetPath);
      continue;
    }
    // Keep this repo at whatever worktree is currently open, else its current
    // worktree, else its main worktree.
    const openWt = repo.worktrees.find((w) => open.has(norm(w.path)));
    const currentWt = repo.worktrees.find((w) => w.current);
    desired.push((openWt ?? currentWt)?.path ?? repo.root);
  }
  if (!targetRepo) {
    desired.push(targetPath); // target's repo unknown — include it anyway
  }
  return [...new Set(desired.map(norm))];
}

/**
 * Switch to a worktree and scope the workspace to one worktree per repo, so the
 * built-in Source Control shows only the active worktrees (not every worktree
 * under an opened parent folder). Returns true if it took over (workspace
 * changed or already correct); false if it couldn't and the caller should fall
 * back to {@link switchToWorktree}.
 */
export function switchScoped(repos: Repo[], targetPath: string): boolean {
  const folders = vscode.workspace.workspaceFolders ?? [];
  if (folders.length === 0 || repos.length === 0) {
    return false;
  }
  const currentPaths = folders.map((f) => f.uri.fsPath);
  const desired = computeScopedFolders(repos, targetPath, currentPaths);

  const currentSet = new Set(currentPaths.map(norm));
  const sameSet =
    desired.length === currentSet.size && desired.every((p) => currentSet.has(p));
  if (sameSet) {
    return true; // already scoped correctly
  }

  vscode.workspace.updateWorkspaceFolders(
    0,
    folders.length,
    ...desired.map((p) => ({ uri: vscode.Uri.file(p) })),
  );
  return true;
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
