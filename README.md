# Worktree Navigator

A lightweight VS Code / Cursor extension that visualizes and switches Git
worktrees from a sidebar.

## What it does

- Adds a **Worktrees** icon to the Activity Bar.
- Discovers **all repositories** in the workspace (via the built-in Git
  extension), grouped Conductor-style as **repo → worktrees**.
- Lists each repo's worktrees (`git worktree list --porcelain`), deduped by the
  shared `.git` so all worktrees of one repo collapse into one group.
- Shows a per-worktree **diff stat** (`+407`, `+1.3k -25`) of uncommitted
  working-tree changes, including new untracked files.
- Marks the worktree open in the current window with a filled circle (others
  are hollow).
- Click any other worktree to switch the current window to it (reuses the
  window — no new window).
- **Refresh Worktrees** command (refresh icon in the view title bar) re-reads
  everything; the tree also auto-refreshes when repos open/close or worktree
  metadata changes.

It is intentionally a visualization + switching layer — no worktree
creation/deletion, no agent/PR/Git features. See [plan-v0.md](plan-v0.md) (MVP)
and [plan-v1.md](plan-v1.md) (multi-repo grouping + diff stats) for scope and
non-goals.

## Develop

```bash
npm install
npm run compile      # bundle to dist/extension.js
npm run typecheck    # tsc --noEmit
npm run watch        # rebuild on change
```

Press **F5** (Run Extension) to launch an Extension Development Host. Open a
repository that has worktrees and click the Worktrees icon.

## Architecture

```
src/
├── extension.ts                  activation, commands, tree + watcher registration
├── WorktreeProvider.ts           TreeDataProvider — repo → worktree, async stat fill
├── repos.ts                      discover + dedup repositories (Git API + fallback)
├── git.ts                        run git: worktree list, common-dir, diff stats
├── models/
│   ├── Worktree.ts               Worktree + DiffStat types
│   └── Repo.ts                   Repo (project) type
└── utils/
    ├── parseWorktreeOutput.ts    porcelain parser (pure, testable)
    └── formatDiffStat.ts         parse --shortstat, format "+1.3k -25"
```
