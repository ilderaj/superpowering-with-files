# Task Plan: Local Upstream Refresh From Dev Worktree

## Goal
先把当前 `dev` 上未提交改动提交，清空主工作区；再从本地 `dev` 派生一个新的独立 worktree，在该隔离环境执行一次本地 upstream update，若过程中出现问题则直接修复，并按 upstream update 的常规要点完成验证。

## Current State
Status: waiting_integration
Archive Eligible: no
Close Reason:

## Current Phase
Phase 8

## Phases

### Phase 1: 提交当前 `dev` 改动并建立干净基线
- [x] 检查当前未提交改动的范围与提交信息风格
- [x] 将当前改动提交到本地 `dev`
- [x] 验证主工作区回到 clean 状态
- **Status:** complete

### Phase 2: 从本地 `dev` 创建隔离 worktree
- [x] 生成本轮 worktree 名称
- [x] 创建并进入新的 linked worktree
- [x] 记录 worktree path / branch / HEAD
- [x] 校验隔离工作区基线是否干净
- **Status:** complete

### Phase 3: 在隔离 worktree 执行本地 upstream update
- [x] 确认仓库提供的 upstream refresh/update 入口命令
- [x] 执行一次本地 upstream update
- [x] 收集失败点、受影响文件和产物
- **Status:** complete

### Phase 4: 主动修复执行中暴露的问题
- [x] 定位 root cause
- [x] 做最小必要修复
- [x] 如需，重复执行 upstream update 直到主路径通过
- **Status:** complete

### Phase 5: 按 upstream update 常规要点验证
- [x] 检查工作区 diff 是否符合预期范围
- [x] 运行相关 focused tests / verify 命令
- [x] 记录最终验证结果、残余风险与后续建议
- **Status:** complete

### Phase 6: 在 worktree 恢复标准在线 fetch/update
- [x] 重新确认当前环境是否可访问 GitHub upstream
- [x] 对 `superpowers` 和 `planning-with-files` 执行标准在线 `fetch`
- [x] 在隔离 worktree 执行标准在线 `update`
- [x] 区分 upstream 变化、本地 overlay 效应与基线既有失败
- **Status:** complete

### Phase 7: 集成与收口
- [ ] 决定是否将 worktree 分支结果 cherry-pick / merge 回 `dev`
- [ ] 如接受，明确是否连同 tracking 文件一起提交，还是只保留代码变更
- [ ] 在最终集成前保留 worktree 作为评审与回滚锚点
- **Status:** pending

### Phase 8: 基线 verify 红点分析与修复
- [x] 将 10 个基线失败按模块归因
- [x] 修复过时测试期望与 runtime evidence 聚合缺口
- [x] 处理 Copilot hook payload measurement 的超时不稳定性
- [x] 重新跑完整 `npm run verify` 直到 fresh 全绿
- **Status:** complete

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
| 原生 `EnterWorktree` 不满足本任务的 `from local dev` 基线要求 | 实际创建结果落在 `main/origin/main`，且在该 worktree 内修正基线受沙箱阻断 |
| 改用手工 `git worktree add ... dev` 重建 worktree | 这是当前唯一能显式绑定本地 `dev` 为基线的方法 |
| 当前标准在线 `fetch` 不可作为执行路径 | 受限于当前沙箱环境，`git clone` 先命中模板拷贝权限问题，随后命中 GitHub 网络 403 |
| 如继续推进，只能尝试复用本地缓存 candidate 做离线 update | 当前唯一可操作的 upstream input 来自历史 worktree 中保留的 `.harness/upstream-candidates/*` |
| 本轮只对 `superpowers` 执行离线 update | `planning-with-files` 的历史 candidate 明显过旧，直接套用风险高 |
| 接受最小本地修复以保证离线 update 结果可用 | 离线 update 暴露了 symlink 绝对路径回归，需要先修复复制语义才能把结果视为有效 |
| 当前环境恢复 GitHub 可达后，改回标准在线 `fetch` → `update` 路径 | 这样才能把任务从“离线补救”推进为真正的 upstream refresh |
| `npm run verify` 的 10 个红点按 `dev` 基线既有失败处理 | 同样的 `hook-projection` / `adoption` 测试在主工作区同一 `dev` 提交上也会失败，不是本轮 update 新引入 |
| 当前 task 进入 `waiting_integration` 而不是 `closed` | worktree 中已有可评审 diff，但尚未决定是否直接集成回主工作区 `dev` |
| `hook-projection` 的 8 个红点按“测试期望落后于实现”修复 | 实现已稳定投影 `runtime-hook-evidence.sh`，测试必须同步该契约 |
| `adoption-status` 需要把“部分 hook 未测到 runtime evidence”也作为 advisory 输出 | 否则 receipt 已表明总体未 fully verified，但用户态 status reasons 仍为空，语义不一致 |
| Copilot 双作用域 hook payload measurement timeout 从 2000ms 放宽到 5000ms | 空载运行约 300ms，但全量 verify 压力下 2 秒阈值会产生假阳性超时 |

## Blockers
- 当前无技术 blocker；剩余工作是决定如何把 worktree 结果集成回 `dev`。

## Notes
- 本任务从 clean `dev` 基线派生新的 worktree；除必要的 planning 文件外，不在主工作区引入额外实现改动。
- 当前已完成一次标准在线 `fetch` → `update`，source 覆盖 `superpowers` 与 `planning-with-files`。
- worktree 当前变更规模为 78 个文件，主要来自 `planning-with-files` upstream baseline 更新，外加 `superpowers` baseline 变更，以及 `verbatimSymlinks` 修复与对应测试。
- `sync --dry-run` 结果仍为零 projection 变更；`doctor --check-only` 通过，只有 pre-existing companion-plan warnings。
- 在补齐基线测试后，worktree 上重新执行 `npm run verify`，得到 `431 pass / 0 fail` 与 `21 pass / 0 fail` 的 fresh 结果。
