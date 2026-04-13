# Progress

- 已读取 VS Code 官方 Copilot custom instructions 文档。
- 已定位 HarnessTemplate 中 Copilot workspace entry 的不一致来源：
  - `harness/installer/lib/paths.mjs`
  - `harness/adapters/copilot/manifest.json`
  - `README.md`
  - `docs/install/copilot.md`
  - 相关测试 state fixture
- 已将 workspace scope 的 Copilot entry 校正为 `.github/copilot-instructions.md`。
- 已将 user-global scope 的 Copilot entry 校正为 `~/.copilot/instructions/harness.instructions.md`。
- 已为 Copilot instructions 模板添加 `applyTo: "**"` frontmatter，确保 user profile `*.instructions.md` 自动应用。
- 已运行相关测试：`node --test tests/installer/paths.test.mjs tests/adapters/templates.test.mjs tests/adapters/sync-skills.test.mjs tests/installer/health.test.mjs`，23 项通过。
- 已运行全量验证：`node --test tests/core/*.test.mjs tests/installer/*.test.mjs tests/adapters/*.test.mjs`，77 项通过。
- 已执行本机 user-global Copilot 同步：`./scripts/harness install --targets=copilot --scope=user-global && ./scripts/harness sync`。
- 已删除旧的 Harness 管理文件 `/Users/jared/.copilot/copilot-instructions.md`，并从 `.harness/projections.json` 移除旧投影记录。
- 当前本机全局 Copilot instructions 文件为 `/Users/jared/.copilot/instructions/harness.instructions.md`。
- 已将本地 `.harness/state.json` 恢复为 user-global 全目标状态，其中 Copilot 路径为新文件。
- 已在 `README.md` 的 Entry Files 部分补充 Copilot workspace/user-global 路径依据、`applyTo: "**"` 自动应用规则，以及旧路径不再使用的说明。
