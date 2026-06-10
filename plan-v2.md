# Plan v2: Webview Pane + View Modes

## Goal

Add a **rich left-sidebar pane** (webview) as an alternative to the existing
tree view, replicating the Conductor / Superset look that the TreeView API
can't render: **highlighted active row**, **colored diff pills**, repo group
icons. The extension gains **view modes** — tree or pane — and a **keyboard
shortcut to open/close** the pane.

Still visualization + switching only. No GitHub (PR badges, status icons), no
creation (`+` buttons).

---

## Placement (decided)

**Primary (left) sidebar**, inside the existing `worktreeNavigator` activity-bar
container — *not* the editor center. Implemented as a `WebviewView` via
`vscode.window.registerWebviewViewProvider`.

Both views are registered in the same container; a **mode** context key decides
which one is visible (see Modes). Toggling the pane open/closed is a keybinding
on the sidebar.

---

## Visual Target

```text
┌─ WORKTREES ─────────────────┐
│ ▾ [F] foundation        (2) │
│      ⎇ feat/split-dealer…   │   ← rows
│        local        +765 -22│   ← colored pills, right-aligned
│   ┌─────────────────────────┐
│   │● dashboard-redesign +679│  ← ACTIVE row: highlighted background
│   └─────────────────────────┘
│ ▾ [C] canvas            (1) │
│      ⎇ test          +5  -0 │
│ ▾ [W] website           (2) │
│      ⎇ outreach-pages       │
│        +1623 -155           │
└─────────────────────────────┘
```

- **Active worktree**: full-width highlighted row (`--vscode-list-activeSelectionBackground`).
- **Diff pill**: `+N` in green (`--vscode-gitDecoration-addedResourceForeground`),
  `-N` in red (`--vscode-gitDecoration-deletedResourceForeground`), `1.3k`
  abbreviation reused from `formatDiffStat`.
- **Repo header**: collapsible, letter-badge icon, name, worktree count.
- **Hover**: subtle row hover (`--vscode-list-hoverBackground`).
- Everything themed via VS Code CSS variables, so it tracks light/dark/contrast.

Layout/density modeled on the screenshots; PR badges, ahead/behind, status
icons, and `+` actions are intentionally absent (out of scope — see below).

---

## Modes

A setting and a context key select the active view; only one renders at a time.

- **Setting:** `worktreeNavigator.viewMode`: `"tree" | "pane"` (default: **pane**).
- **Context key:** on activation and on setting change we set
  `worktreeNavigator.viewMode` via `setContext`. Each view declares a `when`:
  - tree view → `when: worktreeNavigator.viewMode == 'tree'`
  - pane view → `when: worktreeNavigator.viewMode == 'pane'`
- **Switch command:** `worktreeNavigator.switchMode` flips the setting (also in
  the view title `...` menu).

This is the "which one you wanna open" behavior — tree for the lightweight
docked list, pane for the rich view.

---

## Keyboard Shortcut (open/close)

- **Command:** `worktreeNavigator.togglePane` — if our sidebar view is visible,
  hide the sidebar (`workbench.action.toggleSidebarVisibility`); otherwise
  reveal our container (`workbench.view.extension.worktreeNavigator`) and focus
  the active view.
- **Default binding:** `cmd+alt+w` (mac) / `ctrl+alt+w` (win/linux). User can
  rebind via the Keyboard Shortcuts editor; we'll document it.

---

## Architecture

```text
src/
├── extension.ts                  + register webview provider, toggle/switch
│                                   commands, viewMode context key + keybinding
├── WorktreeProvider.ts           (tree) — unchanged
├── WorktreeWebviewProvider.ts    NEW: WebviewViewProvider — HTML shell,
│                                   message passing, pushes repo data
├── repos.ts / git.ts             SHARED data layer — unchanged
└── models/…                      unchanged

media/webview/
├── main.css                      NEW: themed styles (rows, pills, highlight)
└── main.js                       NEW: render repo JSON, click→switch, collapse
```

### Data flow

- The webview provider reuses `discoverRepos()` + the same async diff-stat
  computation as the tree — **no data-layer duplication**. (Refactor the stat
  cache out of `WorktreeProvider` into a small shared `WorktreeData` helper both
  providers use, so caching/refresh logic isn't copy-pasted.)
- **extension → webview**: `postMessage({ type: 'render', repos })` on load,
  refresh, repo-open/close, and when async diff stats resolve.
- **webview → extension**: `{ type: 'switch', path }` → existing switch command;
  `{ type: 'refresh' }`; `{ type: 'toggleCollapse', repoRoot }` (persisted via
  webview `getState`/`setState`).
- **Security:** strict CSP with a per-load nonce; `localResourceRoots` limited
  to `media/webview`; no remote content.

### Lifecycle

- WebviewView is torn down when hidden; on `onDidChangeVisibility` becoming
  visible we re-post the latest `render` payload. Collapsed-group state persists
  in webview state so it survives reloads.

---

## package.json changes

- Add a second view to the `worktreeNavigator` container:
  `{ id: "worktreeNavigator.pane", type: "webview", name: "Worktrees", when: "… == 'pane'" }`,
  and add the `when` to the existing tree view.
- `commands`: `togglePane`, `switchMode` (+ existing refresh/switch).
- `keybindings`: bind `togglePane`.
- `menus.view/title`: `switchMode` for both views; `refresh` stays.
- `configuration`: `worktreeNavigator.viewMode` enum.

---

## Milestones

- **M1 — Shared data:** extract `WorktreeData` (discover + stat cache + refresh)
  from the tree provider; tree keeps working through it. Compile + tree
  unaffected.
- **M2 — Webview shell:** provider + HTML/CSS/JS, CSP nonce, render static repo
  data, theming. Visible in left sidebar.
- **M3 — Interaction:** click→switch, active highlight, collapse persist, live
  diff-stat fill, refresh + repo-open/close updates.
- **M4 — Modes + shortcut:** viewMode setting/context key, switchMode command,
  togglePane keybinding; document in README.

Each milestone compiles + typechecks; webview verified by F5 against a
multi-repo workspace.

---

## Non-Goals (unchanged + new)

No GitHub data (PR numbers, review/CI status icons), no ahead/behind or
commit-subject titles in this pass, no `+`/create/add actions, no editor-center
panel. The pane is a richer renderer of the **same** worktree data.

---

## Decisions (resolved)

- **Q1 — Default mode:** ✅ **pane**.
- **Q2 — Keybinding:** ✅ `cmd+alt+w` / `ctrl+alt+w`.
- **Q3 — Extras:** ✅ **strict parity for v2** — branch name + colored diff pill
  + active highlight only. Ahead/behind and commit subtitle deferred.
