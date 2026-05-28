# Task Plan: Local Upstream Refresh From Dev Worktree

## Goal
先把当前 `dev` 上未提交改动提交，清空主工作区；再从本地 `dev` 派生一个新的独立 worktree，在该隔离环境执行一次本地 upstream update，若过程中出现问题则直接修复，并按 upstream update 的常规要点完成验证。

## Current State
Status: active
Archive Eligible: no
Close Reason:

## Current Phase
Phase 1

## Phases

### Phase 1: 提交当前 `dev` 改动并建立干净基线
- [ ] 检查当前未提交改动的范围与提交信息风格
- [ ] 将当前改动提交到本地 `dev`
- [ ] 验证主工作区回到 clean 状态
- **Status:** in_progress

### Phase 2: 从本地 `dev` 创建隔离 worktree
- [ ] 生成本轮 worktree 名称
- [ ] 创建并进入新的 linked worktree
- [ ] 记录 worktree path / branch / HEAD
- [ ] 校验隔离工作区基线是否干净
- **Status:** pending

### Phase 3: 在隔离 worktree 执行本地 upstream update
- [ ] 确认仓库提供的 upstream refresh/update 入口命令
- [ ] 执行一次本地 upstream update
- [ ] 收集失败点、受影响文件和产物
- **Status:** pending

### Phase 4: 主动修复执行中暴露的问题
- [ ] 定位 root cause
- [ ] 做最小必要修复
- [ ] 如需，重复执行 upstream update 直到主路径通过
- **Status:** pending

### Phase 5: 按 upstream update 常规要点验证
- [ ] 检查工作区 diff 是否符合预期范围
- [ ] 运行相关 focused tests / verify 命令
- [ ] 记录最终验证结果、残余风险与后续建议
- **Status:** pending

## Key Questions
1. 当前本地 upstream update 的规范入口命令是什么？
2. 本次 update 是否只产生预期的 vendor/projection/skill 变更？
3. 若 update 失败，失败点属于 patch drift、allowlist、测试回归，还是环境问题？

## Decisions Made
| Decision | Rationale |
|----------|-----------|
| 本轮新建独立 tracked task | 涉及 commit、worktree、upstream update、修复与验证，需要 durable trail |
| 先提交当前 `dev` 改动 | 用户明确要求先把当前修改落到本地 `dev`，保持主工作区干净 |
| update 在新 worktree 中执行 | 避免污染主工作区，并与用户要求保持一致 |

## Blockers
- None.

## Notes
- 本任务从 clean `dev` 基线派生新的 worktree；除必要的 planning 文件外，不在主工作区引入额外实现改动。
