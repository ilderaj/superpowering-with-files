# Architecture

HarnessTemplate uses four layers:

- `harness/core`: platform-neutral policy, skills metadata, templates, and schemas.
- `harness/adapters`: platform-specific projection manifests.
- `harness/installer`: CLI commands and projection logic.
- `harness/upstream`: vendored baselines and source metadata.

Core is the source of truth. Adapters translate core into platform-specific files. The installer manages state and projection.

Projection operations:

- `render`: generate entry files from templates.
- `link`: link compatible skills or directories.
- `materialize`: copy files when a platform needs a real local copy or patched content.
