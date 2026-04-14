# TypeMint Skill 重复候选排查记录

## 当前观察

- `TypeMint` 项目自身声明的 canonical skills 主源是 `.agents/skills/`，不是 `.codex/skills/`。
- `TypeMint/.agents/skills/skills-manifest.json` 中只登记了项目自己的 iOS/ASC 相关 skills，没有 `using-superpowers`、`using-git-worktrees`、`requesting-code-review`、`systematic-debugging`。
- `TypeMint/.codex/skills/` 里只有 `openspec-*` 四个技能，也没有上述 harness skills。

## 新确认事实

- HarnessTemplate 当前 README 仍把 Codex 的 skill root 写成：
  - workspace: `.codex/skills`
  - user-global: `~/.codex/skills`
- 仓库内既有一份 upstream superpowers 源目录：
  - `/Users/jared/HarnessTemplate/harness/upstream/superpowers/skills/...`
- 同时用户级 `~/.codex/skills/using-superpowers` 等目录又是 symlink，直接指向这份 upstream 源目录。
- 这些 symlink 与目标文件是同一个 inode，不是两份实际副本。

## 初步判断

- 重复候选不是因为 `TypeMint` 本地又安装了一套 superpowers skills。
- 更像是同一份 skill 同时被两个发现来源收集：
  - 一个来源看到的是用户级安装路径 `~/.codex/skills/<skill>`
  - 另一个来源看到的是 symlink 解析后的真实路径 `/Users/jared/HarnessTemplate/harness/upstream/superpowers/skills/<skill>`
- 因为展示层没有按“规范化真实路径”或“skill name + resolved path”做去重，所以 UI 中出现了两条完全同名候选。

## 为什么查询结果不一致

- `TypeMint` 本地治理与清单体系认的是 `.agents/skills/`，因此你手动查询项目 skills 时，只会看到 repo 侧 `.agents/skills` 中登记的内容。
- 但 Harness/Codex 当前对 superpowers 的实际用户级投影仍在 `~/.codex/skills`。
- 于是“项目侧查询”与“Codex slash 候选列表”实际上在看两套不同来源：前者偏 `.agents`/manifest，后者至少包含 `.codex` 用户级投影，而且很可能还叠加了 symlink 解析后的真实目录。

## 结论

- 这是“发现路径不一致 + symlink 未规范化去重”的问题，不是单纯的“skills 被装了两次”。
- 当前最可疑的重复链路，在你这次现象里更偏向 Copilot：
  - `~/.copilot/skills/<skill>` 的 symlink 路径
  - `/Users/jared/HarnessTemplate/harness/upstream/superpowers/skills/<skill>` 的真实路径
- 进一步核对后，应把结论收窄为：
  - 不是 `TypeMint` 这种已有 workspace 特有的问题；
  - 也不是“Harness 单独安装后，所有客户端都会重复”；
  - 而是 **Harness 当前对 Copilot 的 superpowers 投影策略 + Copilot 自身候选发现/去重行为** 的交互问题。
- 证据链：
  - `TypeMint` 当前没有 `.github/skills`，说明不是 workspace 里又装了一套 Copilot skills。
  - `~/.copilot/skills/using-superpowers` 等路径实际存在，并且都是指向 HarnessTemplate upstream superpowers 源目录的 symlink。
  - Harness skill index 明确把 `superpowers` 对 Copilot 的 projection 也定义为 `link`，不是 Codex 专属策略。
- 因此：
  - 对 Copilot 来说，只要使用当前这套 HarnessTemplate 并保留默认 `link` 投影，就具备触发重复候选的前提；
  - 对 Codex 来说，虽然 Harness 也用了同类 symlink 投影，但 Codex 当前显然没有把它重复展示出来，说明 Codex 侧 discovery/dedupe 行为不同。
- `TypeMint` 这个已有 workspace 仍然只是放大了“查询结果”和“候选展示”不一致的问题：
  - 项目治理主源是 `.agents/skills`
  - Copilot 当前实际加载到的是 `~/.copilot/skills`
  - 所以你手动查项目 skills 时不会看到 superpowers，但 Copilot slash UI 仍会给出候选
