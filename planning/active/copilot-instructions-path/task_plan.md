# Copilot Instructions 路径校正

## Current State
Status: active
Archive Eligible: no
Close Reason:

## 目标

确认 VS Code Copilot workspace instructions 的官方路径，并校正 HarnessTemplate 当前 Copilot 入口文件投影路径，避免写入 VS Code 不会自动读取的位置。

## 完成标准

- 官方文档结论已记录。
- Workspace scope 的 Copilot instructions 写入 `.github/copilot-instructions.md`。
- User-global scope 写入 `~/.copilot/instructions/harness.instructions.md`。
- 实现、测试、文档保持一致。
- 相关 Node 测试通过。

## 步骤

1. 已完成：核对 VS Code 官方 Copilot custom instructions 文档。
2. 已完成：检查 HarnessTemplate 当前 adapter、path resolver、docs 和测试。
3. 已完成：修改 Copilot workspace entry path。
4. 已完成：更新文档和测试。
5. 已完成：运行相关测试验证。

## 结果

Workspace scope 的 Copilot instructions 现在写入 `.github/copilot-instructions.md`。User-global scope 写入 `~/.copilot/instructions/harness.instructions.md`，并带有 `applyTo: "**"` frontmatter。
