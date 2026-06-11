# Worktree Navigator

A lightweight VS Code / Cursor extension that visualizes and switches Git
worktrees from a sidebar.

## What it does

- Adds a **Worktrees** icon to the Activity Bar.
- Discovers **all repositories** in the workspace (via the built-in Git
  extension), grouped Conductor-style as **repo → worktrees**.
- Lists each repo's worktrees (`git worktree list --porcelain`), deduped by the
  shared `.git` so all worktrees of one repo collapse into one group.
- **Repo icon** is the GitHub owner avatar (when the repo has a github.com
  origin), falling back to a letter badge.
- Each worktree gets a **situation-appropriate git icon**, colored by lifecycle:
  `git-merge`/purple (merged), `git-pull-request*`/orange·gray·red (open/draft/
  closed PR), `git-branch`/orange (pushed) or white (local-only).
- The current worktree is highlighted (active row).
- Click any other worktree to switch the current window to it (reuses the
  window — no new window).
- **Refresh Worktrees** command (refresh icon in the view title bar) re-reads
  everything; the tree also auto-refreshes when repos open/close or worktree
  metadata changes.

### View modes

Two ways to render the same data (`worktreeNavigator.viewMode` setting):

- **Pane** *(default)* — a rich webview in the left sidebar with a highlighted
  active row and colored `+N -N` diff pills (Conductor/Superset-style).
- **Tree** — the lightweight native tree list.

Switch between them from the view title's **Switch View** action. Open/close
the sidebar pane with **`Cmd+Alt+W`** (mac) / **`Ctrl+Alt+W`** (win/linux).

### Actions

- **Create worktree** — `+` on a repo header (pane) or repo context menu
  (tree). Pick a new or existing branch, choose the location, optionally open
  it. Base directory configurable via `worktreeNavigator.worktreesPath`.
- **Remove worktree** — hover trash (pane) / context menu (tree). Guards the
  current and main worktrees; offers force when the worktree is dirty.
- **Merged detection** — worktrees whose branch is merged into the base branch
  are dimmed and tagged `merged`, sorted to the bottom.
- **Archive** — on a merged worktree, remove it and optionally delete its branch.

### Changes view (per-worktree diff tree)

A **Changes** view below the worktree list shows the changed files of the
**focused** worktree — the one you last clicked/switched to. Files are grouped
into folders with a status letter (M/A/D/R); clicking one opens the normal VS
Code diff editor. The diff is **branch vs upstream** (`origin/<branch>` →
working tree: unpushed commits + uncommitted edits), falling back to the base
branch for local-only worktrees. Scoped to one worktree — unlike the built-in
Source Control view, which shows every open folder at once.

### GitHub pull-request status (optional)

Enable `worktreeNavigator.showPullRequests` and sign in via VS Code's built-in
GitHub authentication. Each worktree then shows its PR: **open = orange**,
draft = gray, **merged = purple**, closed = red, with the PR number; click it to
open the PR. Read-only — the extension never modifies PRs. Repos without a
GitHub `origin` simply show nothing.

### Settings (extras are opt-in)

The default view is minimal — branch name, colored icon, and hover actions
(archive/remove). Everything else is off by default:

- `worktreeNavigator.showDiffStat` — per-worktree `+N -N` uncommitted line counts.
- `worktreeNavigator.showSubtitle` — worktree folder name under the branch (pane).
- `worktreeNavigator.showPullRequests` — GitHub PR status (prompts sign-in).
- `worktreeNavigator.viewMode` — `pane` (default) or `tree`.
- `worktreeNavigator.worktreesPath` — base directory for new worktrees.

See [plan-v0.md](plan-v0.md) (MVP), [plan-v1.md](plan-v1.md) (multi-repo +
diff stats), [plan-v2.md](plan-v2.md) (webview pane + modes), and
[plan-v3.md](plan-v3.md) (actions + GitHub) for scope and design.

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
├── extension.ts                  activation, commands, view-mode + keybinding wiring
├── WorktreeData.ts               shared data source: discover + diff/merged/PR cache + refresh
├── WorktreeProvider.ts           tree view — maps WorktreeData to tree items
├── WorktreeWebviewProvider.ts    pane view — webview shell + message passing
├── actions.ts                    create / remove / archive worktree flows
├── switch.ts                     switch-to-worktree (in-place folder swap)
├── focus.ts                      tracks the worktree the Changes view is scoped to
├── ChangesProvider.ts            Changes view — folder-grouped changed files
├── diffContent.ts                read-only base side of the diff (git show <ref>:<path>)
├── repos.ts                      discover + dedup repositories (Git API + fallback)
├── git.ts                        run git: worktree list/add/remove, branches, merged, diff, remote
├── github.ts                     GitHub auth + GraphQL PR client (cached, read-only)
├── models/
│   ├── Worktree.ts               Worktree + DiffStat + PullRequestInfo types
│   └── Repo.ts                   Repo (project) type
└── utils/
    ├── parseWorktreeOutput.ts    porcelain parser (pure, testable)
    ├── formatDiffStat.ts         parse --shortstat, format "+1.3k -25"
    └── worktreeLabel.ts          shared branch/dir label logic

media/webview/                    pane UI: main.css (themed), main.js (renderer)
```

Both views share `WorktreeData`, so the tree and pane never drift in caching or
refresh behavior.
