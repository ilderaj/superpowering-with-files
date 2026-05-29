# Findings & Decisions

## Findings Record: 2026-05-29 10:09:10 UTC+8

- 当前 Claude Code 命令环境存在显式代理变量：
  - `HTTP_PROXY=http://localhost:63325`
  - `HTTPS_PROXY=http://localhost:63325`
  - `ALL_PROXY=socks5h://localhost:63326`
- 这说明 Claude Code 当前 shell 命令并不是直接出网，而是被路由到本机某个代理/转发器。
- `git remote -v` 显示 remote 是 `https://github.com/ilderaj/superpowering-with-files.git`，因此 `git push` 失败时一定会经过该代理链路。
- `gh auth status -h github.com` 明确显示：当前 `gh` 活跃账户的 keyring token invalid，需要重新 `gh auth login`。
- DNS 检查中，`python socket.gethostbyname()` 对 `github.com`、`api.github.com` 与 `api.anthropic.com` 都失败，说明当前命令环境不能依赖正常系统 DNS/直连，进一步支持“当前会话走受限代理/沙箱链路”的判断。
- 因此当前故障不是单一问题，而是两层叠加：
  1. Git / 网络请求通过受限本地代理，导致访问 GitHub 时出现 `CONNECT tunnel failed, response 403`
  2. `gh` 本地认证 token 已失效，导致即使网络通了，GitHub CLI 仍会报 invalid token / Forbidden

## Findings Record: 2026-05-29 12:10:54 UTC+8

- 用户提供了参考 issue：`https://github.com/farion1231/cc-switch/issues/2016`。
- 本次会话内尝试抓取该 issue 内容时，外部网页读取工具返回的是第三方套餐到期错误，而不是 GitHub issue 内容本身，因此当前没有拿到该 issue 的正文证据。
- 在未读到 issue 正文前，不能严谨地下结论说“就是同一个问题”。
- 但从当前已知症状看，如果那个 issue 讨论的是 Claude Code / cc-switch 会话中的代理注入、localhost proxy、GitHub CONNECT 403、或会话与宿主机网络不一致，那么与你这里的问题高度相似。
- 如果那个 issue 讨论的是单纯 `gh` token 失效、GitHub OAuth 过期、或 CLI keyring 异常，那么它只覆盖了你这里的第二层问题，而不能解释 `git push` 的 `CONNECT tunnel failed, response 403`。

## Comparative Interpretation

- Codex、Copilot、Cursor 没遇到同样问题，最可能的原因不是“GitHub 对 Claude Code 特别封禁”，而是这些工具没有复用当前会话的同一套代理/沙箱/凭据状态。
- 常见差异包括：
  - 它们直接使用宿主机网络，而不是当前 Claude Code shell 中的 localhost 代理
  - 它们使用独立的内置 GitHub OAuth 会话，而不是当前 `gh` keyring 中已经失效的 token
  - 它们的 Git 操作通过 IDE 自己的凭据管理器执行，而不是当前 CLI 会话环境

## Repair Strategy

1. 先修网络出口
   - 关闭或修复把 `localhost:63325/63326` 注入到当前会话的代理程序
   - 或者把 `github.com` / `api.github.com` 加入不走代理的白名单（NO_PROXY）
   - 或者直接在一个不带这些代理变量的新终端里重试 `git push`
2. 再修 GitHub CLI 认证
   - 运行 `gh auth login -h github.com`
   - 或先 `gh auth logout -h github.com -u ilderaj` 再重新登录
3. 如果 git 仍走 HTTPS 且代理持续 403
   - 改用 SSH remote 规避 HTTPS CONNECT 代理：`git@github.com:ilderaj/superpowering-with-files.git`
   - 前提是本机 SSH key 已加到 GitHub

## Decision Log

| Decision | Rationale |
|----------|-----------|
| 先把根因拆成网络和认证两层 | 这样用户不会误以为只修 token 或只修代理就能全部恢复 |
| 优先建议从宿主机终端验证 | 最快区分“Claude Code 会话问题”与“整机网络问题” |
| 把 SSH 作为 git 的最终绕过方案 | 即使公司代理拦 HTTPS CONNECT，SSH 仍可能可用 |
