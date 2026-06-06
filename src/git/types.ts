export type FileChangeStatus = 'A' | 'M' | 'D' | 'R' | 'C' | '?';

export interface FileCommit {
  hash: string;
  shortHash: string;
  author: string;
  date: string;
  message: string;
  status: FileChangeStatus;
  filePath: string;
  historyFilePath: string;
  previousFilePath?: string;
  repoRoot: string;
}

export interface ActiveFileHistory {
  filePath: string;
  repoRoot: string;
  commits: FileCommit[];
}
