## 任务概述

审计 `planning-with-files` / Harness 中关于 planning 记录标题时间格式的既有设计、历史实现与当前生效情况。确认是否曾完成“仅日期 -> 日期+具体时间”的规划与开发；如果当前仍存在仅日期标题，则定位漂移点，并输出可 review 的 implementation plan，不直接实施代码变更。

## Current State
Status: closed
Archive Eligible: yes
Close Reason: Record timestamp implementation completed and verified; result transferred into project-roadmap-audit.
Closed At: 2026-05-06T15:54:39

## 完成标准

- 找到与 planning 标题时间格式相关的历史 planning / commit / tests / templates 证据
- 确认当前仓库中哪些 planning entry 仍是仅日期，哪些已经是日期+时间
- 明确当前行为由哪些模板、脚本、hook 或投影路径控制
- 解释“为什么你现在看到的仍然是日期”
- 输出可 review 的 implementation plan，覆盖 Harness 后续统一要求
- 实现“必做：统一今后所有新 records 的写入链路”
- 为共享 helper、CLI 入口和初始化脚本补回归测试

## 阶段

### Phase 1: 历史审计
Status: complete

- 盘点相关 active/archive task、git 提交、tests 与模板变更
- 确认是否存在已完成的“日期+具体时间”实现

### Phase 2: 现状核对
Status: complete

- 检查当前 planning 模板、初始化脚本、session summary / hook 写入路径
- 对照样例 planning files，确认现状与历史实现是否漂移

### Phase 3: 方案输出
Status: complete

- 汇总 root cause / scope / affected surfaces
- 形成可 review 的 implementation plan，不直接开发

### Phase 4: 共享 record helper
Status: complete

- 增加统一 UTC+8 timestamp / heading / append block helper
- 让 shell / PowerShell / CLI 共用同一 contract

### Phase 5: Harness CLI 接入
Status: complete

- 增加官方 command，用于向 `task_plan` / `findings` / `progress` 追加 timestamped record
- 更新帮助文案与相关提示

### Phase 6: 测试与验证
Status: complete

- 增加 command / helper / init-session 级测试
- 运行 focused tests，必要时运行更大范围验证
