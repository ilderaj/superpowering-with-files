# Release

Release and publication remain human-gated actions. This repository's local verification can prepare evidence, but it does not publish an artifact, push a branch, create a pull request, merge, or create a release.

Prepare evidence for one exact commit:

```sh
npm run plugin:verify
npm run release:pack
npm run plugin:smoke
npm run verify:trio
```

Confirm that the generated release directory contains `harness-codex-plugin-<version>.tgz`, `harness-agent-plugins-<version>.tgz`, `harness-matt-skills-codex-plugin-<version>.tgz`, `harness-matt-skills-agent-plugins-<version>.tgz`, `manifest.json`, `SHA256SUMS`, and `release-notes.md`. Check `SHA256SUMS` against each archive and confirm its digest and target in `manifest.json` before a human chooses a distribution path.

The release note should name the two core artifacts — the native Codex Trio package and portable Agent Plugins v1 package — and the two independent, opt-in Matt companion artifacts. The companion packages make no change to Trio or its projection. `grill-me` and `grilling` are explicit opt-in; `to-questionnaire` creates a local Markdown draft; external delivery remains human-gated.

The native companion may be installed through its separate Codex marketplace root and manifest. The portable companion remains client-owned and uses the client's own procedure; do not claim a remote install. Do not state that generic/manual fallback hosts are packaged or managed, or that an existing user-global installation has been migrated, unless separate evidence and authorization exist.
