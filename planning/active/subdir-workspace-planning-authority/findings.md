# Findings & Decisions

## Requirements
- 用户希望在大型项目的子目录打开 workspace，缩小 IDE/agent 读取的上下文范围。
- 即使从子目录启动，也希望继续使用仓库根目录统一的 planning files，而不是让 planning 散落在多个子目录。
- 当前阶段只需要需求分析、可行性判断与执行方案，不直接实现。

## Research Findings
- 当前仓库把 `planning/active/<task-id>/` 定义为唯一 authoritative durable task memory。
- 多个 CLI 命令直接使用 `process.cwd()` 作为 `rootDir`，这会把“当前打开的子目录”误当成 planning authority root。
- planning hook 虽然支持 `HARNESS_PROJECT_ROOT`，但默认 fallback 仍是 `pwd`，说明 hook 层缺少稳定的上溯 authority root 解析。
- runtime/MCP 层已经有 `resolveHarnessRoot()`，说明“调用根”和“实际 authority root”解耦在架构上是可行的，但还没有横向推广到 CLI/planning/hook 入口。
- 仓库既有设计已经接受“host-managed workspace identity”和“repo-owned durable task identity”可以分离；`worktree-name` 治理文档明确强调不要让 host workspace 模型决定 durable identity。
- 这说明子目录 workspace 方案不应复制 planning，而应把 `planning/active/<task-id>/` 继续留在 authority root，并通过统一 root resolver 访问。
- `.harness/` 已经是本仓库承载本地 runtime state 的标准位置，且默认被 `.gitignore` 忽略；因此若未来真的需要 leaf override file，可以放在 `.harness/` 下而不污染版本控制。
- 用户已明确选择把显式 override file 一并纳入首版，因此需要把 `.harness/authority-root.json` 变成正式支持的 root 解析输入，而不是仅保留为后续增强设想。

## Technical Decisions
| Decision | Rationale |
|----------|-----------|
| 将问题建模为“workspace scope”和“planning authority root”未解耦 | 这样可以统一解释 CLI、hook、MCP、IDE 子目录打开时的失配现象 |
| 优先寻找统一 root resolution 策略，而不是接受 planning 多处分散 | 当前产品定位明确要求 `planning/active/<task-id>/` authoritative，分散会破坏 durable memory 契约 |
| 推荐方案采用混合解析链：显式 `--root` / `HARNESS_PROJECT_ROOT` / leaf workspace pointer > git top-level > cwd fallback | 兼顾确定性、monorepo 特例与现有项目的零配置体验 |
| 不推荐用 symlink 或在每个子目录复制 planning 文件 | 看似省事，但会制造路径歧义、误写风险与多处状态漂移 |
| 默认 root 边界应以 git top-level 为准；repo 外层的 marker / override 不应再参与默认发现 | 这样才能避免 authority root 漂到用户上层目录，并与“当前 git worktree 才是默认项目边界”的直觉保持一致 |
| 推荐把首版自动发现顺序收敛为：显式输入 > 环境变量 > `.harness/authority-root.json`（限 git root 内）> git top-level > 非 git 场景下的 ancestor marker > cwd | 兼顾显式 linked leaf workspace、repo 内零配置，以及非 git fixture/轻量目录的 fallback 能力 |
| 推荐先把 planning-critical CLI、hooks、runtime/MCP 打通，再处理 install/sync 等 workspace-mutating 命令 | 这样可以先解决“读不到 planning”的核心痛点，同时降低误写路径风险 |
| 推荐增加 `workspace-link` CLI 来写 override file，而不是让用户手写 JSON | 这样可以统一校验、路径规范化与后续迁移能力 |
| shell hook 的 project root 解析收敛到共享 helper，而不是各脚本各自猜测 `pwd` / git root | 这样 task-scoped hook、session checkpoint、safety guard 才能一起遵守同一条 authority-root 解析链 |

## Implementation Findings
- `status` / `doctor` 的首个失败并不是解析逻辑错误，而是临时目录在 macOS 上存在 `/var` 与 `/private/var` 的真实路径差异；测试需要统一做 `realpath` 断言。
- `resource-service` 之前虽然复用了 `status-service` / `summary-service`，但它自己对固定资源文件仍直接回落到 `process.cwd()`，所以 MCP 读资源在 leaf workspace 下仍会偏到子目录。
- upstream `fetch` / `update` 在没有 `.git` 的轻量 fixture 中，需要显式补一个 ancestor marker（如 `scripts/harness`）才能覆盖 authority-root 上溯路径；这也验证了“marker 优先于 git”的设计是必要的。
- 用户 review 指出了一个关键边界：只要 cwd 已经位于 git worktree 内，默认 authority root 就不该继续上溯到 repo 外层目录。这个约束比“命中 marker 即可”更符合预期，也更安全。
- 为了满足这个边界，override file 的祖先搜索也需要受 git root 截断；否则 repo 外层意外存在 `.harness/authority-root.json` 时，仍会发生越界绑定。
- task-scoped hook 的热上下文文案本身不会泄漏绝对 planning 路径，因此 leaf workspace 测试更稳妥的断言方式是看 runtime evidence 里的 `projectRoot` 是否回到 authority root。
- 仓库内 `.artifacts` 型测试夹具在新边界下不能再依赖“默认向上猜根目录”；如果测试想把夹具目录视作独立 authority root，就应该显式设置 `HARNESS_PROJECT_ROOT` 或写 repo-local override，而不是要求 resolver 越过 git 语义去猜。
- 文档层需要同时强调两件事：leaf workspace 只是缩小上下文，不改变 durable task memory 的唯一归属；以及 `workspace-link` 是高级逃生口，不是默认安装步骤。

## Issues Encountered
| Issue | Resolution |
|-------|------------|
| `harness/core/templates/planning/` 下没有三件套模板 | 改为使用 `harness/core/upstream-overlays/planning-with-files/templates/` 作为参考 |

## Resources
- `harness/installer/lib/planning-task.mjs`
- `harness/installer/lib/worktree-name.mjs`
- `harness/installer/lib/plan-locations.mjs`
- `harness/installer/commands/worktree-preflight.mjs`
- `harness/runtime/root-policy.mjs`
- `harness/core/hooks/planning-with-files/scripts/task-scoped-hook.sh`
- `harness/runtime/root-policy.mjs`
- `tests/mcp/root-policy.test.mjs`
- `tests/helpers/harness-fixture.mjs`

## Visual/Browser Findings
- 本任务未使用浏览器或图像输入。
