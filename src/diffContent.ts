import * as vscode from "vscode";
import { getFileAtRef } from "./git";

/** URI scheme for the read-only "base" (left) side of a worktree diff. */
export const DIFF_SCHEME = "wtn-base";

/**
 * Build a URI whose content is `relPath` as it exists at `ref` in the given
 * worktree. The path segment keeps the file name (so the diff editor detects
 * the language); the real lookup parameters live in the query.
 */
export function baseUri(
  worktreePath: string,
  ref: string,
  relPath: string,
): vscode.Uri {
  const query = new URLSearchParams({
    worktree: worktreePath,
    ref,
    relPath,
  }).toString();
  return vscode.Uri.from({ scheme: DIFF_SCHEME, path: "/" + relPath, query });
}

/** A URI that renders as empty (for the missing side of an add/delete). */
export function emptyUri(relPath: string): vscode.Uri {
  return vscode.Uri.from({
    scheme: DIFF_SCHEME,
    path: "/" + relPath,
    query: "empty=1",
  });
}

/** Serves the base-version (or empty) content for diff left/right sides. */
export class BaseContentProvider
  implements vscode.TextDocumentContentProvider
{
  async provideTextDocumentContent(uri: vscode.Uri): Promise<string> {
    const params = new URLSearchParams(uri.query);
    if (params.get("empty") === "1") {
      return "";
    }
    const worktree = params.get("worktree");
    const ref = params.get("ref");
    const relPath = params.get("relPath");
    if (!worktree || !ref || !relPath) {
      return "";
    }
    return getFileAtRef(worktree, ref, relPath);
  }
}
