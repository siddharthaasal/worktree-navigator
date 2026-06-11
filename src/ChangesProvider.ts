import * as vscode from "vscode";
import * as path from "node:path";
import { getChangedFiles, getCompareRef } from "./git";
import type { ChangedFile, ChangeStatus } from "./git";
import type { FocusManager } from "./focus";

type ChangeNode = FolderItem | FileItem | MessageItem;

/** In-memory folder node built from a flat changed-file list. */
interface TreeFolder {
  name: string;
  folders: Map<string, TreeFolder>;
  files: ChangedFile[];
}

/**
 * TreeDataProvider for the Changes view: shows the changed files of the focused
 * worktree (diffed against its compare ref), grouped into folders. Clicking a
 * file opens the diff editor.
 */
export class ChangesProvider implements vscode.TreeDataProvider<ChangeNode> {
  private readonly _onDidChangeTreeData = new vscode.EventEmitter<
    ChangeNode | undefined | void
  >();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private watcher: vscode.FileSystemWatcher | undefined;
  private watchDebounce: ReturnType<typeof setTimeout> | undefined;

  constructor(private readonly focus: FocusManager) {
    this.focus.onDidChange(() => {
      this.rewatch();
      this.refresh();
    });
  }

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: ChangeNode): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: ChangeNode): Promise<ChangeNode[]> {
    if (element instanceof FolderItem) {
      return this.folderChildren(element.folder, element.worktreePath, element.ref);
    }
    if (element) {
      return [];
    }

    const target = this.focus.focus;
    if (!target) {
      return [new MessageItem("Select a worktree to see its changes")];
    }

    const ref = await getCompareRef(target.worktreePath);
    const files = await getChangedFiles(target.worktreePath, ref);
    if (files.length === 0) {
      return [new MessageItem("No changes")];
    }

    const root = buildTree(files);
    return this.folderChildren(root, target.worktreePath, ref);
  }

  private folderChildren(
    folder: TreeFolder,
    worktreePath: string,
    ref: string,
  ): ChangeNode[] {
    const folders = [...folder.folders.values()]
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((f) => new FolderItem(f, worktreePath, ref));
    const files = folder.files
      .slice()
      .sort((a, b) => path.basename(a.path).localeCompare(path.basename(b.path)))
      .map((f) => new FileItem(f, worktreePath, ref));
    return [...folders, ...files];
  }

  /** Re-create the file watcher scoped to the focused worktree. */
  private rewatch(): void {
    this.watcher?.dispose();
    this.watcher = undefined;
    const target = this.focus.focus;
    if (!target) {
      return;
    }
    this.watcher = vscode.workspace.createFileSystemWatcher(
      new vscode.RelativePattern(target.worktreePath, "**/*"),
    );
    const bump = () => {
      if (this.watchDebounce) {
        return;
      }
      this.watchDebounce = setTimeout(() => {
        this.watchDebounce = undefined;
        this.refresh();
      }, 300);
    };
    this.watcher.onDidCreate(bump);
    this.watcher.onDidChange(bump);
    this.watcher.onDidDelete(bump);
  }

  dispose(): void {
    this.watcher?.dispose();
    this._onDidChangeTreeData.dispose();
  }
}

/** Build a nested folder tree from a flat changed-file list. */
function buildTree(files: ChangedFile[]): TreeFolder {
  const root: TreeFolder = { name: "", folders: new Map(), files: [] };
  for (const file of files) {
    const dir = path.dirname(file.path);
    let node = root;
    if (dir && dir !== ".") {
      for (const seg of dir.split("/")) {
        let child = node.folders.get(seg);
        if (!child) {
          child = { name: seg, folders: new Map(), files: [] };
          node.folders.set(seg, child);
        }
        node = child;
      }
    }
    node.files.push(file);
  }
  return root;
}

class FolderItem extends vscode.TreeItem {
  constructor(
    readonly folder: TreeFolder,
    readonly worktreePath: string,
    readonly ref: string,
  ) {
    super(folder.name, vscode.TreeItemCollapsibleState.Expanded);
    this.iconPath = vscode.ThemeIcon.Folder;
    this.contextValue = "changeFolder";
  }
}

class FileItem extends vscode.TreeItem {
  constructor(file: ChangedFile, worktreePath: string, ref: string) {
    super(path.basename(file.path), vscode.TreeItemCollapsibleState.None);
    const abs = path.join(worktreePath, file.path);
    this.resourceUri = vscode.Uri.file(abs);
    this.description = statusLabel(file.status);
    this.tooltip =
      file.oldPath && file.oldPath !== file.path
        ? `${file.oldPath} → ${file.path}`
        : file.path;
    this.contextValue = "changeFile";
    this.command = {
      command: "worktreeNavigator.openChange",
      title: "Open Changes",
      arguments: [{ worktreePath, ref, file }],
    };
  }
}

class MessageItem extends vscode.TreeItem {
  constructor(message: string) {
    super(message, vscode.TreeItemCollapsibleState.None);
    this.contextValue = "message";
  }
}

function statusLabel(status: ChangeStatus): string {
  switch (status) {
    case "A":
      return "A";
    case "D":
      return "D";
    case "R":
      return "R";
    case "C":
      return "C";
    case "T":
      return "T";
    case "U":
      return "U";
    default:
      return "M";
  }
}
