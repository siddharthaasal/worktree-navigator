import * as vscode from "vscode";

/**
 * Switch to a worktree by adding it to the workspace (if not already open) and
 * revealing it in the Explorer — keeping every other workspace folder intact.
 *
 * If the worktree is already a root folder, or nested under an open folder, we
 * just reveal it. With no folders open at all, we fall back to opening it.
 */
export async function switchToWorktree(targetPath: string): Promise<void> {
  const targetUri = vscode.Uri.file(targetPath);
  const folders = vscode.workspace.workspaceFolders ?? [];

  if (folders.length === 0) {
    await vscode.commands.executeCommand("vscode.openFolder", targetUri, false);
    return;
  }

  const targetNorm = normalize(targetPath);
  const isRootFolder = folders.some(
    (f) => normalize(f.uri.fsPath) === targetNorm,
  );
  if (isRootFolder || vscode.workspace.getWorkspaceFolder(targetUri)) {
    await focusFolder(targetUri);
    return;
  }

  const added = vscode.workspace.updateWorkspaceFolders(
    folders.length,
    0,
    { uri: targetUri },
  );
  if (added) {
    await focusFolder(targetUri);
  }
}

async function focusFolder(uri: vscode.Uri): Promise<void> {
  await vscode.commands.executeCommand("revealInExplorer", uri);
}

function normalize(p: string): string {
  return p.replace(/[\\/]+$/, "");
}
