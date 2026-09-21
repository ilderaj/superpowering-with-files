# 实施与后续验收

2026-09-21。本轮迁移权威为planning/active/project-isolation-adoption-20260921/三文件；下表是交付计划投影，不新增任务权威。

| 切片 | 票 | 本轮结果 / 下一步 |
|---|---|---|
| Project结构、全量迁移、自动intake与旧绑定兼容 | SUP-52 | 本轮实施验收：51原票归属迁移，新增1张实际验收票；7绑定/48任务marker、guard、同UUID重放 |
| 目标校验后续接线验收 | SUP-25（LMP-03） | 今晚已有Todo+agent-ready+nightly。复用已实现helper；首片≤20分钟补充预检后目标移动、真实caller写后回读与恢复证据；不得重新造schema或仅凭本报告宣告完成 |
| 新产品Project bootstrap恢复 | SUP-26（LMP-04） | 依赖SUP-25；补故障注入、创建回包丢失后复用和setup-needed恢复。现有48issue重放不等于全新repo bootstrap实测 |
| 标签/状态与direct intake契约验收 | SUP-27/28 | 采用当前project-first规范和In Review语义；补剩余跨入口覆盖与授权负例，不重写已采纳规则 |
| 仓库互斥 | SUP-29 | 原子锁按Git family，不能按Project；双进程/过期owner测试仍待实现 |
| 同步、Human视图、调度、试点 | SUP-30–34 | 保留现有依赖；统一使用共享Team+独立Project；不再有四Team付费门。SeQure等真实新repo接入须完成各自root/授权/锁及Host触发验收 |

现有night队列4个候选：SUP-49、SUP-25、SUP-19、SUP-20。全局仍3次attempt/45分钟，按实时依赖/优先级/更新时间选取，因此不能承诺一晚做完4个，更不能把全部Roadmap改成ready。后继票仅在前置验收且授权/readiness满足时晋升。下一次既有定时夜班为2026-09-22 01:30 Asia/Shanghai，晨报07:30；不是本轮已经观测到的运行。
