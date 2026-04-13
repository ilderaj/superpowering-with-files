# 发现记录：发布 GitHub Release 1.0.1

## 已确认事实
- 当前本地工作分支是 `dev`，但用户明确要求基于 `origin/main` 发布。
- `git fetch origin main --tags --prune` 后，`origin/main` 指向 `6dc4478b2b01c351c8ae909a173e742d336454b7`。
- 现有 `1.0.*` tag 只有 `1.0.0`。
- `gh release view 1.0.1` 返回 `release not found`，说明 release 尚不存在。
- `1.0.0..origin/main` 的主要变更集中在跨 IDE 安装文档、hook 投影、skill 投影同步、健康检查和相关测试。
- `HEAD..origin/main` 内容 diff 为空；当前 `dev` 工作树内容与 `origin/main` merge commit 内容一致。
- `npm run verify` 通过：74 个测试通过，0 个失败。
- GitHub Release `1.0.1` 已创建，URL 为 `https://github.com/ilderaj/HarnessTemplate/releases/tag/1.0.1`。
- 本地 tag `1.0.1` 指向 `6dc4478b2b01c351c8ae909a173e742d336454b7`，与发布目标一致。

## 风险与约束
- 本地当前分支不是发布基准；所有发布命令必须显式使用目标提交 SHA。
- 不运行 frontend dev/build/start/serve 命令；本任务不需要前端运行态验证。
- `gh release view` 不支持 `isLatest` JSON 字段；最终验证改用支持字段 `tagName,url,targetCommitish,isDraft,isPrerelease,body,publishedAt`。
