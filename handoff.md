# 交接文件：學習 Matt Pocock skills（飲食控制 App 練習）

## 我是誰、目標是什麼
- 程式新手，未來想寫程式，想完整學會 Matt Pocock 這套 skill 的使用流程
- 練習專案：飲食控制 App（拍照自動估算熱量、蛋白質、蔬菜份數，手動記錄喝水量，每日看有沒有達標）
- 請用繁體中文和我溝通，專有名詞保留英文並附中文解釋
- 每一步請解釋「為什麼這樣做」，讓我學到背後的思路

## 專案連結
- Repo（公開）：https://github.com/jackering0820/diet-tracker
- 正式網址（GitHub Pages，`main` 合併後自動部署）：https://jackering0820.github.io/diet-tracker/
- 規格書：[#1](https://github.com/jackering0820/diet-tracker/issues/1)（parent issue，刻意保持 open；要不要關由我決定）
- App 的所有決定：`decisions.md`

## 背景知識（先前已經學過的）
- Skills repo：https://github.com/mattpocock/skills（`claude-plugins-official` marketplace，1.2.3 版，user scope）
- 主流程：`grill-me` / `grill-with-docs`（釐清需求）→ `to-spec`（寫規格，不含程式碼）→ `to-tickets`（按使用者功能拆任務）→ `implement`（內含 `tdd`）→ `code-review` → 定期 `improve-codebase-architecture`
- 參考影片：Gary Chen〈700 萬人下載的 /grill-me，Matt Pocock 到底寫了什麼？〉https://www.youtube.com/watch?v=aR97E7aKEgg
- `setup-matt-pocock-skills`、`to-spec` 等 skill 設定成只能由我手動輸入 `/指令` 啟動

## 已完成

### 2026-10-11：需求
- [x] 安裝 mattpocock-skills
- [x] 用 `/grill-me` 拷問 App 的想法（4 輪、20 題），決策整理在 `decisions.md`
- [x] 建立 Anthropic 帳號、儲值 5 美元、每月花費上限 5 美元、建立 API key（只存在我自己這裡）

### 2026-10-11～14：從規格到第一版完成
- [x] `/setup-matt-pocock-skills`：issue tracker 用 **GitHub Issues**、預設 5 個 triage 標籤、single-context 領域文件；設定寫在 `CLAUDE.md` 和 `docs/agents/`
- [x] 初始化 git、安裝 `gh`（GitHub CLI）並登入、建立公開 repo、開啟 GitHub Pages
- [x] `/to-spec` → [#1 規格書](https://github.com/jackering0820/diet-tracker/issues/1)（55 條 user stories），seam 定為「**日記核心（Diary Core）的公開操作**」
- [x] `/to-tickets` → 8 張垂直切片的票，用 GitHub 內建的 blocked-by 關係串起來
- [x] 8 張票全部用 `/implement` 完成（每張都是：開分支 → TDD → 瀏覽器手動測試 → `code-review` 兩軸審查 → 修正 → PR → 合併）

| 票 | 功能 | PR | 測試數（累計） |
|---|---|---|---|
| [#2](https://github.com/jackering0820/diet-tracker/issues/2) | 喝水紀錄（曳光彈：打通三層架構、PWA、部署） | [#10](https://github.com/jackering0820/diet-tracker/pull/10) | 5 |
| [#3](https://github.com/jackering0820/diet-tracker/issues/3) | 手動記一餐（草稿、逐項編輯、即時總數） | [#11](https://github.com/jackering0820/diet-tracker/pull/11) | 16 |
| [#4](https://github.com/jackering0820/diet-tracker/issues/4) | 每日目標與今日達標進度 | [#12](https://github.com/jackering0820/diet-tracker/pull/12) | 25 |
| [#5](https://github.com/jackering0820/diet-tracker/issues/5) | 歷史與補記、修改日期時間 | [#13](https://github.com/jackering0820/diet-tracker/pull/13) | 33 |
| [#6](https://github.com/jackering0820/diet-tracker/issues/6) | API 金鑰與模型設定 | [#14](https://github.com/jackering0820/diet-tracker/pull/14) | 40 |
| [#7](https://github.com/jackering0820/diet-tracker/issues/7) | 拍照分析一餐（第一次真正呼叫 Claude API） | [#15](https://github.com/jackering0820/diet-tracker/pull/15) | 47 |
| [#8](https://github.com/jackering0820/diet-tracker/issues/8) | AI 錯誤處理（6 種錯誤各自的訊息和選項） | [#16](https://github.com/jackering0820/diet-tracker/pull/16) | 58 |
| [#9](https://github.com/jackering0820/diet-tracker/issues/9) | 匯出／匯入備份、定期備份提醒 | [#17](https://github.com/jackering0820/diet-tracker/pull/17) | 63 |

## 開發過程中我做的決定（不在 `decisions.md` 裡的）
- 熱量目標是**上限**，蛋白質、蔬菜、喝水是**下限**
- 餐別預設時間：04:00–10:29 早餐、10:30–14:29 午餐、14:30–16:59 點心、17:00–21:29 晚餐、其他點心
- 達標判斷**用顯示出來的數字**（畫面寫「1800 / 1800」就一定是達標）
- 營養數字顯示：熱量和喝水取整數，其他取到小數點後一位（整數也顯示「2.0」）
- 一整天沒有任何紀錄時顯示「**無紀錄**」，今天畫面和歷史列表一致
- 沒有食物的一餐不能存、食物名稱不能空白、空白的數字欄位當作 0
- 修改目標後，過去的日子也用新目標重新判斷（只有一組目標）
- 備份**整份取代**、不是合併；API 金鑰和模型設定在匯入後保留，不放進備份
- 儲存目標或 AI 設定後，設定視窗不自動關閉，顯示「✓ 已儲存」

## 還沒在 iPhone 上確認的事（請優先做）
- [ ] #3～#9 的新功能都還沒在 iPhone 上實測（#2 喝水已確認正常）
- [ ] 在設定頁貼上**真的** API 金鑰，拍一餐試試 AI 分析（金鑰只在手機上操作，**絕對不要貼進對話**）
- [ ] 備份：分享選單 →「儲存到檔案」→ 從「檔案」匯入 → 關閉設定後畫面正常
- [ ] 按分享選單的「取消」後，今天畫面的備份提醒應該還在
- [ ] 加入主畫面後離線打開（飛航模式）
- [ ] **待觀察**：文件寫額度用完是 HTTP 402。如果哪天用到每月 5 美元上限，卻看到「分析失敗（錯誤代碼 400）」，要回報，補上分類

## 延後處理的項目（code review 提過、刻意先不做）
**程式碼整理（smell）**
- 「一天」用 `"YYYY-MM-DD"` 字串表示（Primitive Obsession），`from`／`to` 總是一起傳（Data Clumps）
- 兩個儲存轉接器的介面說明註解重複；`count`、`listAll`、`get` 的寫法很像
- `sw.js` 的快取清單要手動維護：**每新增一個檔案都要加進去，並把 `CACHE` 版本號加 1**
- 餐別直接用「早餐」等中文字儲存，以後想改顯示名稱要處理舊資料
- 「熱量、蛋白質…」的名稱、狀態對照表散在好幾個檔案
- `mealRow`／`itemRow` 建立列表的寫法重複；表單讀數字的寫法在兩個檔案重複
- 編輯視窗的 `setAnalysisState` 有 6 個選項，可以整理成一個「分析狀態」
- 儲存轉接器的整批寫入用 `"clear"`、`"put"` 字串區分

**功能與效能**
- 今天畫面的縮圖直接用 1024 像素的原圖顯示，資料多了會變重；可以另外產生小縮圖
- 照片很多時，備份檔很大，iPhone 匯出／匯入可能記憶體不足
- 沒有金鑰時是顯示「前往設定」按鈕，不是自動打開設定頁
- 可以把紀錄改到未來的時間（沒有檢查）
- 本機開發判斷沒有包含 `[::1]` 和 `*.localhost`

## 之後可以改進的地方
- **加 GitHub Actions（CI）**：每次推送自動跑 `npm test`，PR 上就會有檢查結果
- **跑 `/improve-codebase-architecture`**：把上面「延後處理」的 smell 一次整理（流程的最後一步，還沒用過）
- **補 `CONTEXT.md`（名詞表）**：例如「日記核心」「草稿」「無紀錄」「曳光彈」，之後可以用 `/grill-with-docs` 或 `domain-modeling` 建立
- **AI 費用控制**：目前沒設定 `effort`（思考深度）；可以試試調低，比較準確度和費用；或預設改用 Haiku 5.5
- **第一版刻意不做的功能**（見 `decisions.md`）：提醒通知、趨勢圖表、依身高體重計算目標、多人使用
- 可能的新功能：常吃的食物一鍵加入、一天的營養分配圖、匯出成 CSV

## 開發環境備忘
- 執行測試：`npm test`（Node.js 22 以上，不用安裝任何套件）
- 本機開啟：`npm start` → http://localhost:8787
  - **不用 8080**：電腦上的 Steam 佔用了 `127.0.0.1:8080`
  - `localhost` 上不啟用 service worker（內建瀏覽器的 service worker 連不到本機伺服器，會一直拿到舊檔案）；離線功能要在正式網址測試
- `gh` 安裝在 `C:\Program Files\GitHub CLI\`，已登入 `jackering0820`
- 每張票的流程：`main` 開分支 `issue-N-xxx` → `/implement #N` → code review → 修正 → PR（內文寫 `Closes #N`，合併時自動關閉 issue）→ 合併 → GitHub Pages 自動更新 → iPhone 上「完全關掉 App 再打開」就會換成新版

## 這次學到的重點
- **TDD**：先看到紅燈才寫程式；測試一寫就通過時，**故意把程式改壞**，確認測試真的抓得到；改壞的方式要真的造成問題才算數
- **seam 越少越高越好**：只透過日記核心的公開操作測試，重構內部時測試不會壞
- **業務規則放在核心**：畫面只負責顯示（審查時反覆抓到規則漏到畫面層）
- **三種檢查各有所長**：自動測試抓想得到的情況、手動測試抓使用感受、code review 抓沒想到的情況（例如連按兩次、非同步的時序問題）
- **手動測試要模擬真實使用**：iPhone 拍照一次只能一張，用電腦一次選多張就測不出「不能追加照片」
- **結果不合理時先懷疑測試本身**：截圖拍太早、重複使用同一份檔案清單、瀏覽器沒有在繪製畫面，都曾讓 App 看起來壞掉
- **安全**：金鑰只在核心內部使用、錯誤訊息不包含金鑰或 API 原始訊息、備份用「挑選欄位」（白名單）而不是「全部倒出來再刪」
- **先讀文件再寫 API 程式**：API 格式會改，不要憑記憶寫

## 注意事項
- **絕對不要**要求我把 API key 貼進對話
- 不確定下一步該用哪個 skill 時，可以用 `ask-matt`
