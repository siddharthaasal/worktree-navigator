# Plan v4: Per-Worktree Diff Tree

## Problem

Switching swaps the workspace folder, but VS Code's built-in Source Control
view still shows changes across **all** open folders/repos at once. When you
focus one worktree, you want to see **only that worktree's changed files** — a
diff tree scoped to it, following VS Code's normal diff behavior (changes
relative to what's on the remote/base).

## Goal

A dedicated **Changes** view that lists the changed files of a single focused
worktree, where clicking a file opens the normal VS Code diff editor. Scoped,
not workspace-wide.

---

## What it looks like

A second view in the Worktrees sidebar container, below the worktree list:

```text
WORKTREES
  ▾ foundation
      ⎇ feat/split-dealer-report   +302 -3   ← focused (click)
      ⎇ dublin
─────────────────────────────────
CHANGES · feat/split-dealer-report
  ▾ src/
      M  dealerReport.ts          +120 -3
      A  splitView.tsx            +180
  ▾ test/
      M  report.test.ts           +2
  package.json                    M
```

- Folder grouping (like SCM "tree" mode), status letter (M/A/D/R) colored with
  `gitDecoration` theme colors, optional per-file `+/-`.
- Clicking a file → `vscode.diff` editor (base version ↔ working version).
- Header shows which worktree is focused.

---

## Design

### Focused worktree

The Changes view tracks one **focused** worktree:
- Defaults to the **active/current** worktree (the one open in the window).
- Clicking a worktree in the pane **focuses** it here (decision Q2 decides
  whether that also switches, or focus-only as a preview).
- Updates on switch, on a manual refresh, and when files change under the
  focused worktree path (scoped `FileSystemWatcher`).

### Diff baseline (decision Q1)

The set of files shown depends on the baseline:

- **A — Branch vs base (PR-style):** everything this branch changed relative to
  the base branch (`origin/HEAD` → main/master), via
  `git diff --name-status $(git merge-base <base> HEAD)` plus uncommitted
  changes. Matches "what's different from what's on GitHub." *(recommended)*
- **B — Working tree vs HEAD:** only uncommitted changes — exactly VS Code's
  default SCM list.
- **C — Branch vs upstream:** vs `origin/<branch>` — unpushed commits +
  uncommitted.

### File list

- `git diff --name-status <range>` → parse status + path (handle renames
  `R100 old new`). Per-file `+/-` from `git diff --numstat <range>` (optional,
  async like the worktree stats).
- Build a folder-grouped tree (collapsible) or flat list (config toggle;
  default tree).

### Opening a diff

- Register a read-only `TextDocumentContentProvider` for the **left** side under
  a custom scheme (e.g. `wtn-base:`), whose content is `git show <ref>:<path>`
  run in the focused worktree. Right side = the on-disk file `Uri`.
- `vscode.diff(leftUri, rightUri, "<file> (worktree ↔ base)")`.
- Added files → empty left; deleted files → empty right. Binary files → open
  the file instead of a text diff.

### Architecture

```text
src/
├── ChangesProvider.ts      NEW: TreeDataProvider for the Changes view
├── diffContent.ts          NEW: TextDocumentContentProvider (git show <ref>:<path>)
├── focus.ts                NEW: tracks + broadcasts the focused worktree
├── git.ts                  + getChangedFiles(worktree, range), getFileAtRef
└── extension.ts            register the view, content provider, focus wiring
```

- `git.ts` stays the pure git surface; new functions are unit-testable.
- The Changes view reuses the focused worktree's repo info from `WorktreeData`.

### Commands / interaction

- `worktreeNavigator.focusWorktree` — set the focused worktree (from a pane
  click or a per-row "Show changes" action).
- `worktreeNavigator.openChange` — open the diff for a file (the file node's
  command).
- `worktreeNavigator.refresh` also refreshes Changes.

---

## Milestones

- **M1:** ChangesProvider + git getChangedFiles for the chosen baseline; renders
  the focused (current) worktree's files, flat list.
- **M2:** Diff opening via content provider; status colors; folder grouping.
- **M3:** Focus wiring (pane click / action) + scoped watcher + per-file `+/-`.

---

## Non-goals (this plan)

No staging/commit/discard actions (it's a viewer, not a replacement for SCM —
the built-in Source Control still does those). No cross-worktree comparison.

---

## Decisions (resolved)

- **Q1 — Baseline:** ✅ **Branch vs upstream** (`origin/<branch>` → working
  tree): unpushed commits + uncommitted edits. **Fallback** when the branch has
  no upstream (local-only): merge-base with the base branch, else `HEAD`.
- **Q2 — Focus model:** ✅ **Switch + focus** — clicking a worktree switches the
  workspace to it and focuses the Changes view on it.
- **Q3 — Placement:** ✅ Changes view **below the worktree list** in the sidebar.

### Implications of "branch vs upstream"
- Compare ref per worktree: `@{upstream}` if set; else `merge-base(base, HEAD)`;
  else `HEAD`. The same ref feeds both the file list (`git diff --name-status
  <ref>`) and each diff's left side (`git show <ref>:<path>`).
- Local-only worktrees (no upstream) effectively show their working-tree +
  committed changes vs base — the closest meaningful diff.
