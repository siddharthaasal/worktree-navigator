import * as vscode from "vscode";
import { getCommonDir } from "./git";

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
