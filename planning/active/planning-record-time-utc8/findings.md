# Findings

## 2026-04-30 17:34:10 UTC+8
- 用户痛点：高频迭代时，同一日期内会有多条 findings、progress、task records，仅记录日期不利于串联执行顺序。
- 初始判断：需要检查现有 planning 文件模板、脚本、测试与文档中 records 的生成/示例格式，再决定最小改动面。

## 2026-04-30 17:35:10 UTC+8
- `harness/upstream/planning-with-files/templates/progress.md` 的顶层 session 仍使用 `## Session: [DATE]`，但同一模板里的 `Started` 和 `Error Log` 示例已经暗示需要 timestamp。
- `harness/upstream/planning-with-files/scripts/init-session.sh` 使用 `date +%Y-%m-%d`，PowerShell 版本使用 `Get-Date -Format "yyyy-MM-dd"`，这是初始化时只写日期的直接来源。
- 既有 active/archive planning files 中已经出现 `2026-04-13 21:38 CST`、`2026-04-16 13:38 CST` 等手写时间，说明更细粒度时间符合实际使用方式。
- Hook summary/hot-context 逻辑主要抽取 bullets、phase status、lifecycle 和 progress 最后一条 bullet，不依赖 session heading 必须是纯日期。

## 2026-04-30 17:36:10 UTC+8
- 结论：有必要做。收益是同日多轮 findings/progress/tasks 可按时间串联，成本低，且现有解析逻辑基本不受影响。
- 推荐格式：人读优先的 `YYYY-MM-DD HH:mm:ss UTC+8`。它比 `CST` 更明确，避免 CST 多义性。
- 兼容策略：不迁移历史 planning records；新模板、新初始化脚本、文档示例统一使用新格式即可。
- 风险点：PowerShell `Get-Date` 默认本地时区，若要强制 UTC+8，需要显式转换到 `+08:00`，不能只改 format 字符串。

## 2026-04-30 17:47:18 UTC+8
- 实现采用模板占位符 `[TIMESTAMP]`，初始化脚本生成 `YYYY-MM-DD HH:mm:ss UTC+8` 后替换；同时保留 `[DATE]` 替换作为旧模板兼容兜底。
- PowerShell 使用 `[DateTimeOffset]::UtcNow.ToOffset([TimeSpan]::FromHours(8))` 强制 UTC+8，不依赖运行机器本地时区。
- sync/materialize 不需要额外 patch；修改 upstream planning-with-files 模板后，materialized skill 会自然带上新格式。

## 2026-04-30 17:53:05 UTC+8
- 用户显式指定基线为 `dev`，因此 finishing 阶段直接按 `dev` 作为合并目标执行，而不是再推断 worktree base。
- 当前功能分支 `readme-slim-pr` 相对 `dev` 是 `ahead 1 / behind 1`：`dev` 上已有更早的 PR merge commit，因此这次回并生成了新的 merge commit，而不是 fast-forward。
- merge 后最新提交为 `9ea8b6d`，已同步到 `origin/dev`。

