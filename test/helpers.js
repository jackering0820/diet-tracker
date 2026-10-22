import { createDiary } from "../src/core/diary.js";
import { createMemoryStorage } from "../src/adapters/memory-storage.js";
import { createClaudeAnalyzer } from "../src/adapters/claude-analyzer.js";

// 建立一個使用記憶體版儲存、固定時間的日記核心。
// transport：假的網路傳送功能（測試永遠不會真的呼叫 API）。
export function setup(now = new Date(2026, 9, 11, 12, 0), { transport = fakeTransport() } = {}) {
  const storage = createMemoryStorage();
  const clock = { now: () => now };
  const analyzer = createClaudeAnalyzer({ transport });
  return { diary: createDiary({ storage, clock, analyzer }), storage, clock, transport };
}

// 假的 transport：記錄每一次請求，並依序回傳預先準備好的回應。
export function fakeTransport(...responses) {
  const requests = [];
  async function transport(url, init) {
    requests.push({ url, headers: init.headers, body: JSON.parse(init.body) });
    const next = responses.shift();
    if (!next) throw new Error("測試沒有準備這次請求的回應");
    return { ok: next.status === 200, status: next.status, json: async () => next.body };
  }
  transport.requests = requests;
  return transport;
}

// Claude API 成功回應：結構化輸出的 JSON 放在第一個 text 區塊。
export function claudeReply(items) {
  return {
    status: 200,
    body: {
      type: "message",
      role: "assistant",
      stop_reason: "end_turn",
      content: [{ type: "text", text: JSON.stringify({ items }) }],
    },
  };
}

// 模擬改版前的 App 存下的目標：當時原樣存下使用者輸入的數字，沒有四捨五入。
// 沒有公開操作做得出這種舊存檔，所以只在這裡直接寫入儲存層，存檔格式也只寫在這一處。
export async function saveGoalsLikeOldVersion(storage, goals) {
  await storage.put("settings", { id: "goals", goals });
}
