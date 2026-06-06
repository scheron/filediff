import * as vscode from 'vscode';
import { openCommitDiff } from './commands/openCommitDiff';
import { openFileAtCommit } from './commands/openFileAtCommit';
import { GitFileContentProvider } from './documents/GitFileContentProvider';
import { GitService } from './git/GitService';
import { CommitsTreeProvider } from './views/CommitsTreeProvider';

export function activate(context: vscode.ExtensionContext): void {
  const gitService = new GitService();
  const commitsProvider = new CommitsTreeProvider(gitService);
  const contentProvider = new GitFileContentProvider(gitService);

  context.subscriptions.push(
    vscode.workspace.registerTextDocumentContentProvider('filediff', contentProvider),
    vscode.window.registerTreeDataProvider('filediff.commits', commitsProvider),
    vscode.commands.registerCommand('filediff.refresh', () => commitsProvider.refresh()),
    vscode.commands.registerCommand('filediff.openCommitDiff', openCommitDiff),
    vscode.commands.registerCommand('filediff.openFileAtCommit', openFileAtCommit),
    vscode.window.onDidChangeActiveTextEditor(() => commitsProvider.refreshIfActiveFileChanged()),
    vscode.workspace.onDidSaveTextDocument(() => commitsProvider.refreshIfActiveFileChanged())
  );

  void commitsProvider.refresh();
}

export function deactivate(): void {}
