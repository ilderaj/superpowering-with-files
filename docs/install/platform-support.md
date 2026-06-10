# Platform Support

This page is the support matrix for installer-managed Harness targets.

Use it to answer:

- which targets Harness supports directly
- which surfaces are compatibility-only
- which targets are currently unsupported

Current installer-managed targets:

- Codex
- GitHub Copilot
- Cursor
- Claude Code

Compatibility and boundary notes:

- MCP is a runtime compatibility layer, not a projection target
- cloud-dev is an operator lane, not a separate installer target
- hooks still depend on target-specific prerequisites even when the target itself is supported

Harness does not currently support installer-managed Gemini CLI projections.

That means:

- no rendered `GEMINI.md` entry file is generated,
- no installer-managed Gemini user-global entry is written,
- no Gemini skill root or hook root is projected by `install` or `sync`.

If you pass `--targets=gemini`, the installer reports Gemini as unsupported instead of silently creating partial state.

For choosing between minimal-global, full-local, and cloud-dev adoption profiles, start with the [Adoption Starter Kit](adoption-starter-kit.md).

Hook availability depends on target-specific prerequisites:

- Codex: requires hooks to be enabled in the installed Codex build. Check with `codex features list | rg '^hooks\\s'` and follow the upstream Codex docs for builds that use a different gate name or config shape.
- GitHub Copilot / VS Code: hooks are preview functionality and may be disabled by org policy.
- Cursor: native hooks are official; Claude-compatible hooks additionally require the Third-party skills feature.
- Claude Code: hooks are native in `.claude/settings*.json`.
