import * as path from 'node:path';
import * as vscode from 'vscode';
import type { FileCommit } from '../git/types';

export async function openCommitDiff(commit: FileCommit): Promise<void> {
  const beforeUri = buildFileDiffUri(commit, 'before');
  const afterUri = buildFileDiffUri(commit, 'after');
  const title = `${path.basename(commit.filePath)}: ${commit.shortHash}`;

  await vscode.commands.executeCommand('vscode.diff', beforeUri, afterUri, title);
}

function buildFileDiffUri(commit: FileCommit, side: 'before' | 'after'): vscode.Uri {
  const params = new URLSearchParams({
    commit: commit.hash,
    side,
    status: commit.status,
    repoRoot: encodeURIComponent(commit.repoRoot)
  });

  if (commit.previousFilePath) {
    params.set('previousFilePath', encodeURIComponent(commit.previousFilePath));
  }

  return vscode.Uri.from({
    scheme: 'filediff',
    path: `/${commit.filePath}`,
    query: params.toString()
  });
}
