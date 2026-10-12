// AI 分析失敗時丟出的錯誤。kind 讓畫面決定要顯示什麼、能不能重試。
// 訊息刻意不包含金鑰或 API 回應的原始內容。
export class AnalysisError extends Error {
  constructor(kind, message) {
    super(message);
    this.name = "AnalysisError";
    this.kind = kind;
  }
}
