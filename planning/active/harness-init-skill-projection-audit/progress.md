# HarnessTemplate 初始化 Skill 投影审计进度

## 2026-04-14

- 用户已确认采用方案 B，目标是长期维护稳定。
- 已按 `executing-plans` 要求完成：
  - 计划复核
  - worktree base preflight
  - 隔离 worktree 创建
- 当前 worktree:
  - Branch: `codex/harness-skill-projection-stability`
  - Path: `/Users/jared/.config/superpowers/worktrees/HarnessTemplate/codex-harness-skill-projection-stability`
- 当前准备进入实现：
  - 先读 metadata / projection / health / tests
  - 再改 roots 与 projection strategy
  - 最后补文档与验证
- 已完成实现：
  - `harness/core/metadata/platforms.json`
  - `harness/core/skills/index.json`
  - `harness/adapters/*/manifest.json`
  - `harness/installer/lib/health.mjs`
  - `README.md`
  - `docs/install/codex.md`
  - `docs/install/claude-code.md`
  - `docs/architecture.md`
  - `harness/core/policy/platform-overrides/{codex,copilot,claude-code}.md`
  - 相关 tests
- 已完成验证：
  - `node --test tests/core/skill-index.test.mjs tests/installer/paths.test.mjs tests/adapters/skill-projection.test.mjs tests/adapters/sync-skills.test.mjs tests/adapters/sync.test.mjs tests/installer/health.test.mjs`
  - `node --test tests/core/*.test.mjs tests/installer/*.test.mjs tests/adapters/*.test.mjs`
- 当前状态：
  - 实现完成，等待用户 review
