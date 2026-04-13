# Findings

- VS Code 官方文档说明 workspace custom instructions 的主路径是 `.github/copilot-instructions.md`，也支持 `.github/instructions/*.instructions.md` 的指令文件。
- 当前 HarnessTemplate 的 Copilot workspace entry 仍解析到 `.copilot/copilot-instructions.md`，这会导致 VS Code Chat Customizations 看不到 Harness 的 workspace instructions。
- VS Code user profile instructions 的默认目录是 `~/.copilot/instructions`，且文件应使用 `.instructions.md` 扩展名。
- `*.instructions.md` 若没有 `applyTo`，不会自动应用；Harness 全局 Copilot 文件应加 `applyTo: "**"`。
