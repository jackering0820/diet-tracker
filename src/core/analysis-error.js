// AI 分析失敗時丟出的錯誤。每一種錯誤的訊息、要不要前往設定、能不能重試，
// 都由下面這張表決定；畫面只照著顯示。訊息刻意不包含金鑰或 API 回應的原始內容。

// 錯誤種類：日記核心、轉接器、畫面共用這一份，不要直接寫字串。
export const ANALYSIS_ERRORS = {
  NO_API_KEY: "noApiKey", // 還沒設定金鑰
  INVALID_KEY: "invalidKey", // 金鑰無效或已停用（401）
  QUOTA: "quota", // 額度問題：達到每月花費上限、餘額不足（402）
  BUSY: "busy", // 服務忙碌或暫時錯誤（429、5xx）
  NETWORK: "network", // 連不上網路
  INVALID_PHOTO: "invalidPhoto", // 照片格式無法辨識
  TOO_LARGE: "tooLarge", // 照片太多或太大（413）
  INVALID_RESPONSE: "invalidResponse", // AI 的回覆無法解讀（格式、缺欄位、型別、負數）
  REQUEST_FAILED: "requestFailed", // 其他 API 錯誤（訊息附上錯誤代碼）
};

// needsSettings：顯示「前往設定」；retryable：顯示「重試」（重試有機會成功時才顯示）。
// 「改成手動輸入」是每一種錯誤都有的選項，不用寫在表裡。
const RULES = {
  [ANALYSIS_ERRORS.NO_API_KEY]: { message: "還沒設定 API 金鑰，請先到設定頁貼上金鑰", needsSettings: true, retryable: true },
  [ANALYSIS_ERRORS.INVALID_KEY]: { message: "API 金鑰已失效，請到設定更換", needsSettings: true, retryable: true },
  [ANALYSIS_ERRORS.QUOTA]: { message: "API 額度已用完（達到每月花費上限或餘額不足），下個月或儲值後就會恢復", needsSettings: false, retryable: true },
  [ANALYSIS_ERRORS.BUSY]: { message: "AI 服務暫時忙碌，請稍後重試", needsSettings: false, retryable: true },
  [ANALYSIS_ERRORS.NETWORK]: { message: "無法連線，請確認網路", needsSettings: false, retryable: true },
  [ANALYSIS_ERRORS.INVALID_PHOTO]: { message: "照片格式無法辨識，請重新選擇照片", needsSettings: false, retryable: false },
  [ANALYSIS_ERRORS.TOO_LARGE]: { message: "照片太多或太大，請改成手動輸入，或改用少一點的照片重新記錄", needsSettings: false, retryable: false },
  [ANALYSIS_ERRORS.INVALID_RESPONSE]: { message: "AI 的回覆無法解讀，可以重試或改成手動輸入", needsSettings: false, retryable: true },
  [ANALYSIS_ERRORS.REQUEST_FAILED]: {
    message: (status) => `分析失敗（錯誤代碼 ${status ?? "未知"}），可以改成手動輸入`,
    needsSettings: false,
    retryable: false,
  },
};

export class AnalysisError extends Error {
  // details：API 錯誤的 status（例如 401）和 apiErrorType（例如 "authentication_error"）。
  constructor(kind, details = {}) {
    const rule = RULES[kind];
    const status = details.status ?? null;
    super(typeof rule.message === "function" ? rule.message(status) : rule.message);
    this.name = "AnalysisError";
    this.kind = kind;
    this.needsSettings = rule.needsSettings;
    this.retryable = rule.retryable;
    this.status = status;
    this.apiErrorType = details.apiErrorType ?? null;
  }
}
