# Project Handoff: Cursor Worktree Sidebar

## Goal

Build a lightweight VS Code/Cursor extension that visualizes and switches Git worktrees from a sidebar.

This extension is intended to solve a workflow problem where:

* Superset manages worktrees and agents
* Cursor is used for editing
* Cursor's native worktree UX is insufficient
* We want a Conductor/Superset-style worktree list inside Cursor

This is **not** an agent orchestration tool.

This is **not** a Git replacement.

This is **not** a Superset integration.

The sole purpose is making worktrees easy to visualize and switch.

---

# User Workflow

Current workflow:

```text
Superset
├─ feature/auth
├─ dashboard-redesign
├─ api-refactor
└─ bugfix/login

Cursor
└─ Active editing workspace
```

Problem:

* Cursor does not expose external worktrees well.
* User must manually navigate to worktree directories.
* Agent Window UX is not sufficient.

Desired workflow:

```text
Cursor Sidebar

📁 Worktrees
────────────────
● main
● feature/auth
● dashboard-redesign
● api-refactor
● bugfix/login
```

Clicking a worktree immediately switches Cursor to that worktree.

---

# Scope (MVP Only)

Must support:

### Worktree Discovery

Use:

```bash
git worktree list --porcelain
```

Parse all worktrees.

Display:

* branch name
* path

---

### Sidebar

Create a dedicated Activity Bar icon:

```text
📁 Worktrees
```

Inside:

```text
main
feature/auth
dashboard-redesign
api-refactor
```

Use VS Code TreeView API.

---

### Switch Worktree

When user clicks a worktree:

Execute:

```ts
vscode.commands.executeCommand(
  "vscode.openFolder",
  vscode.Uri.file(worktreePath),
  false
);
```

Requirements:

* reuse current window
* no new window
* switch immediately

---

### Refresh

Add:

```text
Refresh Worktrees
```

command.

Refresh tree contents.

---

### Current Worktree Indicator

Highlight active worktree.

Examples:

```text
● main
○ feature/auth
○ dashboard-redesign
```

or

```text
main (current)
feature/auth
dashboard-redesign
```

Implementation choice is flexible.

---

# Explicit Non-Goals

Do NOT implement:

* Superset integration
* Conductor integration
* Agent status
* Claude integration
* PR management
* GitHub integration
* Merge queues
* Task tracking
* Worktree creation
* Worktree deletion
* Diff viewers
* Custom editors
* LSP
* AI features

These are future concerns.

MVP should remain extremely small.

---

# Technical Stack

Language:

```text
TypeScript
```

Target:

```text
VS Code Extension API
```

Compatible with:

```text
VS Code
Cursor
```

Build Tool:

Use standard VS Code extension scaffolding.

---

# Suggested Architecture

```text
src/
├── extension.ts
├── WorktreeProvider.ts
├── git.ts
├── models/
│   └── Worktree.ts
└── utils/
    └── parseWorktreeOutput.ts
```

Responsibilities:

### git.ts

Responsible for:

```bash
git worktree list --porcelain
```

execution.

Returns:

```ts
type Worktree = {
  path: string;
  branch: string;
  current: boolean;
};
```

---

### WorktreeProvider.ts

TreeDataProvider implementation.

Responsible for:

* tree rendering
* refresh logic
* item creation

No git logic.

---

### extension.ts

Responsible for:

* extension activation
* command registration
* tree registration
* switch worktree command

No parsing logic.

---

# UX Requirements

Keep UI minimal.

Good:

```text
📁 Worktrees

● main
○ feature/auth
○ dashboard-redesign
```

Bad:

```text
Repositories
Workspaces
Agents
Sessions
Branches
Tasks
Metadata
```

Avoid clutter.

---

# Success Criteria

The extension is successful if:

1. User installs extension.
2. Opens Cursor in any repository.
3. Opens Worktrees sidebar.
4. Sees all Git worktrees.
5. Clicks a worktree.
6. Cursor switches to that worktree.

Nothing else is required for MVP.

---

# Future Ideas (Do Not Implement Yet)

Potential v2:

```text
Create Worktree
Delete Worktree
Open In New Window
```

Potential v3:

```text
Superset metadata
Agent status
Task names
```

Potential v4:

```text
Conductor compatibility
```

Do not implement any of these in MVP.

---
