# FileDiff

FileDiff shows the Git commit history for the file currently open in the editor and opens a diff for any selected commit.

## Features

- Activity Bar view for the active file's Git history.
- Commit list scoped to the current file.
- Per-commit file diff using VS Code's built-in diff editor.
- Support for added, modified, deleted, renamed, and copied file statuses.
- Right-click menu to copy the commit hash or commit message.

## Usage

1. Open a file inside a Git repository.
2. Open the FileDiff view from the Activity Bar.
3. Select a commit to open the file diff for that commit.
4. Right-click a commit to copy its hash or message.

The diff compares:

```text
commit^ -> commit
```

## Requirements

- Git must be installed and available on PATH.
- The active file must be inside a Git repository.

## Known Limitations

- Text files are the primary target.
- Binary file contents are shown as unsupported.
- Merge commits are compared against the first parent.

## Release Notes

See [CHANGELOG.md](CHANGELOG.md).
