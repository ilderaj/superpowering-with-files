# Shell And Token Guidance Snippet

Use this snippet only for generated outputs that do not already include `harness/core/policy/base.md`.

Use output-compressing command wrappers for shell commands likely to produce medium or large output, especially Git operations, broad searches, large file reads, diffs, tests, builds, linters, logs, GitHub CLI, Docker, Kubernetes, curl, and JSON or log formatting.

Skip command wrappers for trivial commands or tiny targeted reads where compression adds overhead without saving context.
