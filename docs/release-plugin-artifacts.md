# Harness Plugin Release Artifacts

Each release produces one packaged Codex Trio artifact:

- `harness-codex-plugin-<version>.tgz`
- `manifest.json`
- `SHA256SUMS`
- `release-notes.md`

The package contains `.codex-plugin/plugin.json` and exactly four Trio skills: the entry policy plus `dev`, `office`, and `safety`. It contains no additional host package.

For download and local Codex installation, see [Harness Packed Plugin Installation](install/plugin-packages.md).

## Build

```sh
npm run release:pack
```

The build writes local artifacts to `dist/release/<version>/`.

## Verification gates

Before a human makes any release or publication decision, run:

```sh
npm run plugin:verify
npm run release:pack
npm run plugin:smoke
npm run verify:trio
```

`npm run plugin:smoke` verifies the one Codex package and its four Trio skills. It is local artifact evidence, not a publication action.

## Install evidence

Validate the downloaded `harness-codex-plugin-<version>.tgz` through the Codex marketplace path. Confirm that `.codex-plugin/plugin.json` and the four `skills/trio/**/SKILL.md` files are present. If the Codex CLI is unavailable, record that limitation and do not claim host-level installation verification.
