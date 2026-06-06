# FileDiff VS Code Extension Spec

## Goal

Build a VS Code extension that shows the Git commit history for the currently active file and opens the file changes for a selected commit in the editor.

The main UX model is an Activity Bar icon that opens a Side Bar view with a commit list.

## MVP Behavior

1. User opens a file in the editor.
2. User opens the FileDiff view from the Activity Bar.
3. The `Commits` view shows the list of commits where the current file was changed.
4. Each commit item shows:
   - short hash;
   - commit message;
   - author;
   - date;
   - file status in the commit when available: `A`, `M`, `D`, `R`.
5. Clicking a commit item opens the file diff for that commit.

For MVP, clicking a commit should open the diff for the file in that specific commit:

```text
commit^ -> commit
```

Opening the full file version at a commit can be added as a secondary action later.

## UX

Activity Bar:

```text
FileDiff icon
```

Side Bar:

```text
COMMITS

Current file:
src/main/setup/app/menu.ts

[ M ] a1b2c3d Fix menu setup
      John Doe · 2026-06-01

[ A ] e4f5g6h Add app menu
      John Doe · 2026-05-28
```

View toolbar actions for MVP:

- `Refresh`

Possible later actions:

- `Open File Version`
- `Open Commit Diff`
- `Reveal Current File History`

## VS Code Contributions

### Commands

```json
{
  "contributes": {
    "commands": [
      {
        "command": "filediff.refresh",
        "title": "Refresh File Commits",
        "icon": "$(refresh)"
      },
      {
        "command": "filediff.openCommitDiff",
        "title": "Open Commit Diff"
      },
      {
        "command": "filediff.openFileAtCommit",
        "title": "Open File at Commit"
      }
    ]
  }
}
```

### Views

```json
{
  "contributes": {
    "viewsContainers": {
      "activitybar": [
        {
          "id": "filediff",
          "title": "FileDiff",
          "icon": "resources/filediff.svg"
        }
      ]
    },
    "views": {
      "filediff": [
        {
          "id": "filediff.commits",
          "name": "Commits"
        }
      ]
    }
  }
}
```

## Git Logic

The extension needs to resolve:

1. Absolute path of the current file.
2. Git repository root.
3. Repository-relative file path.
4. Commits where the file was changed.

History command:

```bash
git log --follow --name-status --format=%H%x1f%h%x1f%an%x1f%ad%x1f%s --date=iso -- <file>
```

Use stable field separators such as `\x1f` to make parsing safer.

To open the diff for a commit, use VS Code's built-in diff editor with two virtual documents:

- left side: file content before the commit;
- right side: file content after the commit.

Content commands:

```bash
git show <commit>^:<file>
git show <commit>:<file>
```

Then open the diff:

```ts
vscode.commands.executeCommand(
  'vscode.diff',
  beforeUri,
  afterUri,
  `${fileName}: ${shortHash}`
);
```

## Virtual Documents

Implement a `TextDocumentContentProvider`.

URI format:

```text
filediff:/repo/path/src/file.ts?commit=a1b2c3d&side=before
filediff:/repo/path/src/file.ts?commit=a1b2c3d&side=after
```

The provider should:

1. Read `commit` from the URI query.
2. Read `side` from the URI query.
3. Resolve the Git ref:
   - `before` -> `${commit}^:${filePath}`;
   - `after` -> `${commit}:${filePath}`.
4. Return file contents through `git show`.

Special cases:

- Added file: `before` document is empty.
- Deleted file: `after` document is empty.
- Binary file: show an error or placeholder.

## Proposed Module Structure

```text
src/
  extension.ts
  git/
    GitService.ts
    types.ts
  views/
    CommitsTreeProvider.ts
    CommitTreeItem.ts
  documents/
    GitFileContentProvider.ts
  commands/
    openCommitDiff.ts
    openFileAtCommit.ts
```

## Types

```ts
export type FileChangeStatus = 'A' | 'M' | 'D' | 'R' | 'C' | '?';

export interface FileCommit {
  hash: string;
  shortHash: string;
  author: string;
  date: string;
  message: string;
  status: FileChangeStatus;
  filePath: string;
  previousFilePath?: string;
  repoRoot: string;
}
```

## Tree Item

Commit item behavior:

- `label`: commit message;
- `description`: short hash;
- `tooltip`: author, date, full hash;
- `iconPath`: themed icon or status-based visual;
- `command`: `filediff.openCommitDiff`.

Example:

```ts
this.command = {
  command: 'filediff.openCommitDiff',
  title: 'Open Commit Diff',
  arguments: [commit]
};
```

## View States

The `Commits` view should handle these states:

1. No active editor:

```text
Open a file to see commit history.
```

2. Current file is outside a Git repository:

```text
Current file is not in a Git repository.
```

3. No history:

```text
No commits found for this file.
```

4. Loading:

```text
Loading commits...
```

5. Git error:

```text
Unable to load Git history.
```

## MVP Constraints

The first version can explicitly support:

- text files only;
- current active file only;
- multi-root workspace through nearest Git repository discovery;
- partial rename support through `git log --follow`;
- merge commits using the first parent via `commit^`;
- binary files with a clear unsupported-state message.

## Acceptance Criteria

1. When a tracked file is open, the panel shows the commits where the file was changed.
2. Switching the active editor refreshes the commit list for the new file.
3. Clicking a commit item opens a diff for that file in that commit.
4. The first commit for a file opens as empty -> file.
5. A delete commit opens as file -> empty.
6. Git errors are shown as readable user-facing messages.
7. Loading history does not block the VS Code UI.

## Technical Estimate

MVP estimate:

- extension scaffold: 1-2 hours;
- Activity Bar and Tree View: 2-4 hours;
- Git history parsing: 4-6 hours;
- virtual documents and diff editor: 4-6 hours;
- edge cases and polish: 1 day.

Total: about 2-3 working days for a clean MVP.

Recommended implementation order:

1. Scaffold VS Code extension.
2. Add Activity Bar container and `Commits` Tree View.
3. Implement Git repository and file path resolution.
4. Implement commit history loading for the active file.
5. Implement virtual document provider.
6. Implement click-to-open diff.
7. Add state handling and error messages.
