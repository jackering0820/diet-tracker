// AI 設定：API 金鑰與模型。
// 金鑰只在核心內部使用；對外只提供遮罩後的片段，畫面永遠拿不到完整金鑰。

export const MODELS = ["claude-sonnet-5-5", "claude-haiku-5-5"];
export const DEFAULT_MODEL = "claude-sonnet-5-5";

export function keyStatus(key) {
  return key ? { isSet: true, masked: maskKey(key) } : { isSet: false, masked: null };
}

// 只露出開頭 7 個字（例如 "sk-ant-"）和最後 4 個字，讓使用者認得是哪一把金鑰。
// 太短的金鑰不露出任何字元。
function maskKey(key) {
  if (key.length <= 12) return "••••";
  return `${key.slice(0, 7)}…${key.slice(-4)}`;
}

// 整理並檢查貼上的金鑰：去掉前後的空白和換行。
// 錯誤訊息刻意不包含金鑰內容，避免出現在畫面或紀錄裡。
export function normalizeKey(key) {
  const trimmed = typeof key === "string" ? key.trim() : "";
  if (trimmed === "") throw new Error("請貼上 API 金鑰");
  if (/\s/.test(trimmed)) throw new Error("API 金鑰中間不能有空格或換行，請重新複製一次");
  return trimmed;
}
