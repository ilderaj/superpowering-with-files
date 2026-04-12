# Findings & Decisions

## Requirements
- 用户确认 `OthmanAdi/planning-with-files` 是要跟踪的主源。
- 需要把 HarnessTemplate 的 `planning-with-files` upstream source 从 `local-initial-import` 改为 Git source。
- 对话和 planning 内容使用中文；代码、命令、URL 等保持英文。

## Findings
- `harness/upstream/sources.json` 是 `fetchCommand` 读取的实际 upstream source 清单。
- `harness/installer/commands/fetch.mjs` 已支持 `source.type === "git"`，会调用 `stageGitCandidate`。
- `harness/core/skills/index.json` 也记录了 `planning-with-files` 的 `source`，需要同步避免元数据不一致。
- `README.md` 和 `docs/maintenance.md` 仍说明 `planning-with-files` 需要 `--from=/path/to/planning-with-files`。
- `tests/installer/upstream.test.mjs` 和 `tests/installer/upstream-commands.test.mjs` 当前还以 `local-initial-import` 为 fixture/断言。
- `gh repo view OthmanAdi/planning-with-files --json nameWithOwner,url,defaultBranchRef` 确认远端仓库存在，URL 为 `https://github.com/OthmanAdi/planning-with-files`，默认分支为 `master`。
- 修改后 `npm run verify` 通过，32 个测试全部成功。
- `./scripts/harness fetch --source=planning-with-files` 已能从新 Git source 拉取候选更新到 `.harness/upstream-candidates/planning-with-files`，未执行 `update`，未改 vendored baseline。

## Decisions
| Decision | Rationale |
|----------|-----------|
| 使用 `https://github.com/OthmanAdi/planning-with-files` | 用户明确确认这是主源 |
| 保持 `path` 为 `harness/upstream/planning-with-files` | baseline 存放位置不变，只改拉取来源 |
| 更新文档去掉 `--from` | Git source 可由 Actions 独立拉取，不再需要 runner 本地路径 |
| 不更新旧 `docs/superpowers/plans/**` 计划文件 | 这些是历史计划上下文，不是当前源清单或用户维护文档 |

## Resources
- `/Users/jared/HarnessTemplate/harness/upstream/sources.json`
- `/Users/jared/HarnessTemplate/harness/core/skills/index.json`
- `/Users/jared/HarnessTemplate/harness/installer/commands/fetch.mjs`
- `/Users/jared/HarnessTemplate/tests/installer/upstream.test.mjs`
- `/Users/jared/HarnessTemplate/tests/installer/upstream-commands.test.mjs`
- `/Users/jared/HarnessTemplate/README.md`
- `/Users/jared/HarnessTemplate/docs/maintenance.md`
- `/Users/jared/HarnessTemplate/.harness/upstream-candidates/planning-with-files`
- `https://github.com/OthmanAdi/planning-with-files`
