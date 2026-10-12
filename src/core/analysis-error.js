// AI 分析失敗時丟出的錯誤。kind 讓畫面決定要顯示什麼、能不能重試。
// 訊息刻意不包含金鑰或 API 回應的原始內容。

// 錯誤種類：日記核心、轉接器、畫面共用這一份，不要直接寫字串。
export const ANALYSIS_ERRORS = {
  NO_API_KEY: "noApiKey", // 還沒設定金鑰
  INVALID_PHOTO: "invalidPhoto", // 照片格式無法辨識
  INVALID_RESPONSE: "invalidResponse", // AI 的回覆無法解讀（格式、缺欄位、型別、負數）
  REQUEST_FAILED: "requestFailed", // API 回傳錯誤狀態（細節在 status、apiErrorType）
  NETWORK: "network", // 連不上網路
};

export class AnalysisError extends Error {
  // details：API 錯誤的 status（例如 401）和 apiErrorType（例如 "authentication_error"）。
  constructor(kind, message, details = {}) {
    super(message);
    this.name = "AnalysisError";
    this.kind = kind;
    this.status = details.status ?? null;
    this.apiErrorType = details.apiErrorType ?? null;
  }
}
