import * as vscode from 'vscode';
import type { FileCommit } from '../git/types';

export class CommitTreeItem extends vscode.TreeItem {
  constructor(public readonly commit: FileCommit) {
    super(commit.message || commit.shortHash, vscode.TreeItemCollapsibleState.None);

    this.description = `${commit.status} ${commit.shortHash}`;
    this.tooltip = [
      commit.message,
      `Hash: ${commit.hash}`,
      `Author: ${commit.author}`,
      `Date: ${commit.date}`,
      `File: ${commit.filePath}`
    ].filter(Boolean).join('\n');
    this.contextValue = 'commit';
    this.iconPath = new vscode.ThemeIcon(this.iconForStatus(commit.status));
    this.command = {
      command: 'filediff.openCommitDiff',
      title: 'Open Commit Diff',
      arguments: [commit]
    };
  }

  private iconForStatus(status: FileCommit['status']): string {
    switch (status) {
      case 'A':
        return 'diff-added';
      case 'D':
        return 'diff-removed';
      case 'R':
        return 'diff-renamed';
      case 'M':
        return 'diff-modified';
      default:
        return 'git-commit';
    }
  }
}
