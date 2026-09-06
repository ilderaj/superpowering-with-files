# Choosing the diff

First use the task's requested mode and any bound base/head. A fixed endpoint comparison and a branch contribution are different questions. Never silently replace one with the other. Resolve revision inputs with `git rev-parse --verify --end-of-options "<ref>^{commit}"`; substitute the resolved IDs below. Pass paths after `--` and pass arguments safely without evaluating user text as shell code.

The command column contains the complete comparison for each mode. `<base>`, `<head>`, and `<commit>` stand for resolved commit IDs; `<parent>` is the selected parent ID; `<empty-tree>` is the repository's empty tree ID.

| Mode | Comparison command | Scope |
| --- | --- | --- |
| Unstaged | `git diff --no-ext-diff --no-textconv --` | Index to tracked working files; excludes staged changes. |
| Staged | `git diff --no-ext-diff --no-textconv --cached --` | HEAD to index, including staged additions and deletions. Also works before the first commit. |
| Tracked work in progress | `git diff --no-ext-diff --no-textconv HEAD --` | HEAD to tracked working files, combining staged and unstaged net changes. Requires HEAD; inspect the two scopes separately in an unborn repository. |
| Commit | `git diff --no-ext-diff --no-textconv <commit>^ <commit> --` | One non-root, non-merge commit relative to its parent. |
| Merge commit | `git diff --no-ext-diff --no-textconv <parent> <commit> --` | Merge result relative to the parent relevant to the task; never silently choose a parent. |
| Root commit | `git diff --no-ext-diff --no-textconv <empty-tree> <commit> --` | Initial commit relative to an empty tree. |
| Fixed endpoints | `git diff --no-ext-diff --no-textconv <base> <head> --` | Exact tree-to-tree change since the task's fixed base. |
| Branch or PR contribution | `git diff --no-ext-diff --no-textconv <base>...<head> --` | Merge-base to head; excludes changes unique to the target branch. |

## Work in progress

Start with `git status --short` and `git ls-files --others --exclude-standard`. `git diff` omits untracked files. For a work-in-progress review, inspect in-scope untracked file contents and retain their paths and contents/digests with the snapshot. Do not add them to the index to obtain a diff. Mention excluded files, unresolved conflicts, and binary changes that cannot be evaluated from a text patch.

When both staged and unstaged scopes are requested, retain both patches, even if their net change cancels in `git diff HEAD`. A staged review evaluates index contents (for example `git show :path/to/file`), not later working-file edits. A commit/PR review evaluates files at the bound head (`git show <head>:path/to/file`), not an unrelated checkout. These paths are examples of repository inputs, not bundled skill files.

## Commits and fixed bases

Inspect parents with `git rev-list --parents -n 1 <commit>`. For a root commit, obtain `<empty-tree>` with `git hash-object -t tree --stdin` using empty input; do not hard-code a SHA-1 hash, since repositories can use other object formats. For a merge commit, derive the parent from the task or ask if the choice changes the review's meaning and remains unresolved. A combined merge diff can omit parent-specific changes.

For an explicit “since X” snapshot request, use **Fixed endpoints**. For changes contributed by a branch relative to its target, use **Branch or PR contribution**. Record `git merge-base <base> <head>` for the latter. If multiple merge bases exist, report that ambiguity instead of silently picking one. In shallow or incomplete history, report missing objects/history rather than substituting HEAD or another base.

## Pull requests

Read PR metadata through the available platform connector or CLI to obtain the actual target branch/base SHA and PR head SHA, plus linked requirements. Do not guess `main`, use the local checkout's HEAD as the PR head, or treat a synthetic test-merge commit as the PR head. Resolve the objects locally when available and use **Branch or PR contribution**. If objects are unavailable, use the platform's read-only diff and record its base/head semantics and any truncation; a fetch, if needed, remains subject to the existing task authorization. No checkout, stash, reset, or source mutation is needed.

A two-dot log (`git log <base>..<head> --oneline`) is useful commit context, not the review diff. Resolve and record base, head, merge-base, and source/spec before review; recheck PR head metadata before attributing the result to the current PR.
