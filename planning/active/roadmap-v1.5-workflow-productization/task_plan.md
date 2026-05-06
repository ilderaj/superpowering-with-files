# Task Plan: Roadmap v1.5 Workflow Productization

## Current State
Status: active
Archive Eligible: no
Close Reason:

## Goal

执行 `docs/roadmap.md` 的 `v1.5`，把 Harness 的 operator surface 从“规则与投影实现”整理成更直接的 workflow lanes，同时吸收已合并的 README 精简结果，并把 browser/eval 能力明确为可选 contract，而不是强依赖。

## Scope

- 确认 `readme-slim-pr` 的 PR #29 已合并，并把该 task 正式关闭归档。
- 以 `plan / review / verify / finish / release / archive` 六条 lanes 重组文档面。
- 在 `README.md`、`docs/maintenance.md`、`docs/architecture.md`、`docs/release.md` 中建立统一 lane 叙述。
- 定义 optional browser/eval contracts，明确这是可接入能力，不是内建 runtime。
- 保持 `planning-with-files` 为唯一 durable planning system，不新增第二套任务系统。

## Execution Source

- Master execution plan: `docs/superpowers/plans/2026-05-06-roadmap-implementation-plan.md`
- Section: `## 8. v1.5: Workflow Productization And Operator Experience`
- Sync-back status: active, implementation not started.

## Current Phase

Phase 3: Verification and integration

## Phases

### Phase 1: Discovery and doc-surface alignment
- [x] 确认 `v1.4` 已 merge/push，可作为 `v1.5` 基线
- [x] 确认 PR #29 当前状态，并决定 `readme-slim-pr` 的收口路径
- [x] 读取 README、maintenance、architecture、release 与 gstack 对比结论
- [x] 创建 `v1.5` 文档重组计划并记录 lane 定义
- **Status:** complete

### Phase 2: Workflow lane documentation
- [x] 更新 README 的 operator-facing workflow surface
- [x] 在 maintenance / architecture / release 文档中落地 lane 和 contract
- [x] 明确 browser/eval 为 optional contract
- **Status:** complete

### Phase 3: Verification and integration
- [x] 运行 focused docs/render verification
- [x] 运行 `npm run verify`、`./scripts/harness verify --output=stdout`、`./scripts/harness doctor --check-only`
- [ ] 提交 `v1.5` 实现与验证记录
- [ ] merge back 到本地 `dev` 并 push `origin/dev`
- **Status:** in_progress

### Phase 4: Closeout
- [x] 关闭并归档 `readme-slim-pr`
- [ ] 更新 roadmap 总控记录
- [ ] 关闭并归档 `roadmap-v1.5-workflow-productization`
- **Status:** pending

## Finishing Criteria

- README 与 supporting docs 清晰暴露 workflow lanes，而不是只列底层命令与治理约束。
- optional browser/eval contracts 有明确入口和边界，不会被误读为内建强依赖。
- `readme-slim-pr` 被正式关闭归档。
- `dev` 和 `origin/dev` 包含 `v1.5` 文档与记录链路。
