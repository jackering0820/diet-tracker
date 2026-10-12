// AI 分析轉接器：從瀏覽器直接呼叫 Anthropic Messages API，分析一餐的照片。
// 網路傳送功能（transport，形狀和 fetch 相同）由外部注入；測試換成假的，永遠不會真的呼叫 API。

import { AnalysisError } from "../core/analysis-error.js";

const API_URL = "https://api.anthropic.com/v1/messages";

const SYSTEM_PROMPT = `你是台灣的營養分析助理。使用者會傳來同一餐的一張或多張照片，請辨識照片中的食物並估算營養。

規則：
- 依台灣常見的飲食習慣辨識，例如便當、自助餐、小吃、夜市、早餐店、手搖飲。
- 食物名稱和份量描述一律使用繁體中文，份量用台灣人習慣的說法（例如「一個便當」「大杯微糖」「一碗」）。
- 多張照片是同一餐的不同角度或不同部分；同一個食物出現在多張照片時只算一次。
- 每一項估算：熱量（大卡）、蛋白質（公克）、碳水化合物（公克）、脂肪（公克）、蔬菜份數（依台灣每日飲食指南，1 份約為煮熟後半碗或生菜 100 公克）。
- 看不清楚時，依台灣常見份量做合理估計，不要省略看得到的食物。
- 照片中沒有食物時，回傳空的清單。`;

// 結構化輸出的格式：保證回傳符合這個 JSON schema。
const ITEMS_SCHEMA = {
  type: "object",
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          portion: { type: "string" },
          kcal: { type: "number" },
          protein: { type: "number" },
          carbs: { type: "number" },
          fat: { type: "number" },
          veg: { type: "number" },
        },
        required: ["name", "portion", "kcal", "protein", "carbs", "fat", "veg"],
        additionalProperties: false,
      },
    },
  },
  required: ["items"],
  additionalProperties: false,
};

// "data:image/jpeg;base64,xxxx" → Claude 的圖片區塊
function imageBlock(dataUrl) {
  const match = /^data:(image\/[a-z]+);base64,(.+)$/.exec(dataUrl);
  if (!match) throw new AnalysisError("invalidPhoto", "照片格式無法辨識，請重新選擇照片");
  return { type: "image", source: { type: "base64", media_type: match[1], data: match[2] } };
}

function buildRequest({ model, photos }) {
  return {
    model,
    max_tokens: 16000,
    system: SYSTEM_PROMPT,
    output_config: { format: { type: "json_schema", schema: ITEMS_SCHEMA } },
    messages: [
      {
        role: "user",
        content: [
          ...photos.map(imageBlock),
          { type: "text", text: `這是同一餐的 ${photos.length} 張照片，請列出這一餐的食物和營養。` },
        ],
      },
    ],
  };
}

// 檢查並取出食物項目：只有形狀完全正確的回應才交給日記核心。
function readItems(body) {
  const text = body?.content?.find((b) => b.type === "text")?.text;
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new AnalysisError("invalidResponse", "AI 的回覆無法解讀");
  }
  if (!Array.isArray(parsed?.items)) throw new AnalysisError("invalidResponse", "AI 的回覆無法解讀");
  return parsed.items;
}

export function createClaudeAnalyzer({ transport }) {
  return {
    // 回傳食物項目清單（尚未經過日記核心的檢查）。
    async analyze({ apiKey, model, photos }) {
      const response = await transport(API_URL, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
          // 允許瀏覽器直接呼叫 API（這個 App 沒有後端）。
          "anthropic-dangerous-direct-browser-access": "true",
        },
        body: JSON.stringify(buildRequest({ model, photos })),
      });
      if (!response.ok) throw new AnalysisError("failed", "分析失敗，請稍後再試");
      return readItems(await response.json());
    },
  };
}
