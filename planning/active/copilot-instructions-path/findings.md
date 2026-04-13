# Findings

- VS Code 官方文档说明 workspace custom instructions 的主路径是 `.github/copilot-instructions.md`，也支持 `.github/instructions/*.instructions.md` 的指令文件。
- 当前 HarnessTemplate 的 Copilot workspace entry 仍解析到 `.copilot/copilot-instructions.md`，这会导致 VS Code Chat Customizations 看不到 Harness 的 workspace instructions。
- User-global 路径仍可保留为 `~/.copilot/copilot-instructions.md`，因为这是 Harness 自己的跨 IDE 全局投影位置，不等同于 VS Code workspace 扫描路径。
