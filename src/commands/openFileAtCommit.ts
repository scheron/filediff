import * as vscode from 'vscode';
import type { FileCommit } from '../git/types';

export async function openFileAtCommit(commit: FileCommit): Promise<void> {
  if (commit.status === 'D') {
    void vscode.window.showWarningMessage('This file was deleted in the selected commit.');
    return;
  }

  const params = new URLSearchParams({
    commit: commit.hash,
    side: 'after',
    status: commit.status,
    historyFilePath: encodeURIComponent(commit.historyFilePath),
    repoRoot: encodeURIComponent(commit.repoRoot)
  });
  const uri = vscode.Uri.from({
    scheme: 'filediff',
    path: `/${commit.filePath}`,
    query: params.toString()
  });
  const document = await vscode.workspace.openTextDocument(uri);

  await vscode.window.showTextDocument(document, {
    preview: false,
    viewColumn: vscode.ViewColumn.Active
  });
}
