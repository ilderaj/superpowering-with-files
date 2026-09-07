# D 已选定设计和接口（合成验收项目）
## S1 Owner 选定范围
实现交接对象：Sol 或 Luna。页面：商户交易只读列表。桌面 1280px，白底、深色正文，主色 #2457C5。禁止新增登录、支付、导出、后端改动或宣称上线。
四态：loading 骨架；empty 显示暂无交易；error 显示加载失败与重试按钮；normal 显示列表。
正常列表列：交易号、金额、币种、状态。点击行使用已有详情入口。四态设计已选定，不再征集方向。
## S2 现有接口
GET /transactions -> {items: [{id: string, amountMinor: integer, currency: string, status: string}]}。
本次支持 GBP，minor unit 为 2。示例 id=T100, amountMinor=12345, currency=GBP, status=settled。
空列表 items=[]；非 2xx 进入错误态。未知状态显示原值，不发明枚举。
已有 openTransactionDetail(id) 回调。API 未提供 occurredAt，不得补造日期列或时间数据。
请求重试重新获取列表；防止迟到响应覆盖最新请求结果。不存在分页需求。
## S3 交接约束
Owner 为家锐；实现者由 Owner 分配，尚未确定。测试可用本地 mock 明确标记测试数据；不要连接任何生产系统。请交付浏览器可打开的单文件 HTML 四态预览，以及实现和测试交接文档。这个任务交付设计预览与说明，不实施生产页面。
