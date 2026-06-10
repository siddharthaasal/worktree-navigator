import * as vscode from "vscode";
import * as path from "node:path";
import type { WorktreeData } from "./WorktreeData";
import type { Repo } from "./models/Repo";
import type { Worktree } from "./models/Worktree";
import {
  addWorktree,
  deleteBranch,
  isWorktreeDirty,
  listBranches,
  removeWorktree,
} from "./git";
import { switchToWorktree } from "./switch";

/** Interactive flow to create a new worktree for a repository. */
export async function createWorktree(
  data: WorktreeData,
  repoRoot?: string,
): Promise<void> {
  const repos = await data.load();
  const repo = await resolveRepo(repos, repoRoot);
  if (!repo) {
    return;
  }

  const mode = await vscode.window.showQuickPick(
    [
      { label: "$(git-branch) New branch", id: "new" as const },
      { label: "$(check) Existing branch", id: "existing" as const },
    ],
    { placeHolder: `Create worktree in ${repo.name}` },
  );
  if (!mode) {
    return;
  }

  let branch: string;
  let createBranch: boolean;
  let startPoint: string | undefined;

  if (mode.id === "new") {
    const input = await vscode.window.showInputBox({
      prompt: `New branch name (worktree in ${repo.name})`,
      validateInput: (v) =>
        v.trim().length === 0
          ? "Branch name is required"
          : /\s/.test(v.trim())
            ? "Branch name cannot contain spaces"
            : undefined,
    });
    if (!input) {
      return;
    }
    branch = input.trim();
    createBranch = true;
  } else {
    const picked = await pickExistingBranch(repo);
    if (!picked) {
      return;
    }
    branch = picked.branch;
    createBranch = picked.createBranch;
    startPoint = picked.startPoint;
  }

  const defaultPath = defaultWorktreePath(repo.root, branch);
  const chosenPath = await vscode.window.showInputBox({
    prompt: "Worktree location",
    value: defaultPath,
    valueSelection: [defaultPath.length, defaultPath.length],
  });
  if (!chosenPath) {
    return;
  }

  try {
    await addWorktree(repo.root, {
      path: chosenPath,
      branch,
      createBranch,
      startPoint,
    });
  } catch (err) {
    void vscode.window.showErrorMessage(
      `Failed to create worktree: ${errorText(err)}`,
    );
    return;
  }

  data.refresh();
  const open = await vscode.window.showInformationMessage(
    `Created worktree “${branch}”.`,
    "Open",
  );
  if (open === "Open") {
    await switchToWorktree(chosenPath);
  }
}

/** Remove (and optionally, when `archive`, delete the branch of) a worktree. */
export async function removeWorktreeAction(
  data: WorktreeData,
  targetPath: string,
  opts: { archive?: boolean } = {},
): Promise<void> {
  const repos = await data.load();
  const found = findWorktree(repos, targetPath);
  if (!found) {
    return;
  }
  const { repo, worktree } = found;

  if (worktree.current) {
    void vscode.window.showWarningMessage(
      "Cannot remove the worktree currently open in this window.",
    );
    return;
  }
  if (normalize(worktree.path) === normalize(repo.root)) {
    void vscode.window.showWarningMessage(
      "Cannot remove the repository's main worktree.",
    );
    return;
  }

  const dirty = await isWorktreeDirty(worktree.path);
  const verb = opts.archive ? "Archive" : "Remove";
  const confirm = await vscode.window.showWarningMessage(
    `${verb} worktree “${worktree.branch ?? path.basename(worktree.path)}”?` +
      (dirty ? "\n\nThis worktree has uncommitted changes." : ""),
    { modal: true },
    dirty ? `${verb} (force)` : verb,
  );
  if (!confirm) {
    return;
  }

  try {
    await removeWorktree(worktree.path, { force: dirty });
  } catch (err) {
    void vscode.window.showErrorMessage(
      `Failed to remove worktree: ${errorText(err)}`,
    );
    return;
  }

  if (opts.archive && worktree.branch) {
    const del = await vscode.window.showInformationMessage(
      `Removed worktree. Also delete branch “${worktree.branch}”?`,
      "Delete branch",
      "Keep branch",
    );
    if (del === "Delete branch") {
      try {
        await deleteBranch(repo.root, worktree.branch);
      } catch (err) {
        void vscode.window.showErrorMessage(
          `Removed worktree, but failed to delete branch: ${errorText(err)}`,
        );
      }
    }
  }

  data.refresh();
}

// ── helpers ───────────────────────────────────────────

async function resolveRepo(
  repos: Repo[],
  repoRoot?: string,
): Promise<Repo | undefined> {
  if (repoRoot) {
    return repos.find((r) => normalize(r.root) === normalize(repoRoot));
  }
  if (repos.length === 0) {
    void vscode.window.showWarningMessage("No git repositories found.");
    return undefined;
  }
  if (repos.length === 1) {
    return repos[0];
  }
  const pick = await vscode.window.showQuickPick(
    repos.map((r) => ({ label: r.name, description: r.root, repo: r })),
    { placeHolder: "Select a repository" },
  );
  return pick?.repo;
}

async function pickExistingBranch(
  repo: Repo,
): Promise<
  { branch: string; createBranch: boolean; startPoint?: string } | undefined
> {
  const { local, remote } = await listBranches(repo.root);
  const checkedOut = new Set(
    repo.worktrees.map((w) => w.branch).filter(Boolean) as string[],
  );

  const localItems = local
    .filter((b) => !checkedOut.has(b))
    .map((b) => ({ label: `$(git-branch) ${b}`, branch: b, remote: false }));
  const remoteOnly = remote
    .filter((b) => !local.includes(b) && !checkedOut.has(b))
    .map((b) => ({
      label: `$(cloud) ${b}`,
      description: "remote",
      branch: b,
      remote: true,
    }));

  const items = [...localItems, ...remoteOnly];
  if (items.length === 0) {
    void vscode.window.showInformationMessage(
      "No branches available to check out (all are already in a worktree).",
    );
    return undefined;
  }

  const pick = await vscode.window.showQuickPick(items, {
    placeHolder: "Select a branch to check out",
  });
  if (!pick) {
    return undefined;
  }
  // Remote-only branches: create a local branch tracking origin/<name>.
  return pick.remote
    ? { branch: pick.branch, createBranch: true, startPoint: `origin/${pick.branch}` }
    : { branch: pick.branch, createBranch: false };
}

function defaultWorktreePath(repoRoot: string, branch: string): string {
  const configured = vscode.workspace
    .getConfiguration("worktreeNavigator")
    .get<string>("worktreesPath", "");
  const base = configured.trim() || path.dirname(repoRoot);
  const slug = branch
    .replace(/[^\w.-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
  return path.join(base, `${path.basename(repoRoot)}--${slug}`);
}

function findWorktree(
  repos: Repo[],
  targetPath: string,
): { repo: Repo; worktree: Worktree } | undefined {
  for (const repo of repos) {
    const worktree = repo.worktrees.find(
      (w) => normalize(w.path) === normalize(targetPath),
    );
    if (worktree) {
      return { repo, worktree };
    }
  }
  return undefined;
}

function errorText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function normalize(p: string): string {
  return p.replace(/[\\/]+$/, "");
}
