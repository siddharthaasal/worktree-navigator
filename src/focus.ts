import * as vscode from "vscode";

/** The worktree the Changes view is currently scoped to. */
export interface FocusTarget {
  worktreePath: string;
  label: string;
}

/** Tracks and broadcasts which worktree the Changes view is focused on. */
export class FocusManager implements vscode.Disposable {
  private readonly _onDidChange = new vscode.EventEmitter<void>();
  readonly onDidChange = this._onDidChange.event;

  private _focus: FocusTarget | undefined;

  get focus(): FocusTarget | undefined {
    return this._focus;
  }

  set(target: FocusTarget): void {
    if (this._focus?.worktreePath === target.worktreePath) {
      return;
    }
    this._focus = target;
    this._onDidChange.fire();
  }

  dispose(): void {
    this._onDidChange.dispose();
  }
}
