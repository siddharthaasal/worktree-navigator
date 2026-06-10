# Worktree Navigator

A lightweight VS Code / Cursor extension that visualizes and switches Git
worktrees from a sidebar.

## What it does (MVP)

- Adds a **Worktrees** icon to the Activity Bar.
- Lists every Git worktree of the current repository (`git worktree list --porcelain`).
- Marks the worktree open in the current window with a filled circle (others are hollow).
- Click any other worktree to switch the current window to it (reuses the window — no new window).
- **Refresh Worktrees** command (refresh icon in the view title bar) re-reads the list.

It is intentionally minimal — no worktree creation/deletion, no agent/PR/Git
features. See [plan-v0.md](plan-v0.md) for scope and non-goals.

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
├── extension.ts                  activation, command + tree registration
├── WorktreeProvider.ts           TreeDataProvider (rendering, refresh)
├── git.ts                        runs git, marks the current worktree
├── models/Worktree.ts            Worktree type
└── utils/parseWorktreeOutput.ts  porcelain parser (pure, testable)
```
