/**
 * Map a worktree's situation to the most appropriate git icon + color tone.
 *
 * The icon *shape* conveys the kind of state (branch / merge / pull-request
 * variants), while the *tone* conveys lifecycle (purple merged, orange in
 * progress, etc.). Icon names are codicon ids — the same git family Lucide
 * exposes — so both the tree (ThemeIcon) and the webview (codicon class) can
 * use this one source of truth.
 *
 * Precedence: merged → PR state (closed/draft/open) → pushed → local → detached.
 */
export type IconTone = "purple" | "orange" | "gray" | "red" | "default";

export interface IconDescriptor {
  /** codicon id, e.g. "git-merge". */
  icon: string;
  tone: IconTone;
}

export function worktreeIcon(wt: {
  merged?: boolean;
  pushed?: boolean;
  detached?: boolean;
  branch?: string;
  pr?: { state: string; isDraft: boolean };
}): IconDescriptor {
  const pr = wt.pr;

  if (wt.merged || pr?.state === "MERGED") {
    return { icon: "git-merge", tone: "purple" };
  }
  if (pr) {
    if (pr.state === "CLOSED") {
      return { icon: "git-pull-request-closed", tone: "red" };
    }
    if (pr.isDraft) {
      return { icon: "git-pull-request-draft", tone: "gray" };
    }
    return { icon: "git-pull-request", tone: "orange" }; // open
  }
  if (wt.detached || !wt.branch) {
    return { icon: "git-commit", tone: "default" };
  }
  if (wt.pushed) {
    return { icon: "git-branch", tone: "orange" };
  }
  return { icon: "git-branch", tone: "default" };
}
