# Task Plan: GitHub Actions Upstream Automation Analysis

## Goal
分析是否可以用 GitHub Actions 定期监测 Superpowers 和 Planning with Files 主源变更，并在本项目内自动更新、审查、验证、合并与处理 PR。

## Current State
Status: active
Archive Eligible: no
Close Reason:

## Current Phase
Phase 5

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

### Phase 4: README 精简同步
- [x] 根据已确认的 Git source 状态，精简 README 的 upstream 更新说明
- [x] 确认 README 不再出现旧的本地 `--from` 指令
- **Status:** complete

### Phase 5: GitHub Actions 落地计划评审
- [x] 结合当前仓库与 GitHub 远端状态复核自动化前提
- [x] 审核“每周五拉取 upstream 更新并最终落到 origin dev”的计划路径
- [x] 输出计划风险、缺口和建议执行顺序
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
| `planning-with-files` 已具备自动监测前提 | 已确认并配置 Git source：`https://github.com/OthmanAdi/planning-with-files` |
| 复用现有 `github-actions-upstream-automation-analysis` 任务继续记录本轮评审 | 当前用户请求与既有 task goal 同域，重复新建 task 会制造平行 planning 状态 |
| 计划必须以默认分支 `main` 上的 schedule workflow 为入口，再通过 PR 落到 `dev` | GitHub `schedule` 仅在默认分支运行；远端默认分支已核实为 `main` |
| 计划中的“拉 upstream 更新”应映射为 Harness `fetch/update/sync/verify/doctor` 链路，而不是仓库 remote `upstream` pull | 当前仓库只配置了 `origin` remote；真正的 upstream 来源定义在 `harness/upstream/sources.json` |
| 在 Actions 中必须先显式安装 workspace state，再跑 `sync/verify/doctor` | 当前仓库 `.harness/state.json` 为 `user-global` scope，不适合作为 CI 的隐式前提 |

## Errors Encountered
| Error | Attempt | Resolution |
|-------|---------|------------|
| `fd` 不存在 | 1 | 按降级策略改用 `rg --files` |

## Notes
- 需要用中文输出分析；代码相关名称、命令、workflow 字段保持英文。
- 不运行 frontend dev/build/start/serve；本次也不进行实现。
- 本轮新增计划评审只给出方案修正，不创建 workflow、不推分支、不改 GitHub 设置。
