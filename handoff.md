# 交接文件：學習 Matt Pocock skills（飲食控制 App 練習）

## 我是誰、目標是什麼
- 程式新手，未來想寫程式，想完整學會 Matt Pocock 這套 skill 的使用流程
- 練習專案：飲食控制 App（拍照自動估算熱量、蛋白質、蔬菜份數，手動記錄喝水量，每日看有沒有達標）
- 請用繁體中文和我溝通，專有名詞保留英文並附中文解釋
- 每一步請解釋「為什麼這樣做」，讓我學到背後的思路

## 背景知識（先前已經學過的）
- Repo：https://github.com/mattpocock/skills
- 主流程：`grill-me` / `grill-with-docs`（釐清需求）→ `to-spec`（寫規格，不含程式碼）→ `to-tickets`（按使用者功能拆任務）→ `implement`（內含 `tdd`）→ `code-review` → 定期 `improve-codebase-architecture`
- 參考影片：Gary Chen〈700 萬人下載的 /grill-me，Matt Pocock 到底寫了什麼？〉https://www.youtube.com/watch?v=aR97E7aKEgg
- 現在 repo 的 `grill-me` 會呼叫 `grilling`：每一輪一次問完所有「目前能問」的問題，每題附建議答案
- `grill-with-docs` = `grilling` + `domain-modeling`，會邊拷問邊寫 `CONTEXT.md`（名詞表）和 `docs/adr/`（ADR，架構決策紀錄）
- `to-spec` 不再提問，只把對話中已確定的內容整理成規格書，並發布到 issue tracker（所以要先跑 setup）

## 已完成（2026-10-11 session）
- [x] 安裝 mattpocock-skills（`claude-plugins-official` marketplace，1.2.3 版，user scope）
- [x] 用 `/grill-me` 拷問飲食控制 App 的想法（4 輪、20 題），決策整理在 **`decisions.md`**
- [x] 認識 `grill-me` 和 `grill-with-docs` 的差異，以及何時進入 `to-spec`
- [x] 建立 Anthropic 帳號、儲值 5 美元、設定每月花費上限 5 美元、建立 API key（永不到期，只存在我自己這裡）
- [x] 已有 GitHub 帳號

## 下一步（這個 session 要做的事）
1. **先讀 `decisions.md`**，了解 App 的所有決定。決定已確認過，不需要重新拷問
2. 帶我跑 **`/setup-matt-pocock-skills`**，並解釋每個設定的意義
   - 注意：這個資料夾目前**不是 git repo**，裡面只有 `handoff.md` 和 `decisions.md`。設定 issue tracker 時，要說明選 GitHub Issues 和本機 markdown（`.scratch/`）各有什麼優缺點，需要的話帶我初始化 git、建立 GitHub repo
3. 帶我跑 **`/to-spec`**，根據 `decisions.md` 產出規格書，並解釋規格書每個段落的用途
4. 之後：`to-tickets` → `implement`

## 注意事項
- **絕對不要**要求我把 API key 貼進對話
- 不確定下一步該用哪個 skill 時，可以用 `ask-matt`
