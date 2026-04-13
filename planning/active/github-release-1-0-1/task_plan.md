# 发布 GitHub Release 1.0.1

## Current State
Status: closed
Archive Eligible: yes
Close Reason: GitHub Release 1.0.1 已基于 origin/main 发布并验证。

## 目标
- 基于 `origin/main` 发布 GitHub Release `1.0.1`。
- Release note 保持简明、克制、清晰。

## 完成标准
- 确认 `origin/main` 已更新到当前远端状态，并记录目标提交。
- 确认 `1.0.1` 不存在已有 tag 或 release。
- 基于 `1.0.0..origin/main` 的变更起草简短 release note。
- 使用 `gh` 创建正式 GitHub Release `1.0.1`。
- 验证 release 存在，并且 tag 指向预期 `origin/main` 提交。

## 阶段
- [x] 阶段 1：检查仓库、远端和现有发布状态。
- [x] 阶段 2：梳理变更并确定 release note。
- [x] 阶段 3：创建并验证 GitHub release。

## 决策记录
- 不启用 superpowers：发布流程明确，无复杂架构判断或根因诊断需求。
- 版本 tag 使用用户指定的 `1.0.1`，不是 `v1.0.1`。
- 发布目标固定为完整提交 `6dc4478b2b01c351c8ae909a173e742d336454b7`，避免依赖默认分支隐式解析。
- Release note 使用英文，因为它属于项目发布文档；对话和规划记录使用中文。
- 发布前验证使用 `npm run verify`，不运行 frontend dev/build/start/serve 命令。
