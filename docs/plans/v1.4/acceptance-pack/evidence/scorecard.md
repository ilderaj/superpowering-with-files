# V1.4 四任务 Chief 评分

评分使用 `reviewer.md` 的必需检查组，保留首轮失败或阻塞，不以总分抵消缺陷。

| 案例 | 首轮 | 最终 | 处理 |
| --- | --- | --- | --- |
| A / O1 / W1 产品决策 | 5/5 pass | 5/5 pass | 内容接受，无重跑 |
| B / O2 / W2 模板周报 | 5/5 pass | 5/5 pass | 内容接受，无重跑 |
| C / O3 三方协议 | 6/7 fail | 7/7 pass | 一次有界修复，补取值来源和责任人证据 |
| D / D1 / W3 设计交接 | 4/5 blocked | 5/5 pass | Chief 本地浏览器补证，产物未改 |

首轮 20/22 组通过，最终 22/22 组通过。这是受控能力与 Host 可见交付验收，不是生产成功率、业务批准或模型胜率。

## 关键边界

- A/B 的合成输入保留来源、冲突、待确认和模板个人填写区；未知项没有被补成事实。
- C 保留固定正文、17 个标黄位置、16 个变量、8 个已知 key 和 8 个 pending key；原始 DOCX 与 native evidence 未被替换。
- D 的四态、重试、金额格式和已有详情入口已在本地 HTTP 预览中复核；mock 预览不代表真实后端。
- O4 单独使用真实授权 automation，六项 live gate 均为 yes，并有 Host turn 和用户任务可见回读。

Chief 接受范围：O1/O2/O3/D1 受控语义结果、O4 live evidence、W1/W2/W3 用户任务可见交付，以及本仓库的 source/package/install/native/core 回归。受控输入不扩大为生产普适性结论。
