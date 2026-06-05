# 任務計畫：[簡要描述]

## 目標
[用一句話描述最終狀態]

## Routing Decision
- Selected Route: tracked-lean
- Route Reason: 此任務需要持久 planning，但暫時還不需要 deep reasoning。
- Promotion Trigger: none
- Route Evidence Surface: planning + summary

## 目前階段
階段 1

## 各階段

### 階段 1：需求與發現
- [ ] 理解使用者意圖
- [ ] 確定約束條件和需求
- [ ] 將發現記錄到 findings.md
- **狀態：** in_progress

### 階段 2：規劃與結構
- [ ] 確定技術方案
- [ ] 如有需要建立專案結構
- [ ] 記錄決策及理由
- **狀態：** pending

### 階段 3：實作
- [ ] 按計畫逐步執行
- [ ] 先將程式碼寫入檔案再執行
- [ ] 增量測試
- **狀態：** pending

### 階段 4：測試與驗證
- [ ] 驗證所有需求已滿足
- [ ] 將測試結果記錄到 progress.md
- [ ] 修復發現的問題
- **狀態：** pending

### 階段 5：交付
- [ ] 檢查所有輸出檔案
- [ ] 確保交付物完整
- [ ] 交付給使用者
- **狀態：** pending

## Execution Contract
<!--
  WHAT: 僅在任務需要結構化拆解時定義重任務執行單元。
  WHY: 讓執行意圖保留在權威 planning 中，而不是散落在備註或進度 prose 中。
  WHEN: 重型 tracked task 填寫此節；輕任務可以省略或保留為 stub。
-->

### Unit: unit-01
- Kind: implementation
- Status: planned
- Scope:
  - Do: 描述這個執行單元負責的精確交付物
  - Not do: 描述這個執行單元不應吸收的相鄰工作
- Owner Mode: inline
- Allowed Ops:
  - Files: 列出允許觸達的精確檔案或路徑類別
  - Commands: 列出允許執行的精確命令
  - External effects: 除非明確允許，否則寫 none
- Dependencies:
  - 列出依賴的 unit id 或證據引用
- Verification Plan:
  - 列出能證明這個單元成立的精確命令或證據要求
- Return Artifacts:
  - 寫出具體產物名稱，例如 patch、report、note 或 follow-up
- Integration Target:
  - 明確結果要回寫到哪裡，例如 progress.md 或 findings.md
- Exit Criteria:
  - 定義從 done 進入 verified 的精確條件

## 關鍵問題
1. [待回答的問題]
2. [待回答的問題]

## 已做決策
| 決策 | 理由 |
|------|------|
|      |      |

## 遇到的錯誤
| 錯誤 | 嘗試次數 | 解決方案 |
|------|---------|---------|
|      | 1       |         |

## 備註
- 隨著進度更新階段狀態：pending → in_progress → complete
- 做重大決策前重新讀取此計畫（注意力操縱）
- 記錄所有錯誤，避免重複
