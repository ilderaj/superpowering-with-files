## 审计发现

### 2026-05-06

- 本次请求是只读审计分析，不包含任何 lifecycle 变更或 archive move。
- `planning/active/` 下存在较多并行任务，必须先完成目录盘点，再做分组判断。
- 归档 guard 采用显式规则：`Status: closed` 且 `Archive Eligible: yes`。
- 当前已识别到 36 个 task 目录，其中 35 个含完整 planning 文件，1 个目录 `verify-backup-governance-on-dev/` 为空目录，缺少 `task_plan.md`、`findings.md`、`progress.md`。
- lifecycle 分布为：`active/no` 10 个、`waiting_review/no` 8 个、`closed/no` 9 个、`closed/yes` 9 个。
- `closed/yes` 组是高置信 archive 候选；`waiting_review/no` 组大多已完成实施与验证，但仍处于 review gate；`closed/no` 组需要区分“有意保留”与“未完成 archive eligibility 收尾”。

### 2026-05-06 执行与复审更新

- 已按用户要求把 8 个高置信已完成任务的 `Archive Eligible` 从 `no` 翻为 `yes`，未执行 archive move。
- eligibility 已翻转的任务：
  - `align-local-main-with-dev`
  - `audit-pr-41-merge`
  - `cleanup-local-branches-worktrees`
  - `codex-startup-hook-json-fix`
  - `finishing-branch-base-alignment-analysis`
  - `git-execution-authorization-analysis`
  - `planning-record-time-utc8`
  - `verify-worktree-naming-regressions`
- 严格 archive readiness audit 后，适合后续 archive 的 `waiting_review` 任务：
  - `audit-superpowers-plan-sync`
  - `codex-stop-hook-json-analysis`
  - `harness-adoption-governance-plan`
  - `projection-health-analysis`
- 严格 archive readiness audit 后，暂不适合 archive 的 `waiting_review` 任务：
  - `cross-ide-projection-audit`：progress 明确写着未提交 commit，且仍在等待 integration decision
  - `cross-ide-single-source-consolidation`：已开 PR `#22`，仍处于 review / PR gate
  - `readme-slim-pr`：交付路径是 PR，authoritative planning 仍停在 review gate
  - `rename-repo-superpowering-with-files`：planning 内同时存在“PR open”和“已 merged to dev”的相互矛盾记录，需先做 closeout sync
- 严格 archive readiness audit 后，适合后续 archive 的 `closed + yes` 任务：
  - `backup-skills-duplicate-analysis`
  - `companion-plan-sync-constraints`
  - `copilot-global-safety-adoption`
  - `copilot-pretool-guard-regression-fix`
  - `copilot-usage-billing-impact-analysis`
  - `github-actions-upstream-automation-analysis`
  - `align-local-main-with-dev`
  - `audit-pr-41-merge`
  - `cleanup-local-branches-worktrees`
  - `codex-startup-hook-json-fix`
  - `finishing-branch-base-alignment-analysis`
  - `git-execution-authorization-analysis`
  - `planning-record-time-utc8`
  - `verify-worktree-naming-regressions`
- 严格 archive readiness audit 后，暂不适合 archive 的 `closed + yes` 任务：
  - `companion-plan-warning-governance`：progress 仍保留 “提交并推送本轮修复” 的 next step，closeout 语义未完全收口
  - `session-summary-mechanism`：close reason 写的是 `ready for push`，notes / progress 仍保留 waiting integration 语义
  - `worktree-naming-governance`：companion summary 与 progress 仍写 `push in progress` / `Push dev to origin`
- 已新建 follow-up 汇总项目 `planning/active/active-followup-consolidation/`，承接此前建议保持 `active` 的任务，不改动原 task lifecycle。

### 2026-05-06 archive 执行结果

- 已先将 4 个 archive-ready `waiting_review` 任务收口为 `closed + yes`：
  - `audit-superpowers-plan-sync`
  - `codex-stop-hook-json-analysis`
  - `harness-adoption-governance-plan`
  - `projection-health-analysis`
- 已成功 archive 的任务共 18 个：
  - `audit-superpowers-plan-sync`
  - `codex-stop-hook-json-analysis`
  - `harness-adoption-governance-plan`
  - `projection-health-analysis`
  - `backup-skills-duplicate-analysis`
  - `companion-plan-sync-constraints`
  - `copilot-global-safety-adoption`
  - `copilot-pretool-guard-regression-fix`
  - `copilot-usage-billing-impact-analysis`
  - `github-actions-upstream-automation-analysis`
  - `align-local-main-with-dev`
  - `audit-pr-41-merge`
  - `cleanup-local-branches-worktrees`
  - `codex-startup-hook-json-fix`
  - `finishing-branch-base-alignment-analysis`
  - `git-execution-authorization-analysis`
  - `planning-record-time-utc8`
  - `verify-worktree-naming-regressions`
- archive 过程中发现 5 个 companion-sync 元数据问题，并已在归档前修复：
  - `backup-skills-duplicate-analysis`
  - `copilot-pretool-guard-regression-fix`
  - `copilot-usage-billing-impact-analysis`
  - `github-actions-upstream-automation-analysis`
  - `git-execution-authorization-analysis`
- `codex-stop-hook-json-analysis` 另有 1 次 close-task gate 失败，原因是 companion plan 缺少 plain `Lifecycle state` / `Sync-back status` 字段，已补齐后成功 close + archive。
