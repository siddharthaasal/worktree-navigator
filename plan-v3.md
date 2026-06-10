# Plan v3: Actions + GitHub (create/remove, merged-archive, PR status)

## Goal

Turn the viewer into a tool. Three phases, built in order:

1. **Create + remove worktrees** (git only)
2. **Merged-branch detection + archive** (git only)
3. **GitHub PR status** — orange = open PR, etc. (GitHub auth + API)

> **Scope reversal:** plan-v0–v2 listed creation/deletion and GitHub as
> explicit non-goals. v3 intentionally reopens them. Everything is additive;
> the pure-viewer behavior remains the default until an action is taken.

GitHub auth: **VS Code built-in sign-in** (`vscode.authentication`), no tokens.

---

## Phase 1 — Create + Remove (git only)

### Create

- **Trigger:** `+` action on each repo header (webview) and command
  `worktreeNavigator.createWorktree` (also in tree view title / repo context).
- **Flow** (extension-host QuickPick/InputBox):
  1. Pick: **new branch** or **existing branch**.
  2. New → InputBox for branch name; start point defaults to the repo's base
     branch (resolved, see Phase 2). Existing → QuickPick of local + remote
     branches not already checked out in a worktree.
  3. Worktree path: default `<repoParent>/<repoName>--<branch-slug>`,
     prefilled in an InputBox so the user can edit. Configurable base dir via
     `worktreeNavigator.worktreesPath` (optional; default = repo's parent).
  4. Run `git worktree add [-b <new>] <path> <startpoint|branch>`.
  5. Refresh; then prompt **"Open worktree now?"** → `switchToWorktree`.
- **git.ts:** `addWorktree(repoRoot, { path, branch, createBranch, startPoint })`,
  `listBranches(repoRoot)` (local + remote, minus checked-out).
- **Errors** surfaced via `showErrorMessage` (path exists, branch exists, etc.).

### Remove

- **Trigger:** per-row action (webview hover `×`) and command
  `worktreeNavigator.removeWorktree` (tree context menu).
- **Guards:** never the **current** or the **main** worktree. Confirm via
  modal. If the worktree is **dirty**, the confirm offers **Force**.
- **git.ts:** `removeWorktree(path, { force })` → `git worktree remove [--force]`.

---

## Phase 2 — Merged detection + archive (git only)

- **Base branch resolution:** `git symbolic-ref refs/remotes/origin/HEAD` →
  fall back to `main` → `master` → repo's first branch. Cached per repo.
- **Merged set:** `git branch --merged <base>` → branch names merged into base.
  Mark `worktree.merged = true` (excluding the base branch itself).
- **Rendering:** merged rows are **dimmed** with a small `merged` tag, and
  sorted to the bottom of their repo group. (No separate section for v3 —
  keeps the tree simple; can revisit.)
- **Archive action:** `worktreeNavigator.archiveWorktree` = remove the worktree,
  then offer to **delete the merged branch** (`git branch -d`). Confirm modal.
  Same current/main guards as remove.
- **Model:** add `merged: boolean` to `Worktree`; computed in `WorktreeData`
  alongside diff stats (one `git branch --merged` per repo, cached + refreshed).

---

## Phase 3 — GitHub PR status (auth + API)

### Enablement & auth

- Off by default behind `worktreeNavigator.showPullRequests` (boolean) — avoids
  surprise sign-in prompts. A **"Sign in to GitHub"** action appears when
  enabled but unauthenticated.
- Auth: `vscode.authentication.getSession('github', ['repo'], { createIfNone })`.
  `createIfNone:false` for silent refresh; `true` only on explicit user action.

### Remote resolution

- `git remote get-url origin` → parse `github.com` `owner/repo` from both
  HTTPS (`https://github.com/o/r.git`) and SSH (`git@github.com:o/r.git`).
  Repos without a GitHub origin simply show no PR data.

### Fetching

- GitHub **GraphQL** (`https://api.github.com/graphql`) per repo:
  `repository(owner,name){ pullRequests(first:100, states:[OPEN,MERGED,CLOSED]){
  nodes{ number state isDraft headRefName url } } }`.
  Map `headRefName → PR` (most recent wins). Pagination beyond 100 deferred;
  `log()`/note if truncated.
- **Cache** per repo with a short TTL; refresh on the Refresh command and on a
  manual interval. Network/auth failures degrade silently to "no PR".

### Rendering (state → icon color)

| PR state | Icon | Color |
|---|---|---|
| Open (not draft) | PR glyph | **orange** |
| Draft | PR glyph | gray |
| Merged | PR glyph | purple |
| Closed (unmerged) | PR glyph | red |
| No PR | — | — |

- Show `#<number>`; clicking the PR icon opens the PR URL
  (`vscode.env.openExternal`). Tooltip: `PR #123 · open`.
- **Model:** add optional `pr?: { number, state, isDraft, url }` to the view
  payload; the tree shows a colored ThemeIcon, the webview a colored glyph.

### Boundaries

- **Read-only.** No creating/merging/closing PRs. No write scopes used beyond
  what `repo` read requires.

---

## Cross-cutting

- **New git surface** all lands in `git.ts` (add/remove worktree, list branches,
  base resolution, merged set, remote url) — pure functions, unit-testable.
- **GitHub client** isolated in `github.ts` (auth + GraphQL + parsing + cache).
- `WorktreeData` orchestrates: discover → merged flags → (optional) PR data,
  firing `onDidChange` as async data resolves; both views consume unchanged.
- **Webview** gains per-row/per-header action buttons (create/remove/archive,
  PR icon) via `postMessage`; all mutations run in the extension host.
- Each phase: typecheck + compile; git phases verified against throwaway repos;
  GitHub phase verified interactively (sign-in required).

---

## Milestones / commits

- **C1:** Phase 1 — create + remove.
- **C2:** Phase 2 — merged detection + archive + coloring.
- **C3:** Phase 3 — GitHub PR status (auth, client, rendering, setting).

---

## Open Questions (defaults chosen; flag to change)

- **Worktree path scheme:** default `<repoParent>/<repoName>--<branch>` *[default]*.
- **Merged UI:** dim + tag + sort-to-bottom *[default]* vs a dedicated
  collapsible "Merged" section.
- **PR fetch cap:** first 100 PRs/repo for v3 *[default]*; paginate later.
