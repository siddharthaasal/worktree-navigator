# Plan v1: Conductor-style Multi-Repo Worktree Sidebar

## Goal

Evolve the MVP sidebar (flat list of one repo's worktrees) into a
Conductor-style **grouped, multi-repository** view:

- Discover **all repositories** in the current workspace, not just one.
- Group worktrees **under their repository** ("project").
- Show a per-worktree **diff stat** (`+407`, `+1.3k -25`) on the right.
- Highlight the **active** worktree.
- Click a worktree to **switch** the window to it (unchanged from MVP).

Still a pure **visualization + switching** layer. We do **not** create,
delete, or modify worktrees. The `+` buttons in Conductor are intentionally
omitted.

---

## Visual Target

Reference (Conductor):

```text
Projects                          ⌕  ⊞
─────────────────────────────────────
🟪 canvas                          +
   ⤳ feat: release notes …    +407
🟪 foundation                      +
   ⤳ feat: impleme…       +1.3k -25   ← active (highlighted)
   ⎇ Dublin                   +501
   ⎇ Lisbon
   ⎇ Manado                   +501
   ⎇ Manama                   +501
🅿 website                         +
   ⎇ Mumbai
   ⎇ Enable 5 more bl…      +72 -8
   ⎇ Codebase restructure …
```

Our adaptation (no `+`, no PR-merge glyph for MVP):

```text
WORKTREES
─────────────────────────────────────
▾ canvas
    ● main                  +407
    ○ feature/auth      +1.3k -25
▾ foundation
    ● main
    ○ dashboard-redesign    +501
    ○ api-refactor          +120 -8
```

Notes on fidelity limits in the VS Code TreeView API:
- We cannot paint a custom highlighted row background like Conductor. The
  **active worktree** is conveyed with a filled icon (`●` / `circle-filled`)
  vs hollow (`○` / `circle-outline`), as in the MVP.
- Diff stats render in the TreeItem **description** (right-aligned, dimmed) —
  which matches Conductor's placement.
- Repo rows render as **collapsible parent nodes**, expanded by default.

---

## Architecture

Two-level tree:

```text
RepoNode (collapsible, expanded)        ← one per discovered repository
└── WorktreeNode (leaf, clickable)      ← one per `git worktree list` entry
```

Updated `src/` layout:

```text
src/
├── extension.ts                  activation, commands, tree + watcher registration
├── WorktreeProvider.ts           TreeDataProvider — two-level (repo → worktree)
├── repos.ts                      NEW: discover repositories in the workspace
├── git.ts                        run git: worktree list  +  diff stats
├── models/
│   ├── Worktree.ts               + repoRoot, diffStat fields
│   └── Repo.ts                   NEW: { root, name, worktrees }
└── utils/
    ├── parseWorktreeOutput.ts    (unchanged)
    └── formatDiffStat.ts         NEW: "+1.3k -25" formatting + parse --shortstat
```

---

## Data Model

```ts
// models/Worktree.ts  (extended)
type Worktree = {
  path: string;
  branch?: string;
  current: boolean;
  detached: boolean;
  bare: boolean;
  repoRoot: string;          // common-dir root this worktree belongs to
  diffStat?: DiffStat;       // filled in asynchronously, may stay undefined
};

type DiffStat = { insertions: number; deletions: number };

// models/Repo.ts  (new)
type Repo = {
  root: string;              // main working directory of the repository
  name: string;              // display label (basename of root)
  worktrees: Worktree[];
};
```

---

## Repository Discovery (multi-repo)

Requirement: "I'm in a workspace and there are multiple repositories in it —
pick them all up."

**Primary source — the built-in Git extension API.** VS Code's bundled
`vscode.git` extension already tracks every open repository (including nested
ones and multi-root folders). We read its `repositories` list:

```ts
const gitExt = vscode.extensions.getExtension("vscode.git")?.exports;
const api = gitExt?.getAPI(1);
const roots = api.repositories.map(r => r.rootUri.fsPath);
```

**Fallback — workspace folders.** If the Git extension is unavailable, use
`vscode.workspace.workspaceFolders` and probe each for a repo via
`git rev-parse --show-toplevel`.

**Dedup by common dir.** Two worktrees of the same repo each report as a repo
root by `--show-toplevel`. To group correctly we key each repository by its
`git rev-parse --git-common-dir` (the shared `.git`), so all worktrees of one
repo collapse into a single `Repo` group regardless of which worktree folder
is open. The `Repo.root` we display is the **main** worktree of that group.

For each unique repository we then run `git worktree list --porcelain` (already
implemented) to enumerate its worktrees.

---

## Diff Stats

**Decided (D2): uncommitted working-tree changes only.** Each worktree shows
the lines changed in its dirty working tree — what's in progress, not the
branch's total divergence. This keeps stat computation to a single cheap git
call per worktree with no base-branch resolution.

- **Command:** `git diff --shortstat` (tracked, unstaged + staged via
  `--shortstat HEAD`) run with `cwd` = the worktree path.
- **Parsing:** `--shortstat` emits e.g. `3 files changed, 407 insertions(+), 25 deletions(-)`. Parse insertions/deletions; render `+407 -25`, abbreviating ≥1000 as `1.3k`.
- A clean worktree (0/0) shows no stat.

**Performance / UX:**
- Diff stats are computed **lazily and in parallel, off the render path**. The
  tree renders immediately with labels; each stat fills in as its git call
  returns, firing a targeted tree refresh.
- Results are **cached** per (worktree path, HEAD sha) and recomputed only on
  refresh or when the file watcher fires.
- All git calls use `execFile` (no shell), bounded `maxBuffer`, and failures
  degrade to "no stat" rather than erroring the tree.

---

## Commands & Interaction

| Command | Behavior | Change vs MVP |
|---|---|---|
| `worktreeNavigator.refresh` | Re-discover repos + worktrees, invalidate stat cache | extended to repos |
| `worktreeNavigator.switch` | `vscode.openFolder(path, false)` — reuse window | unchanged |
| (click worktree row) | invokes switch | unchanged |
| (click repo row) | expand/collapse only — not clickable | new |

View title still has **Refresh**. No add/remove actions.

---

## Auto-refresh

MVP watches `**/.git/worktrees/**`. Extend to also refresh when:
- the set of repositories changes (`api.onDidOpenRepository` /
  `onDidCloseRepository` from the Git API), and
- a repo's HEAD moves (invalidate that repo's stat cache).

---

## Edge Cases

- **Single repo:** still rendered with its repo header (consistent with
  Conductor). (Decision D1 — could auto-flatten; see open questions.)
- **No repositories / not a git workspace:** show a placeholder tree item
  ("No git repositories found").
- **Detached HEAD / bare:** labelled `(detached HEAD)` / `(bare)` as in MVP;
  bare entries are listed but never the "current".
- **Huge diffs / slow git:** stat computation is time-boxed; on timeout the row
  shows no stat.
- **Worktree on a different filesystem / missing path:** listed but flagged via
  tooltip; switching still attempts `openFolder`.

---

## File-by-File Changes

1. `models/Worktree.ts` — add `repoRoot`, `diffStat`.
2. `models/Repo.ts` — new type.
3. `utils/formatDiffStat.ts` — new: parse `--shortstat`, format `+1.3k -25`.
4. `repos.ts` — new: discover + dedup repositories (Git API + fallback).
5. `git.ts` — add `getDiffStat(worktreePath, base)` and base-branch resolution.
6. `WorktreeProvider.ts` — two-level `getChildren` (repos → worktrees), async
   stat fill, repo/worktree `TreeItem` construction.
7. `extension.ts` — register Git API repo-change listeners; keep switch/refresh.
8. `package.json` — view title stays "Worktrees"; no new contributions needed
   (collapsible nodes need no manifest change).
9. `README.md` — document multi-repo grouping + diff stats.

---

## Milestones

- **M1 — Grouping:** repo discovery + dedup, two-level tree, single repo still
  works. (No stats yet.)
- **M2 — Multi-repo:** verify with a workspace containing ≥2 distinct repos.
- **M3 — Diff stats:** base resolution, async stat fill, formatting, caching.
- **M4 — Polish:** active highlight, empty/placeholder state, auto-refresh on
  repo open/close + HEAD move, README.

Each milestone compiles + typechecks; M2/M3 verified against real repos.

---

## Test Plan

- Unit: `formatDiffStat` (rounding, `k` abbreviation, zero → hidden),
  `--shortstat` parsing (insertions only / deletions only / both / none).
- Integration (throwaway repos): one repo multiple worktrees → one group;
  two repos → two groups; nested repo under a workspace folder → discovered;
  diff stat numbers match `git diff --shortstat` by hand.

---

## Non-Goals (unchanged)

No creation/deletion, no PR/GitHub/merge state, no agent status, no `+`
buttons, no custom row backgrounds. Future concerns.

---

## Decisions (resolved)

- **D1 — Single-repo display:** ✅ **Always show the repo header.** Consistent
  with multi-repo mode and Conductor.
- **D2 — Diff stat:** ✅ **Uncommitted working-tree changes only** (see Diff
  Stats above). No base-branch resolution.
- **D3 — Worktree label:** ✅ **Branch name** (dir basename when detached).
- **D4 — Repo icons:** generic `repo` `ThemeIcon`, themed by VS Code.
