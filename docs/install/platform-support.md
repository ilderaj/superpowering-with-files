# Platform Support

HarnessTemplate currently supports installer-managed projections for:

- Codex
- GitHub Copilot
- Cursor
- Claude Code

HarnessTemplate does not currently support installer-managed Gemini CLI projections.

That means:

- no rendered `GEMINI.md` entry file is generated,
- no installer-managed Gemini user-global entry is written,
- no Gemini skill root or hook root is projected by `install` or `sync`.

If you pass `--targets=gemini`, the installer reports Gemini as unsupported instead of silently creating partial state.
