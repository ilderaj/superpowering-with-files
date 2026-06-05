# Copilot Planning With Files Patch

Copilot receives a materialized `planning-with-files` copy because Copilot skill loading and hook behavior differs from Codex and Claude Code.
This patch is applied on top of the cross-IDE `planning-with-files` companion-plan patch.

Patch behavior:

- preserve the companion-plan semantics added by the shared Harness patch,
- preserve the planning workflow body,
- remove or avoid incompatible hook assumptions,
- keep task-scoped planning paths unchanged,
- keep the skill name `planning-with-files`.
