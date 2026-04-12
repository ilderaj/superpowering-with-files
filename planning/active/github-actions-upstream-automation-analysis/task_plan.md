# Task Plan: GitHub Actions Upstream Automation Analysis

## Goal
分析是否可以用 GitHub Actions 定期监测 Superpowers 和 Planning with Files 主源变更，并在本项目内自动更新、审查、验证、合并与处理 PR。

## Current State
Status: active
Archive Eligible: no
Close Reason:

## Current Phase
Phase 3

## Phases

### Phase 1: 仓库上下文与约束确认
- [x] 读取用户问题与仓库工作流约束
- [x] 确认已有 upstream update 能力与 planning 任务状态
- [x] 确认本次只做分析、不改源码
- **Status:** complete

### Phase 2: 外部能力与风险调研
- [x] 查阅 GitHub Actions、PR、auto-merge、权限和相关官方文档
- [x] 结合本项目 upstream source 设计判断可行方案
- [x] 记录关键发现
- **Status:** complete

### Phase 3: 分析结论交付
- [x] 给出推荐架构
- [x] 列出可自动化部分、需人工审批部分、风险与落地条件
- [x] 更新 planning 文件并向用户汇报
- **Status:** complete

## Key Questions
1. GitHub Actions 是否能定期检测两个 upstream 主源的变更？
2. Actions 是否能安全触发本项目已有 `fetch` / `update` 流程？
3. 更新后自动代码审查、验证、自动合并和 PR 处理分别能做到什么程度？
4. 哪些环节必须设置权限、分支保护或人工审批，避免供应链和权限风险？

## Decisions Made
| Decision | Rationale |
|----------|-----------|
| 本次只做分析，不改源码 | 用户明确要求“不要动代码，先分析” |
| 新建独立 planning 任务目录 | 相关旧任务已关闭，不应把新任务写入已关闭任务 |
| 不自动归档旧任务 | 仓库规则要求不要自动移动历史 active 目录，除非明确要求 |
| 推荐使用 PR + required checks + auto-merge，而不是直接推默认分支 | upstream 更新属于供应链变更，必须保留审查面和分支保护 |
| 推荐用 GitHub App token 处理推分支/开 PR | `GITHUB_TOKEN` 触发的 push/pull_request 事件不会创建新的 workflow run，容易让 PR 检查链断掉 |
| `planning-with-files` 自动监测前需先定义远端主源 | 当前配置是 `local-initial-import`，无法从 GitHub Actions 中独立判断主源更新 |

## Errors Encountered
| Error | Attempt | Resolution |
|-------|---------|------------|
| `fd` 不存在 | 1 | 按降级策略改用 `rg --files` |

## Notes
- 需要用中文输出分析；代码相关名称、命令、workflow 字段保持英文。
- 不运行 frontend dev/build/start/serve；本次也不进行实现。
