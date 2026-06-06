import * as vscode from 'vscode';
import { GitService } from '../git/GitService';

const unsupportedBinaryMessage = 'Binary file content is not supported by FileDiff.';

export class GitFileContentProvider implements vscode.TextDocumentContentProvider {
  constructor(private readonly gitService: GitService) {}

  async provideTextDocumentContent(uri: vscode.Uri): Promise<string> {
    const params = new URLSearchParams(uri.query);
    const commit = params.get('commit');
    const side = params.get('side');
    const status = params.get('status');
    const repoRoot = this.decodeParam(params.get('repoRoot'));
    const filePath = this.decodePath(uri);
    const previousFilePath = this.decodeParam(params.get('previousFilePath'));

    if (!commit || !side || !repoRoot || !filePath) {
      throw new Error('Invalid FileDiff document URI.');
    }

    if (side === 'before' && status === 'A') {
      return '';
    }

    if (side === 'after' && status === 'D') {
      return '';
    }

    const ref = side === 'before' ? `${commit}^` : commit;
    const refFilePath = side === 'before' && previousFilePath ? previousFilePath : filePath;

    try {
      if (await this.gitService.isBinaryFileAtRef(repoRoot, ref, refFilePath)) {
        return unsupportedBinaryMessage;
      }

      return await this.gitService.getFileContent(repoRoot, ref, refFilePath);
    } catch (error) {
      if (this.isMissingPathError(error)) {
        return '';
      }

      throw error;
    }
  }

  private decodePath(uri: vscode.Uri): string {
    return decodeURIComponent(uri.path.replace(/^\/+/, ''));
  }

  private decodeParam(value: string | null): string | undefined {
    return value ? decodeURIComponent(value) : undefined;
  }

  private isMissingPathError(error: unknown): boolean {
    if (!(error instanceof Error)) {
      return false;
    }

    return /exists on disk, but not in|path .* does not exist in|invalid object name/.test(error.message);
  }
}
