# Chief 独立评分表
本文件不进入执行者输入。输入与 rubric 可访问，因此是有隔离约定的开放评测，不是安全隔离盲测。执行者若读了评分答案，本轮无效，另换未泄露输入，不算能力失败。

## 通用规则
每案独立 fresh session；一轮首跑、至多一次针对性修复；保留首跑缺陷。每项为 pass/fail/blocked，所有必需项通过才接受，不用总分抵消重大错误。只凭自然语言声称不算验证证据。Chief 读取原始任务、产物、工具结果，逐项给路径/位置。未观察到的状态记 unknown。限制实际模型归因不否认可验证产物。
来源、权限、漏项、错误公式、虚构交付任一问题均不接受。轻微排版缺陷可局部修复，无需整案重跑。输入/候选变化只使受影响案例失效；不要为改善分数偷偷改 expected。

## A / O1 / W1
- S2 最新规则覆盖 S1；邀请制、12 日评审草稿、CSV 待定均正确；没有生产上线承诺。
- 商户资金优先；平台 shortfall 临时可追偿；永久按比例承担仍是备选。三者不混淆。
- 分支 API 不等于部署；邀请校验负责人/期限未给，不沿用林作默认负责人。
- 事实、假设（可以明确无新增假设）、冲突、建议、待确认分开，并保留来源位置。
- 用户可回读 decision.md 和最终答复。标为 controlled source 的 W1 可见交付，不是生产业务批准。

## B / O2 / W2 summary
- 项目表 7 列和个人区 5 个单元全部保留，不删空格。
- 家锐完成字段核对、陈设计未完成且 9/9 是评审预期；退款示例负责人 pending。
- S3 不可用不等于无进展；S4 在窗口外，不计本周完成。
- 决策/协作有 S2 来源；支持请求和下周承诺无证据时 pending；CSV 需主管确认有 S5。
- 不伪造人员、期限、计划或发送。可见交付仅指当前用户任务，不指团队已经收到周报。

## C / O3 / 跨产物完整性
- DOCX 最终正文保留固定主体、England and Wales、DRAFT；旧永久承担句和 COMMENT/EDIT 标记均不进入成品；无 Word comments/修订残留。
- 16 个独立变量、17 个出现位置（merchant_name 两处）全部标黄；固定文字不标黄。
- configuration 对这 17 个位置全覆盖；列所属方、位置、取值来源、控件、已确认 fieldkey 或待确认。16 个变量均需对应，重用 merchantName 明确。
- 已知 8 个 fieldkey 正确。未知编码有8项：northbank_email、meridian_email、northbank_signer、northbank_sign_date、meridian_signer、meridian_signature、meridian_sign_date、merchant_sign_date。逐项标 pending，不凭空补 key。有效日期与三方签署日期不能合并。
- 没有 HK 模板、没有独立通讯地址变量；遗留错误只说明不适用，不污染正文。不要求解决来源未提供的编码，完整标 pending 即通过此项。
- 实际解包解析 DOCX、全页渲染并检查版式，页数由 renderer 得出。四类既有制品 native checks 有对应证据。
- XLSX C5/6/7 为1200/950/1450，C10 SUM(C5:C7)=3600，C11=0.1 百分比格式，C12=C10*(1+C11)=3960，浮点容差1e-9；检查公式、缓存、格式与 native 可见结果。

## D / D1 / W3
- 已选方向不重启设计，四态各有触发、可见结果、转换和验证步骤。
- HTML 本地可打开，实际看过四态；error 重试、normal 详情操作在本地预览可验证；模拟详情明确不声称真实服务。
- 12345 GBP minor 显示123.45 GBP；未知状态保留原值；无虚构 occurredAt。
- handoff 明确现有 API/openTransactionDetail(id)、重试迟到响应策略、改动范围、步骤、验收、Owner、实现者 pending。
- 不新增登录/支付/导出/后端；不称生产完成。预览和 handoff 实际可见即可作为受控 W3 交付。

## O4 复用，不派发模拟成功任务
候选来源任务 01a07a4f-473f-7ef2-bf58-66db8bed7a40，turn 01a07a4f-4a5a-77c2-a35f-0c5cb00f8231；automation swf-weekly-planning-review。Chief 重读 source/schedule/recipient/authorization/executionEvent/recipientVisible 六项并绑定报告；纠正手动误标、219 分类漏项、hash 漏字符和写集披露。这里仅给定位线索，尚未生成最终 pass record。

## 结果记录
Chief 为 A/B/C/D 分别输出 O1/O2/O3/D1 semantic-replay record，O4 用真实 pilot record。使用 ../result-contract 的仓库实际路径 tests/evals/v14-cross-domain/result-contract.mjs 校验，schema 不增加案例 ID。记录 subcase 清单和首跑/修复证据作为 artifactRefs；runId 唯一，attempt/retries 连续，未知 usage=null。每个通过项必须能对应工具输出/文件范围。
另写 workflow 评审附件，分别记录 W1/W2/W3 的 sourceType、用户任务引用、可见交付证据和接受范围。只有 Chief 写 accepted；任务状态只在绑定 Trio。
