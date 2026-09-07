# C 三方协议素材（虚构，仅用于文档验收，不具法律效力）
## 编辑说明
将下面最终正文制成英文 DOCX。接受 EDIT 中的替换，删除 COMMENT 编辑备注。固定文本不得改写；[VARIABLE] 位置应标黄，仅标变量值。保留 DRAFT 标识。版式由执行者决定，以清楚可读为准。
## 正文
DRAFT
Meridian Tripartite Agreement
This agreement takes effect on [effective_date].
The parties are Northbank Payments Ltd, Meridian Platform Ltd and [merchant_name].
The Merchant is incorporated in England and Wales, company number [company_number], with registered office at [registered_address].
EDIT: replace "The platform permanently bears all refund losses." with "Merchant funds are used first. Any platform shortfall payment is temporary and recoverable from subsequent merchant proceeds."
COMMENT: Commercial discussion only. Remove this editorial comment from the clean copy.
Notices: Northbank [northbank_email]; Meridian [meridian_email]; Merchant [merchant_email].
For Northbank Payments Ltd: signed by [northbank_signer]; signature [northbank_signature]; date [northbank_sign_date].
For Meridian Platform Ltd: signed by [meridian_signer]; signature [meridian_signature]; date [meridian_sign_date].
For [merchant_name]: signed by [merchant_signer]; signature [merchant_signature]; date [merchant_sign_date].
## 配置来源 S2（虚构内部接口资料）
这是 UK 单一模板，主体和 England and Wales 固定；没有 HK 模板。
系统规则：所有 eSign 控件都需要 fieldkey，签名控件必须绑定所属签署方。允许同一字段在多个位置展示。
已确认编码：effectiveDate（yyyy-MM-dd）、merchantName、companyNumber、registeredAddress、merchantEmail、directorName（商户实际授权签署人姓名）、signedByYour（商户签名）、signedByOur（Northbank 签名）。
遗留表把“商户通讯地址”错误地也映射为 jurisdictionOfIncorporation；本协议没有单独的通讯地址控件。不得因此新增正文变量。
Northbank 和 Meridian 的通知邮箱由项目配置人提供，尚未给值。
Meridian 签名、Northbank/Meridian 签署人和三方签署日期的 fieldkey 尚未确认；须列全并标待确认，不能假装存在。
有字段尚待确认时，请仍交付可审阅的完整配置草稿，并清楚列出阻塞实际配置的项。
