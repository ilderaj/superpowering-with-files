# Findings: Git Execution And Authorization Analysis

## Verified Findings

- 当前仓库 `.harness/state.json` 记录的是 `policyProfile: "always-on-core"`、`hookMode: "off"`、`scope: "user-global"`。因此 safety hook 在当前实例里默认并未投影为实际生效的 Copilot/Codex/Cursor/Claude hook。
- `harness/installer/commands/install.mjs` 默认会在 `policyProfile` 为 `safety` / `cloud-safe` 时把 `hookMode` 设为 `on`；否则默认 `off`。也就是说 safety gate 是 opt-in，不是默认开启。
- `harness/installer/lib/hook-projection.mjs` 表明：只要 `hookMode === "on"`，就会投影 planning hooks；而 safety hook 还额外要求 `policyProfile` 属于 `safety` / `cloud-safe`。
- `harness/core/hooks/safety/scripts/pretool-guard.sh` 的硬控制对象是“危险命令”，不是所有 git 操作。safe allow-list 明确包含 `git status/diff/show/log/branch/rev-parse/ls-files/fetch`。
- 对危险命令，当前 hook 只在三类场景给出强约束：
	- 保护路径或工作目录：`deny`
	- 主 checkout 的 `dev` 分支上执行 `git reset --hard`：`deny`
	- 危险命令缺失 upstream branch 或缺失非空 `## Risk Assessment`：`ask`
- `git commit` 与普通 `git push` 目前不在 repo 自己的 `dangerous-patterns` / hook 专项分支里，没有专门的 `deny`/`ask` 逻辑；是否需要人工确认主要不由这段 repo-owned hook 直接决定。
- `verification-before-completion` 与 `requesting-code-review` 负责“完成前要验证 / 可请求 code review”，但它们是流程技能，不是自动执行器，也不会自动替你发起 push 或 PR。
- `using-git-worktrees`、`finishing-a-development-branch`、`safe-bypass-flow`、`docs/release.md`、`docs/safety/vibe-coding-safety-manual.md` 一致把推荐路径定义为：先 worktree/branch 隔离，验证，再 push 远端，最后 merge/cleanup。
- `harness/installer/lib/git-base.mjs` 与 `worktree-preflight.mjs` 把当前非 trunk 分支（本仓库通常是 `dev`）视为默认 base，并要求把 `Worktree base: <ref> @ <sha>` 记入 planning。
- PR 方面，本仓库没有 repo-owned 的自动 PR orchestration。当前看到的 PR 路径主要还是 upstream superpowers `finishing-a-development-branch` 中的 `git push` + `gh pr create` 工作流示例。
- 文档层有一个可见缺口：`docs/compatibility/hooks.md` 仍主要描述 planning / superpowers hooks 支持矩阵，没有同步纳入新 safety hook 的支持矩阵；但代码中的 `hook-projection.mjs` 已经支持对四个平台投影 safety hooks。

## Open Threads

- “每次 push 都要 human approve” 在你的实际使用里，究竟来自 VS Code/Copilot 运行时工具授权，还是来自某套外部 IDE 安全设置，需要与 repo 内逻辑分开看待。
- 如果要支持“自主 verify + commit + push”，需要决定这是只对 sacrificial worktree / 非 trunk branch 开放，还是对主 checkout 也开放。

## Recommended Implementation Scope

- v1 只实现 repo-owned `checkpoint-push` orchestration：`verify + deterministic review evidence + commit + push`。
- v1 把自动 push 限定在 worktree / 非 trunk / 非 main-checkout `dev` 分支；不把主 checkout 直接纳入自动 push 范围。
- v1 不做 PR automation，不做 merge automation，也不尝试覆盖 host-level approval prompts。
- v1 用 deterministic review artifact 取代“CLI 内嵌 LLM code review”，把真正的 model-driven review 继续留在 agent workflow 层。