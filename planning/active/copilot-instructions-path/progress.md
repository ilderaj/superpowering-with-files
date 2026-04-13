# Progress

- 已读取 VS Code 官方 Copilot custom instructions 文档。
- 已定位 HarnessTemplate 中 Copilot workspace entry 的不一致来源：
  - `harness/installer/lib/paths.mjs`
  - `harness/adapters/copilot/manifest.json`
  - `README.md`
  - `docs/install/copilot.md`
  - 相关测试 state fixture
- 已将 workspace scope 的 Copilot entry 校正为 `.github/copilot-instructions.md`。
- 已保留 user-global scope 的 `~/.copilot/copilot-instructions.md`。
- 已运行相关测试：`node --test tests/installer/paths.test.mjs tests/adapters/sync-skills.test.mjs tests/installer/health.test.mjs`，18 项通过。
- 已运行全量验证：`node --test tests/core/*.test.mjs tests/installer/*.test.mjs tests/adapters/*.test.mjs`，75 项通过。
