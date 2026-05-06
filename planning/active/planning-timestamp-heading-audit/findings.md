# Findings

## 2026-05-06 初始发现

- 用户观察到当前 planning files 的记录标题仍显示为仅日期，例如“2026-05-06”，缺少具体时间。
- 初步 git 历史已发现相关实现提交：
  - `7b72354 feat: implement UTC+8 timestamp records in planning files and scripts`
  - `096626b feat: close planning records and update status after merging UTC+8 timestamp changes`
- 初步判断需要继续核对“历史实现是否仍在当前有效写入链路中”，尤其是模板、初始化脚本、hook / summary 写入器，以及 skill projection 的实际落点。

## 2026-05-06 15:20:00 UTC+8

- 已确认之前不只是做过 planning，而是已经真正开发并合并过一次：
  - archived task：`planning/archive/20260506-142311-planning-record-time-utc8/`
  - 目标是让新 records 默认包含 `YYYY-MM-DD HH:mm:ss UTC+8`
  - 该任务范围明确写了“**不迁移历史 planning records**”
- 当前代码层面，以下入口已经支持 UTC+8 精确时间：
  - `harness/upstream/planning-with-files/templates/progress.md`
  - `harness/upstream/planning-with-files/templates/findings.md`
  - `harness/upstream/planning-with-files/templates/task_plan.md`
  - `harness/core/upstream-overlays/planning-with-files/templates/*`
  - `harness/upstream/planning-with-files/scripts/init-session.sh`
  - `harness/upstream/planning-with-files/scripts/init-session.ps1`
  - `harness/core/upstream-overlays/planning-with-files/scripts/init-session.sh`
  - `harness/core/upstream-overlays/planning-with-files/scripts/init-session.ps1`
- 现象不一致的核心原因不是“没做过”，而是“只覆盖了部分入口且不迁移历史文件”：
  - `progress.md` 的初始化入口已经程序化写入 `## Session: YYYY-MM-DD HH:mm:ss UTC+8`
  - `findings.md` / `task_plan.md` 主要是模板里写了 record format guidance，但没有统一的强制追加器
  - 许多 planning 文件仍由人工直接编辑，因此仍能继续出现仅日期标题
- 当前仓库确实同时存在两种格式：
  - 新格式示例：`planning/active/post-upstream-automation-followups/progress.md`
  - 旧格式示例：`planning/active/session-summary-mechanism/progress.md`、`planning/active/cross-ide-projection-audit/progress.md`
- 因为上次明确“不迁移历史 records”，所以你现在看到旧日期标题，本身与当时实现边界一致，不是单纯回归。

## 2026-05-06 15:50:00 UTC+8

- 本轮实现不做历史 planning records 迁移；仅收口“今后新增 record”的官方写入链路。
- 共享实现新增为 `planning_record.py`，职责包括：
  - 统一生成 `YYYY-MM-DD HH:mm:ss UTC+8`
  - 按文件类型渲染 heading：
    - `progress` -> `## Session: <timestamp>`
    - `findings` / `task_plan` -> `## <timestamp>`
  - 向指定 planning 文件追加 canonical record block
- `init-session.sh` / `init-session.ps1` 不再各自生成 timestamp，而是改为调用共享 helper，消除 shell / PowerShell 两套时间格式实现漂移。
- 新增官方 CLI：`./scripts/harness record --file <task_plan|findings|progress> [--task <task-id>] [--title <text>]`
  - 这是 Harness 内“新增 planning record”的 canonical 入口。
  - 当存在多个 active tasks 时，强制用户用 `--task` 显式指定，避免写错 planning 目录。
- 为了让后续使用真的收口到新链路，还同步做了两层引导：
  - 在 planning templates 的 record-format 注释里写入 `./scripts/harness record` 用法
  - 在 planning hook 的 `post-tool-use` 提示里，直接提示用 `./scripts/harness record --task <id> --file progress`
