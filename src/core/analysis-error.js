// AI 分析失敗時丟出的錯誤。kind 讓畫面決定要顯示哪些選項（前往設定、重試）。
// 訊息由這裡統一決定，刻意不包含金鑰或 API 回應的原始內容。

// 錯誤種類：日記核心、轉接器、畫面共用這一份，不要直接寫字串。
export const ANALYSIS_ERRORS = {
  NO_API_KEY: "noApiKey", // 還沒設定金鑰
  INVALID_KEY: "invalidKey", // 金鑰無效或已停用（401）
  QUOTA: "quota", // 額度問題：達到每月花費上限、餘額不足（402）
  BUSY: "busy", // 服務忙碌或暫時錯誤（429、5xx）
  NETWORK: "network", // 連不上網路
  INVALID_PHOTO: "invalidPhoto", // 照片格式無法辨識
  INVALID_RESPONSE: "invalidResponse", // AI 的回覆無法解讀（格式、缺欄位、型別、負數）
  REQUEST_FAILED: "requestFailed", // 其他 API 錯誤（訊息附上錯誤代碼）
};

const MESSAGES = {
  [ANALYSIS_ERRORS.NO_API_KEY]: "還沒設定 API 金鑰，請先到設定頁貼上金鑰",
  [ANALYSIS_ERRORS.INVALID_KEY]: "API 金鑰已失效，請到設定更換",
  [ANALYSIS_ERRORS.QUOTA]: "API 額度已用完（達到每月花費上限或餘額不足），下個月或儲值後就會恢復",
  [ANALYSIS_ERRORS.BUSY]: "AI 服務暫時忙碌，請稍後重試",
  [ANALYSIS_ERRORS.NETWORK]: "無法連線，請確認網路",
  [ANALYSIS_ERRORS.INVALID_PHOTO]: "照片格式無法辨識，請重新選擇照片",
  [ANALYSIS_ERRORS.INVALID_RESPONSE]: "AI 的回覆無法解讀，可以重試或改成手動輸入",
};

function messageFor(kind, status) {
  if (kind === ANALYSIS_ERRORS.REQUEST_FAILED) return `分析失敗（錯誤代碼 ${status ?? "未知"}），請稍後再試`;
  return MESSAGES[kind];
}

export class AnalysisError extends Error {
  // details：API 錯誤的 status（例如 401）和 apiErrorType（例如 "authentication_error"）。
  constructor(kind, details = {}) {
    super(messageFor(kind, details.status));
    this.name = "AnalysisError";
    this.kind = kind;
    this.status = details.status ?? null;
    this.apiErrorType = details.apiErrorType ?? null;
  }
}
