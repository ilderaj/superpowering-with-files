# GitHub Copilot Installation

Copilot receives rendered `copilot-instructions.md` files.

Workspace scope writes:

```text
.copilot/copilot-instructions.md
```

User-global scope writes:

```text
~/.copilot/copilot-instructions.md
```

Copilot must not be assumed to read Codex global configuration. `planning-with-files` is materialized for Copilot when required.
