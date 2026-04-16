# Task Plan: README Upstream Credit and Release 1.0.3

## Goal
收敛并重组 `README.md`，明确说明 `superpowers` 与 `planning-with-files` 的上游授权、原始使用方式、在本项目中的继承方式与使用范围，补充 credit/thanks，并发布下一个 GitHub release。

## Current State
Status: closed
Archive Eligible: yes
Close Reason: README 收口、GitHub About 更新、分支推送与 PR #15 已完成。

## Current Phase
Phase 6

## Phases

### Phase 1: 现状与上游来源核对
- [x] 检查当前 README 结构问题
- [x] 核对 `superpowers` 与 `planning-with-files` 的上游仓库、license、原始使用方式
- [x] 确认当前最新 release/tag 和待发布差异范围
- **Status:** complete

### Phase 2: README 重构
- [x] 调整 README 章节顺序，先讲核心规则，再讲结构与能力入口
- [x] 写明上游授权、继承方式、使用范围和 credit
- [x] 收敛冗长表格，把细节留给 docs
- **Status:** complete

### Phase 3: 验证与发布
- [x] 运行必要验证
- [x] 整理自上一个版本以来的 release notes
- [x] 创建提交、tag 和 GitHub release
- **Status:** complete

### Phase 4: README 二次重塑
- [x] 保留结构图和来源到投影的对比关系
- [x] 恢复 entry files、skills、hooks 等路径矩阵，但压缩冗余说明
- [x] 统一规则、结构、来源、credits、授权的叙述顺序
- [x] 重新验证 README 改动
- **Status:** complete

### Phase 5: README 三次收口
- [x] 继续压缩重复句和解释句
- [x] 统一标题和表格术语
- [x] 保留信息面不再扩张
- [x] 重新验证 README 改动
- **Status:** complete

### Phase 6: 提交、推送、PR 与 About 更新
- [x] 创建独立分支承载本轮 README 收口
- [x] 更新 GitHub repository About 描述
- [x] 提交并推送分支
- [x] 创建 PR
- **Status:** complete

## Decisions Made
| Decision | Rationale |
|----------|-----------|
| 为本次 README/release 工作单独开新 task | 这次工作是新的发布与文档收敛任务，不复用仓库更名任务，避免 planning 记录混杂 |
| README 首页只保留规则、上游继承、安装入口和文档导航 | 首页应该先解释行为模型，而不是穷举投影细节 |
| release 说明只覆盖 `1.0.2..HEAD` 的真实差异 | 避免把历史已发布内容重复写进新 release note |
| 同一用户继续要求优化 README 时，复用此 task 并新增 phase | 属于同一文档收敛任务，不应再新开 planning 目录 |
| README 恢复结构图和路径矩阵，但放在规则与来源之后 | 对比关系仍然重要，只是不应打断首页对行为模型的解释 |
| About 描述只写一句英文短句 | GitHub About 需要极简、直接、可扫描 |

## Errors Encountered
| Error | Attempt | Resolution |
|-------|---------|------------|

## Notes
- 预期 release 版本按最新 tag `1.0.2` 增加 `0.0.1`，即 `1.0.3`。
