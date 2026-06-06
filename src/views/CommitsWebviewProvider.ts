import * as path from 'node:path';
import * as vscode from 'vscode';
import { openCommitDiff } from '../commands/openCommitDiff';
import { GitService } from '../git/GitService';
import type { FileCommit } from '../git/types';

type ViewState = 'loading' | 'noEditor' | 'notGit' | 'empty' | 'error' | 'ready';

export class CommitsWebviewProvider implements vscode.WebviewViewProvider {
  private view: vscode.WebviewView | undefined;
  private state: ViewState = 'noEditor';
  private commits: FileCommit[] = [];
  private currentFilePath: string | undefined;
  private currentRepoRoot: string | undefined;
  private errorMessage: string | undefined;
  private refreshId = 0;

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly gitService: GitService
  ) {}

  resolveWebviewView(webviewView: vscode.WebviewView): void {
    this.view = webviewView;
    webviewView.title = 'Commits';
    webviewView.webview.options = { enableScripts: true };
    webviewView.webview.onDidReceiveMessage((message: {
      command?: string;
      commit?: FileCommit;
      value?: string;
    }) => {
      if (message.command === 'openCommitDiff' && message.commit) {
        void openCommitDiff(message.commit);
      }

      if (message.command === 'copy' && typeof message.value === 'string') {
        void vscode.env.clipboard.writeText(message.value);
      }
    }, undefined, this.context.subscriptions);

    this.render();
  }

  async refresh(): Promise<void> {
    const refreshId = ++this.refreshId;
    const filePath = this.getActiveHistoryFilePath();

    if (!filePath) {
      this.currentFilePath = undefined;
      this.currentRepoRoot = undefined;
      this.commits = [];
      this.state = 'noEditor';
      this.render();
      return;
    }

    this.currentFilePath = filePath;
    this.currentRepoRoot = undefined;
    this.errorMessage = undefined;
    this.state = 'loading';
    this.render();

    try {
      const history = await this.gitService.getHistoryForFile(filePath);

      if (refreshId !== this.refreshId) {
        return;
      }

      if (!history) {
        this.currentRepoRoot = undefined;
        this.commits = [];
        this.state = 'notGit';
        this.render();
        return;
      }

      this.currentRepoRoot = history.repoRoot;
      this.commits = history.commits;
      this.state = history.commits.length > 0 ? 'ready' : 'empty';
      this.render();
    } catch (error) {
      if (refreshId !== this.refreshId) {
        return;
      }

      this.commits = [];
      this.errorMessage = this.formatError(error);
      this.state = 'error';
      this.render();
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

  private render(): void {
    if (!this.view) {
      return;
    }

    this.view.title = 'Commits';
    this.view.webview.html = this.getHtml(this.view.webview);
  }

  private getHtml(webview: vscode.Webview): string {
    const nonce = getNonce();
    const commitPayload = JSON.stringify(this.commits).replace(/</g, '\\u003c');

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Commits</title>
  <style>
    * {
      box-sizing: border-box;
    }

    body {
      margin: 0;
      padding: 6px 0 8px;
      color: var(--vscode-foreground);
      background: var(--vscode-sideBar-background);
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
    }

    .file {
      padding: 3px 14px 9px;
      border-bottom: 1px solid var(--vscode-sideBarSectionHeader-border);
      margin-bottom: 4px;
    }

    .file-name {
      color: var(--vscode-sideBarTitle-foreground);
      font-size: 12px;
      font-weight: 600;
      line-height: 1.35;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .file-path {
      margin-top: 2px;
      color: var(--vscode-descriptionForeground);
      font-size: 11px;
      line-height: 1.35;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .message-state {
      padding: 10px 16px;
      color: var(--vscode-descriptionForeground);
      line-height: 1.45;
    }

    .list {
      display: flex;
      flex-direction: column;
      padding: 1px 0;
    }

    .row {
      display: grid;
      grid-template-columns: 16px minmax(0, 1fr);
      gap: 8px;
      width: 100%;
      min-height: 44px;
      padding: 5px 12px 5px 13px;
      border: 0;
      border-left: 1px solid transparent;
      border-radius: 0;
      background: transparent;
      color: var(--vscode-foreground);
      text-align: left;
      cursor: pointer;
      outline: none;
      font: inherit;
    }

    .row:hover {
      background: var(--vscode-list-hoverBackground);
    }

    .row:focus-visible {
      background: var(--vscode-list-focusBackground);
      outline: 1px solid var(--vscode-focusBorder);
      outline-offset: -1px;
    }

    .status {
      align-self: start;
      padding-top: 2px;
      font-size: 13px;
      font-weight: 600;
      line-height: 1;
      text-align: center;
      color: var(--vscode-gitDecoration-modifiedResourceForeground);
    }

    .status-A {
      color: var(--vscode-gitDecoration-addedResourceForeground);
    }

    .status-D {
      color: var(--vscode-gitDecoration-deletedResourceForeground);
    }

    .status-R,
    .status-C {
      color: var(--vscode-gitDecoration-renamedResourceForeground);
    }

    .status-unknown {
      color: var(--vscode-descriptionForeground);
    }

    .content {
      min-width: 0;
    }

    .message {
      color: var(--vscode-foreground);
      font-size: 12px;
      font-weight: 600;
      line-height: 1.25;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      display: block;
    }

    .meta {
      margin-top: 2px;
      color: var(--vscode-descriptionForeground);
      font-size: 11px;
      line-height: 1.25;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .hash {
      color: var(--vscode-gitDecoration-modifiedResourceForeground);
    }

    .context-menu {
      position: fixed;
      z-index: 10;
      min-width: 164px;
      padding: 4px 0;
      border: 1px solid var(--vscode-menu-border);
      border-radius: 3px;
      background: var(--vscode-menu-background);
      box-shadow: 0 4px 12px rgb(0 0 0 / 28%);
      color: var(--vscode-menu-foreground);
    }

    .context-menu[hidden] {
      display: none;
    }

    .context-menu button {
      display: block;
      width: 100%;
      min-height: 26px;
      padding: 4px 22px 4px 12px;
      border: 0;
      background: transparent;
      color: inherit;
      font: inherit;
      font-size: 12px;
      text-align: left;
      cursor: pointer;
      white-space: nowrap;
    }

    .context-menu button:hover,
    .context-menu button:focus {
      outline: none;
      background: var(--vscode-menu-selectionBackground);
      color: var(--vscode-menu-selectionForeground);
    }
  </style>
</head>
<body>
  <main>
    ${this.getBodyHtml()}
  </main>
  <div id="context-menu" class="context-menu" hidden>
    <button type="button" data-action="copy-hash">Copy Commit Hash</button>
    <button type="button" data-action="copy-message">Copy Commit Message</button>
  </div>
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const commits = ${commitPayload};
    const menu = document.getElementById('context-menu');
    let selectedCommit = undefined;

    function hideMenu() {
      menu.hidden = true;
      selectedCommit = undefined;
    }

    function showMenu(event, commit) {
      event.preventDefault();
      selectedCommit = commit;
      menu.hidden = false;

      const menuRect = menu.getBoundingClientRect();
      const maxLeft = window.innerWidth - menuRect.width - 4;
      const maxTop = window.innerHeight - menuRect.height - 4;
      menu.style.left = Math.max(4, Math.min(event.clientX, maxLeft)) + 'px';
      menu.style.top = Math.max(4, Math.min(event.clientY, maxTop)) + 'px';
    }

    document.querySelectorAll('.row').forEach((row) => {
      row.addEventListener('click', () => {
        const commit = commits[Number(row.dataset.index)];
        vscode.postMessage({ command: 'openCommitDiff', commit });
      });

      row.addEventListener('contextmenu', (event) => {
        const commit = commits[Number(row.dataset.index)];
        showMenu(event, commit);
      });
    });

    menu.addEventListener('click', (event) => {
      const action = event.target?.dataset?.action;

      if (!selectedCommit || !action) {
        return;
      }

      if (action === 'copy-hash') {
        vscode.postMessage({ command: 'copy', value: selectedCommit.hash });
      }

      if (action === 'copy-message') {
        vscode.postMessage({ command: 'copy', value: selectedCommit.message });
      }

      hideMenu();
    });

    document.addEventListener('click', (event) => {
      if (!menu.contains(event.target)) {
        hideMenu();
      }
    });

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        hideMenu();
      }
    });

    window.addEventListener('scroll', hideMenu, true);
  </script>
</body>
</html>`;
  }

  private getBodyHtml(): string {
    const header = this.getHeaderHtml();

    if (this.state !== 'ready') {
      return `${header}<div class="message-state">${this.escapeHtml(this.getStateMessage())}</div>`;
    }

    const rows = this.commits
      .map((commit, index) => this.getCommitRowHtml(commit, index))
      .join('');

    return `${header}<section class="list">${rows}</section>`;
  }

  private getHeaderHtml(): string {
    if (!this.currentFilePath) {
      return '';
    }

    return `<section class="file">
      <div class="file-name">${this.escapeHtml(path.basename(this.currentFilePath))}</div>
      <div class="file-path">${this.escapeHtml(this.getDisplayFilePath() ?? '')}</div>
    </section>`;
  }

  private getCommitRowHtml(commit: FileCommit, index: number): string {
    const author = commit.author || 'Unknown author';
    const date = this.formatDate(commit.date) || commit.date;
    const message = commit.message || commit.shortHash;
    const statusClass = commit.status === '?' ? 'status-unknown' : `status-${commit.status}`;

    return `<button class="row" type="button" data-index="${index}">
      <span class="status ${statusClass}" title="${this.escapeHtml(this.statusTitle(commit.status))}">
        ${this.escapeHtml(commit.status)}
      </span>
      <span class="content">
        <span class="message">${this.escapeHtml(message)}</span>
        <span class="meta">
          ${this.escapeHtml(author)} &middot; ${this.escapeHtml(date)} &middot;
          <span class="hash">${this.escapeHtml(commit.shortHash)}</span>
        </span>
      </span>
    </button>`;
  }

  private statusTitle(status: FileCommit['status']): string {
    switch (status) {
      case 'A':
        return 'Added';
      case 'M':
        return 'Modified';
      case 'D':
        return 'Deleted';
      case 'R':
        return 'Renamed';
      case 'C':
        return 'Copied';
      default:
        return 'Changed';
    }
  }

  private getStateMessage(): string {
    switch (this.state) {
      case 'loading':
        return 'Loading commits...';
      case 'noEditor':
        return 'Open a file to see commit history.';
      case 'notGit':
        return 'Current file is not in a Git repository.';
      case 'empty':
        return 'No commits found for this file.';
      case 'error':
        return this.errorMessage ?? 'Unable to load Git history.';
      case 'ready':
        return '';
    }
  }

  private getDisplayFilePath(): string | undefined {
    if (!this.currentFilePath) {
      return undefined;
    }

    if (this.currentRepoRoot) {
      return path.relative(this.currentRepoRoot, this.currentFilePath).split(path.sep).join('/');
    }

    return this.currentFilePath;
  }

  private formatDate(date: string): string {
    const parsed = new Date(date);

    if (Number.isNaN(parsed.getTime())) {
      return date;
    }

    return new Intl.DateTimeFormat(undefined, {
      year: 'numeric',
      month: 'short',
      day: '2-digit'
    }).format(parsed);
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
    const paramsHistoryPath = params.get('historyFilePath');
    const relativePath = paramsHistoryPath
      ? decodeURIComponent(paramsHistoryPath)
      : decodeURIComponent(uri.path.replace(/^\/+/, ''));

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

  private escapeHtml(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
}

function getNonce(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let nonce = '';

  for (let i = 0; i < 32; i += 1) {
    nonce += chars.charAt(Math.floor(Math.random() * chars.length));
  }

  return nonce;
}
