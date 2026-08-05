# Release

Release and publication remain human-gated actions. This repository's local verification can prepare evidence, but it does not publish an artifact, push a branch, create a pull request, merge, or create a release.

Prepare evidence for one exact commit:

```sh
npm run plugin:verify
npm run release:pack
npm run plugin:smoke
npm run verify:trio
```

Confirm that the generated release directory contains only `harness-codex-plugin-<version>.tgz`, `manifest.json`, `SHA256SUMS`, and `release-notes.md`. Check the checksum before a human chooses a distribution path.

The release note should describe the verified Codex Trio change in user-facing language. Do not state that generic/manual fallback hosts are packaged, or that an existing user-global installation has been migrated, unless separate evidence and authorization exist.
