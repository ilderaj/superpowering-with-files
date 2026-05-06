# Findings: Roadmap v1.5 Workflow Productization

## Scope Boundaries

- `v1.5` 以文档产品化为主，不新增第二套 planning system，也不引入新的 runtime dependency。
- `v1.4` 已完成实现并推送；唯一剩余外部 gate 是 `post-upstream-automation-followups` 的 scheduled run 观察，不阻塞 `v1.5`。
- `readme-slim-pr` 的 PR #29 已 merged，因此本轮重点不是重写 README，而是吸收并收口这次 README 精简结果。

## Known Inputs

- Roadmap source: `docs/roadmap.md`
- Master execution companion: `docs/superpowers/plans/2026-05-06-roadmap-implementation-plan.md`
- Related tasks:
  - `planning/active/readme-slim-pr/`
  - `planning/archive/20260506-155702-gstack-harness-comparison-analysis/`
  - `planning/active/roadmap-implementation-plan/`

## Durable Findings

- PR #29 (`readme-slim-pr`) 当前状态为 `MERGED`，所以 `v1.5` 可以直接基于已合并 README 做收口，而不是 cherry-pick 旧分支。
- 当前 README 已经比早期版本更紧凑，但 workflow surface 仍按能力区块展开，尚未显式提升为 operator-facing lanes。
- `gstack` 对比的高价值启发不是“复制其 opinionated skills”，而是把能力组织成用户能直接识别的阶段/车道：
  - `plan`
  - `review`
  - `verify`
  - `finish`
  - `release`
  - `archive`
- browser 和 eval 更适合先作为 contract 文档化：
  - browser contract：local target、action、screenshot、snapshot、result record
  - eval contract：skill input、expected behavior、fixture、target IDE
- 这些 contract 应落在 docs 中，并且明确它们是 optional integration points，而不是 core install prerequisite。
