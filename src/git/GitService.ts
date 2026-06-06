import * as path from 'node:path';
import { promises as fs } from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { ActiveFileHistory, FileChangeStatus, FileCommit } from './types';

const execFileAsync = promisify(execFile);
const fieldSeparator = '\x1f';
const recordSeparator = '\x1e';

export class GitService {
  async getRepositoryRoot(filePath: string): Promise<string | undefined> {
    try {
      const { stdout } = await this.git(['rev-parse', '--show-toplevel'], path.dirname(filePath));
      return stdout.trim() || undefined;
    } catch {
      return undefined;
    }
  }

  async getHistoryForFile(filePath: string): Promise<ActiveFileHistory | undefined> {
    const repoRoot = await this.getRepositoryRoot(filePath);

    if (!repoRoot) {
      return undefined;
    }

    const [resolvedRepoRoot, resolvedFilePath] = await Promise.all([
      this.realPath(repoRoot),
      this.realPath(filePath)
    ]);
    const relativePath = this.toGitRelativePath(resolvedRepoRoot, resolvedFilePath);
    const commits = await this.getFileCommits(repoRoot, relativePath);

    return {
      filePath: relativePath,
      repoRoot,
      commits
    };
  }

  async getFileContent(repoRoot: string, commit: string, filePath: string): Promise<string> {
    const { stdout } = await this.git(['show', `${commit}:${filePath}`], repoRoot, 'utf8');
    return stdout;
  }

  async getFileContentBuffer(repoRoot: string, commit: string, filePath: string): Promise<Buffer> {
    const { stdout } = await this.git(['show', `${commit}:${filePath}`], repoRoot, 'buffer');
    return Buffer.isBuffer(stdout) ? stdout : Buffer.from(stdout);
  }

  async isBinaryFileAtRef(repoRoot: string, commit: string, filePath: string): Promise<boolean> {
    const content = await this.getFileContentBuffer(repoRoot, commit, filePath);
    return content.includes(0);
  }

  async getFileCommits(repoRoot: string, filePath: string): Promise<FileCommit[]> {
    const format = `${recordSeparator}%H${fieldSeparator}%h${fieldSeparator}%an${fieldSeparator}%ad${fieldSeparator}%s`;
    const { stdout } = await this.git([
      'log',
      '--follow',
      '--name-status',
      `--format=${format}`,
      '--date=iso',
      '--',
      filePath
    ], repoRoot);

    return this.parseGitLog(stdout, repoRoot, filePath);
  }

  private parseGitLog(stdout: string, repoRoot: string, requestedFilePath: string): FileCommit[] {
    return stdout
      .split(recordSeparator)
      .map((entry) => entry.trim())
      .filter(Boolean)
      .map((entry) => this.parseCommitEntry(entry, repoRoot, requestedFilePath))
      .filter((commit): commit is FileCommit => Boolean(commit));
  }

  private parseCommitEntry(entry: string, repoRoot: string, requestedFilePath: string): FileCommit | undefined {
    const [headerLine, ...nameStatusLines] = entry.split(/\r?\n/);
    const [hash, shortHash, author, date, message] = headerLine.split(fieldSeparator);

    if (!hash || !shortHash) {
      return undefined;
    }

    const change = this.findRelevantChange(nameStatusLines, requestedFilePath);

    return {
      hash,
      shortHash,
      author: author ?? '',
      date: date ?? '',
      message: message ?? '',
      status: change.status,
      filePath: change.filePath,
      historyFilePath: requestedFilePath,
      previousFilePath: change.previousFilePath,
      repoRoot
    };
  }

  private findRelevantChange(lines: string[], requestedFilePath: string): {
    status: FileChangeStatus;
    filePath: string;
    previousFilePath?: string;
  } {
    for (const line of lines) {
      const parts = line.split('\t').filter(Boolean);

      if (parts.length < 2) {
        continue;
      }

      const rawStatus = parts[0] ?? '?';
      const status = this.normalizeStatus(rawStatus);

      if ((status === 'R' || status === 'C') && parts.length >= 3) {
        const previousFilePath = parts[1];
        const filePath = parts[2];

        if (filePath === requestedFilePath || previousFilePath === requestedFilePath) {
          return { status, filePath, previousFilePath };
        }
      } else {
        const filePath = parts[1];

        if (filePath === requestedFilePath) {
          return { status, filePath };
        }
      }
    }

    const firstChange = lines
      .map((line) => line.split('\t').filter(Boolean))
      .find((parts) => parts.length >= 2);

    if (!firstChange) {
      return { status: '?', filePath: requestedFilePath };
    }

    const status = this.normalizeStatus(firstChange[0] ?? '?');

    if ((status === 'R' || status === 'C') && firstChange.length >= 3) {
      return {
        status,
        previousFilePath: firstChange[1],
        filePath: firstChange[2] ?? requestedFilePath
      };
    }

    return {
      status,
      filePath: firstChange[1] ?? requestedFilePath
    };
  }

  private normalizeStatus(status: string): FileChangeStatus {
    const first = status.charAt(0);

    if (first === 'A' || first === 'M' || first === 'D' || first === 'R' || first === 'C') {
      return first;
    }

    return '?';
  }

  private toGitRelativePath(repoRoot: string, filePath: string): string {
    return path.relative(repoRoot, filePath).split(path.sep).join('/');
  }

  private async realPath(filePath: string): Promise<string> {
    try {
      return await fs.realpath(filePath);
    } catch {
      return this.realPathFromExistingParent(filePath);
    }
  }

  private async realPathFromExistingParent(filePath: string): Promise<string> {
    const segments: string[] = [];
    let currentPath = filePath;

    while (currentPath && currentPath !== path.dirname(currentPath)) {
      try {
        const resolvedParent = await fs.realpath(currentPath);
        return path.join(resolvedParent, ...segments.reverse());
      } catch {
        segments.push(path.basename(currentPath));
        currentPath = path.dirname(currentPath);
      }
    }

    return filePath;
  }

  private git(args: string[], cwd: string, encoding?: BufferEncoding): Promise<{ stdout: string; stderr: string }>;
  private git(args: string[], cwd: string, encoding: 'buffer'): Promise<{ stdout: Buffer; stderr: Buffer }>;
  private async git(
    args: string[],
    cwd: string,
    encoding: BufferEncoding | 'buffer' = 'utf8'
  ): Promise<{ stdout: string | Buffer; stderr: string | Buffer }> {
    const result = await execFileAsync('git', args, {
      cwd,
      encoding,
      maxBuffer: 1024 * 1024 * 20
    });

    return result as { stdout: string | Buffer; stderr: string | Buffer };
  }
}
