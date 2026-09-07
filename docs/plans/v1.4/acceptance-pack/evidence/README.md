# V1.4 受控验收结果快照

本目录保存 V1.4 发布时可移植、可审计的受控验收摘要。结果来自四个真实 Host 任务和一个已授权的 SWF automation；合成输入仍标记为 `controlled/synthetic`，不代表生产采用、业务批准或对外发送。

- `results.json`：O1/O2/O3/D1 的首轮与最终记录，以及 O4 的真实 pilot 记录。
- `workflow-results.json`：W1/W2/W3 的交付边界。
- `host-records.json`：任务、turn、可见最终答复和 reviewer 隔离观察。
- `scorecard.md`：Chief 的逐案验收结论和首轮失败/阻塞保留记录。
- `O4-review.md`：O4 六项 live gate 的逐项依据。

本快照使用仓库相对路径和 Codex task 引用，不写入任何执行机器的绝对路径。原始运行产物仍由 Host 保留；本快照不把文件存在、生成或排队状态升级为可见交付。
