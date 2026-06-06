import * as path from 'node:path';
import * as vscode from 'vscode';
import { GitService } from '../git/GitService';
import type { FileCommit } from '../git/types';
import { CommitTreeItem } from './CommitTreeItem';

type ViewState = 'loading' | 'noEditor' | 'notGit' | 'empty' | 'error' | 'ready';

class MessageTreeItem extends vscode.TreeItem {
  constructor(message: string, icon = 'info') {
    super(message, vscode.TreeItemCollapsibleState.None);
    this.iconPath = new vscode.ThemeIcon(icon);
  }
}

export class CommitsTreeProvider implements vscode.TreeDataProvider<FileCommit | MessageTreeItem> {
  private readonly changeEmitter = new vscode.EventEmitter<FileCommit | MessageTreeItem | undefined | null | void>();
  readonly onDidChangeTreeData = this.changeEmitter.event;

  private state: ViewState = 'noEditor';
  private commits: FileCommit[] = [];
  private currentFilePath: string | undefined;
  private errorMessage: string | undefined;
  private refreshId = 0;

  constructor(private readonly gitService: GitService) {}

  getTreeItem(element: FileCommit | MessageTreeItem): vscode.TreeItem {
    if (element instanceof MessageTreeItem) {
      return element;
    }

    return new CommitTreeItem(element);
  }

  getChildren(): vscode.ProviderResult<Array<FileCommit | MessageTreeItem>> {
    switch (this.state) {
      case 'loading':
        return [new MessageTreeItem('Loading commits...', 'sync~spin')];
      case 'noEditor':
        return [new MessageTreeItem('Open a file to see commit history.')];
      case 'notGit':
        return [new MessageTreeItem('Current file is not in a Git repository.', 'warning')];
      case 'empty':
        return [new MessageTreeItem('No commits found for this file.')];
      case 'error':
        return [new MessageTreeItem(this.errorMessage ?? 'Unable to load Git history.', 'error')];
      case 'ready':
        return this.commits;
    }
  }

  async refresh(): Promise<void> {
    const refreshId = ++this.refreshId;
    const filePath = this.getActiveHistoryFilePath();

    if (!filePath) {
      this.currentFilePath = undefined;
      this.commits = [];
      this.state = 'noEditor';
      this.changeEmitter.fire();
      return;
    }

    this.currentFilePath = filePath;
    this.errorMessage = undefined;
    this.state = 'loading';
    this.changeEmitter.fire();

    try {
      const history = await this.gitService.getHistoryForFile(filePath);

      if (refreshId !== this.refreshId) {
        return;
      }

      if (!history) {
        this.commits = [];
        this.state = 'notGit';
        this.changeEmitter.fire();
        return;
      }

      this.commits = history.commits;
      this.state = history.commits.length > 0 ? 'ready' : 'empty';
      this.changeEmitter.fire();
    } catch (error) {
      if (refreshId !== this.refreshId) {
        return;
      }

      this.commits = [];
      this.errorMessage = this.formatError(error);
      this.state = 'error';
      this.changeEmitter.fire();
    }
  }

  refreshIfActiveFileChanged(): void {
    if (!vscode.window.activeTextEditor && this.currentFilePath) {
      return;
    }

    const activePath = this.getActiveHistoryFilePath();

    if (activePath !== this.currentFilePath) {
      void this.refresh();
    }
  }

  private getActiveHistoryFilePath(): string | undefined {
    const activeEditor = vscode.window.activeTextEditor;

    if (!activeEditor) {
      return undefined;
    }

    const uri = activeEditor.document.uri;

    if (uri.scheme === 'file') {
      return uri.fsPath;
    }

    if (uri.scheme === 'filediff') {
      return this.getFilePathFromFileDiffUri(uri);
    }

    return undefined;
  }

  private getFilePathFromFileDiffUri(uri: vscode.Uri): string | undefined {
    const params = new URLSearchParams(uri.query);
    const encodedRepoRoot = params.get('repoRoot');

    if (!encodedRepoRoot) {
      return this.currentFilePath;
    }

    const repoRoot = decodeURIComponent(encodedRepoRoot);
    const relativePath = decodeURIComponent(uri.path.replace(/^\/+/, ''));

    if (!relativePath) {
      return this.currentFilePath;
    }

    return path.join(repoRoot, relativePath);
  }

  private formatError(error: unknown): string {
    if (error instanceof Error && error.message.trim()) {
      return `Unable to load Git history. ${error.message}`;
    }

    return 'Unable to load Git history.';
  }
}
