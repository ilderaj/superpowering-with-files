## 任务概述

修复 planning files 中“裸时间戳 heading”导致的时间显示不准确问题。确认原始 timestamp 写入是否正确，定位展示/解析层误读原因，并调整 canonical heading contract，避免 `findings.md`、`task_plan.md`、旧式 `progress.md` 在预览中被错误格式化。

## Current State
Status: waiting_review
Archive Eligible: no
Close Reason: 时间戳显示 contract 已修复，相关 focused tests 通过；全量 verify 仅被无关的既有绝对路径文档问题阻断，等待用户 review。

## 完成标准

- 确认原始 planning 文件中的 timestamp 值是否正确
- 确认导致显示异常的 contract 是“裸时间戳 heading”而不是 UTC+8 取值本身
- 修改共享 helper / 模板 / 测试，使今后新增 record 不再使用裸时间戳 heading
- 修复当前仓库内已受影响的 planning 文件标题
- 跑 focused tests 与必要验证

## 阶段

### Phase 1: 复现与根因确认
Status: complete

- 核对原始 markdown 与截图现象
- 确认时间值正确、heading contract 有问题

### Phase 2: contract 修复
Status: complete

- 修改 helper / 模板 / 测试
- 统一 findings / task_plan / legacy progress heading 语义前缀

### Phase 3: 文件矫正与验证
Status: complete

- 修复仓库内受影响 planning 文件
- 运行 focused tests，必要时运行更大验证
