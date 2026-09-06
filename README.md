# 食品法規適用性儀表板

正式網站由 GitHub Pages 發布：`main /docs`

## 維護方式

任何新增法規、修法更新、分類調整或前端功能修改前，請先閱讀根目錄的 `AGENTS.md`。

- `main`：正式發布版本
- `dev`：修改與驗證版本
- 法規資料：`docs/data/*.json`
- 模組登錄：`docs/data/manifest.json`
- 前端：`docs/index.html`、`docs/css/style.css`、`docs/js/app.js`

詳細維護原則、現行／歷史／未來規則、資料欄位與官方來源查證流程，請見 `AGENTS.md`。

## 衛生管理人員專區

保留原生 HTML／CSS／JavaScript 架構。主頁可切換至「衛生管理人員專區」，標題下方有兩個主要頁籤。法規內容不寫入 HTML 或 JavaScript；`hygiene-manager.json` 仍只負責哪些業者應設置。

新增工具資料登錄在 `manifest.json` 的 `tools.hygieneManager.files`，與原本 `modules` 分開，避免人員資格資料混入現行／歷史／未來法規清單：

- `hygiene-qualifications.json`：第4～7條資格路徑、證照名稱與訓練組合。
- `hygiene-documents.json`：第8條固定文件順序與動態資格證明名稱。
- `hygiene-industries.json`：工廠前提下的 HACCP 產品範圍、資本額與人數情境。
- `hygiene-major-policy.json`：TFDA 相關學類及第6條15項指定高職科別判讀政策。
- `hygiene-majors.json`：教育部114學年度校系、主要學類及高職群科代碼快照。

`js/hygiene-manager.js` 為資料驅動的查詢／文件組合邏輯，`js/hygiene-ui.js` 處理專區互動；`app.js` 共用 manifest 載入及來源。樣式仍使用既有 `style.css` 與 `mobile.css`。

### 法規判讀與範圍

2026-09-06 查核現行全文（108-04-09修正）及115-03-17 HACCP正式公告。第5條現行衛生講習為120小時；第6條為指定高職畢業、同一事業主體相關業務4年以上及60小時訓練，限資本額未達3,000萬元。第7條不是獨立路徑；應實施HACCP者先符合第4條，再加60小時訓練，或指定五種證書加30小時訓練。第5、6條不能單獨代替第4條。每年在職講習不列為首次核備資格證明。

證照欄視為已持有的證照，仍保留不依賴該證照的可選路徑；相關類科高考／普考路徑不由學歷直接判定合格。列表依業別、HACCP門檻情境、資本額及資格類型合併；學歷／證照不重複產生視覺列。點「應備文件」後在右側選擇資格路徑、HACCP訓練方式與具名證照，文件與法源同步更新。考試路徑本身不新增法條沒有的畢業要求；合併呈現不會把不同路徑文件混在一起。資格群組名稱與法源摘要仍存於 qualification JSON 的 resultGroups。

以須辦理工廠登記為前提，肉類、水產須另核對原料含量50%及食品從業人員5人門檻。乳品只適用公告所列乳品；餐盒限公告定義（包含團膳）。跨產品類別及未辨識業別保留待確認情境，不以查無業別推定免實施。複合業別任一公告適用時，仍須實施HACCP。原「應置」模組、歷史及未來資料未改寫。

文件介面依需求統一為「申請書」，第8條原文是「申報書一份」。任職、聘僱或契約文件須滿足第8條契約書影本要求；名稱對照留在維護文件，不在詳細內容顯示；官方來源仍保留。

### 快照更新

目前收錄7,966筆（大專6,356筆、高職與法定科別1,610筆），93個大專學類。資料以114（2025–2026）學年度為基準，非即時招生名單，也未收錄歷年改制或每一系的所有相關細學類；因此不能把查無紀錄當作不符合。學校名稱只協助識別系所。

TFDA表列的是相關科系及所屬學類，不代表整個學類所有系所無條件認定。直接對應第4條列舉方向的學類標示「符合」並保留學籍核對提示；其他表列學類標示「可能符合」。主要學類未列入者標示「需確認」，避免忽略相關細學類。高職以第6條指定科別名稱精確比對；其他科別的「不符合」僅針對第6條，不排除考試路徑。

1. 先讀 `AGENTS.md`、本文件、manifest及涉及JSON，於`dev`作業。
2. 查核 `sources.json` 的現行官方法規、TFDA科系表及教育部分類版本；不將草案當現行法規。
3. 從教育部官方來源下載分類架構、各校科系別學生數、高級中等學校科別資料，分別命名為 `bcode.xlsx`、`students.xlsx`、`vocational.xlsx`，放在專案外暫存目錄。
4. 安裝Python `openpyxl` 後執行 `python scripts/build-major-snapshot.py SOURCE_DIR YYYY-MM-DD`。程式不連網，輸出記錄原檔SHA-256以供追溯。若年度／分類版本變更，同步調整程式與來源 metadata，不只替換輸入檔。
5. 檢查科系／群科代碼、筆數、指定15科完整性與狀態。法定科別通用紀錄不是各校招生證明。
6. 更新專區 `version`、`lastReviewed` 及來源；整站 `lastReviewed` 僅在所有既有法規模組重新校正後更新，避免把專區查核冒充全站重審。
7. 執行測試並檢視桌機／手機版面，在`dev`驗證通過後，以正常merge／fast-forward同步到`main`，禁止盲目force。

### 驗證

- `node --test tests/hygiene-manager.test.cjs`：JSON、manifest、來源引用、ID、現行／未來區分及資格／文件邏輯。
- 安裝Playwright及Chromium後執行 `node tests/browser-smoke.cjs`：六項需求案例、桌機／手機、欄位轉頁、動態文件、CSV、現行／歷史／未來及console／HTTP錯誤。可設 `BROWSER_EXECUTABLE` 指向既有Chromium系瀏覽器，`QA_OUTPUT` 指向截圖輸出目錄。
- 沒有建立第二份手機資料，亦未加入列印／PDF功能。

正式發布仍為 GitHub Pages `main /docs`。應先確認兩分支遠端沒有新變更，保留既有歷史再合併；部署後核對正式頁面的專區版本與manifest。
