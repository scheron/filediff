export type FileChangeStatus = 'A' | 'M' | 'D' | 'R' | 'C' | '?';

export type FileCommit = {
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
};

export type ActiveFileHistory = {
  filePath: string;
  repoRoot: string;
  commits: FileCommit[];
};
