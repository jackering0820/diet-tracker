// AI 分析轉接器：從瀏覽器直接呼叫 Anthropic Messages API，分析一餐的照片。
// 網路傳送功能（transport，形狀和 fetch 相同）由外部注入；測試換成假的，永遠不會真的呼叫 API。

import { ANALYSIS_ERRORS, AnalysisError } from "../core/analysis-error.js";
import { NUTRIENTS } from "../core/measures.js";

const API_URL = "https://api.anthropic.com/v1/messages";

// 營養的 key 來自指標目錄。
const NUTRIENT_KEYS = NUTRIENTS.map((m) => m.key);

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
          ...Object.fromEntries(NUTRIENT_KEYS.map((key) => [key, { type: "number" }])),
        },
        required: ["name", "portion", ...NUTRIENT_KEYS],
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
  if (!match) throw new AnalysisError(ANALYSIS_ERRORS.INVALID_PHOTO);
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


function invalidResponse() {
  return new AnalysisError(ANALYSIS_ERRORS.INVALID_RESPONSE);
}

// API 錯誤類型 → 錯誤種類。
const KIND_BY_ERROR_TYPE = {
  authentication_error: ANALYSIS_ERRORS.INVALID_KEY,
  billing_error: ANALYSIS_ERRORS.QUOTA,
  rate_limit_error: ANALYSIS_ERRORS.BUSY,
  overloaded_error: ANALYSIS_ERRORS.BUSY,
  api_error: ANALYSIS_ERRORS.BUSY,
  request_too_large: ANALYSIS_ERRORS.TOO_LARGE,
};

// 先看 API 的錯誤類型；回應裡沒有可辨識的類型時，才用狀態碼判斷。不比對錯誤訊息的文字。
function classifyApiError(status, apiErrorType) {
  if (KIND_BY_ERROR_TYPE[apiErrorType]) return KIND_BY_ERROR_TYPE[apiErrorType];
  if (status === 401) return ANALYSIS_ERRORS.INVALID_KEY;
  if (status === 402) return ANALYSIS_ERRORS.QUOTA;
  if (status === 413) return ANALYSIS_ERRORS.TOO_LARGE;
  if (status === 429 || status >= 500) return ANALYSIS_ERRORS.BUSY;
  return ANALYSIS_ERRORS.REQUEST_FAILED;
}

// 檢查一項食物的形狀，只留下需要的欄位。
function readItem(raw) {
  if (typeof raw?.name !== "string" || typeof raw.portion !== "string") throw invalidResponse();
  const item = { name: raw.name, portion: raw.portion };
  for (const key of NUTRIENT_KEYS) {
    const value = raw[key];
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0) throw invalidResponse();
    item[key] = value;
  }
  return item;
}

// 檢查並取出食物項目：只有形狀完全正確的回應才交給日記核心。
// 沒有正常結束（例如 refusal、max_tokens）的回覆也不採用。
function readItems(body) {
  if (body?.stop_reason !== "end_turn") throw invalidResponse();
  const text = body.content?.find((b) => b.type === "text")?.text;
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw invalidResponse();
  }
  if (!Array.isArray(parsed?.items)) throw invalidResponse();
  return parsed.items.map(readItem);
}

export function createClaudeAnalyzer({ transport }) {
  return {
    // 回傳食物項目清單（尚未經過日記核心的檢查）。
    async analyze({ apiKey, model, photos }) {
      const body = JSON.stringify(buildRequest({ model, photos }));
      let response;
      try {
        response = await transport(API_URL, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-api-key": apiKey,
            "anthropic-version": "2023-06-01",
            // 允許瀏覽器直接呼叫 API（這個 App 沒有後端）。
            "anthropic-dangerous-direct-browser-access": "true",
          },
          body,
        });
      } catch {
        throw new AnalysisError(ANALYSIS_ERRORS.NETWORK);
      }
      if (!response.ok) {
        // 只保留狀態碼和錯誤類型，不保留 API 的錯誤訊息（可能包含金鑰片段）。
        const apiErrorType = await response.json().then((b) => b?.error?.type ?? null, () => null);
        throw new AnalysisError(classifyApiError(response.status, apiErrorType), { status: response.status, apiErrorType });
      }
      return readItems(await response.json().catch(() => null));
    },
  };
}
