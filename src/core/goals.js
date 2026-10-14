// 每日目標與達標判斷。
import { GOAL_MEASURES, roundMeasure } from "./measures.js";

// 第一次使用時的目標：依指標目錄的預設值（null 表示未設定）。
const DEFAULT_GOALS = Object.fromEntries(GOAL_MEASURES.map((m) => [m.key, m.goal.default]));

// 達標狀態目錄：每一種狀態的文字和圖示，今天畫面和歷史列表都從這裡讀。
export const GOAL_STATUSES = Object.freeze({
  achieved: Object.freeze({ text: "達標", icon: "✅" }),
  over: Object.freeze({ text: "超過", icon: "❌" }),
  missed: Object.freeze({ text: "未達標", icon: "❌" }),
  unset: Object.freeze({ text: "未設定", icon: "－" }),
  noRecords: Object.freeze({ text: "無紀錄", icon: "－" }),
});

// 檢查並整理目標：每項必須是 0 或正數，null 表示未設定。
export function validateGoals(goals) {
  return Object.fromEntries(
    GOAL_MEASURES.map(({ key, name }) => {
      const v = goals[key] ?? null;
      if (v !== null && (typeof v !== "number" || !Number.isFinite(v) || v < 0)) {
        throw new Error(`${name}目標必須是 0 或正數，或留空`);
      }
      return [key, v];
    }),
  );
}

// 把存起來的目標補上預設值：以後新增目標時，舊的存檔也能正常使用。
export function withDefaults(saved) {
  return { ...DEFAULT_GOALS, ...saved };
}

// 一項目標的狀態：
//   unset    未設定目標，不判斷
//   achieved 達標
//   over     超過上限（熱量）
//   missed   還沒達到下限（蛋白質、蔬菜、喝水）
//   noRecords 這一天完全沒有紀錄，不判斷（避免沒吃東西也被標成熱量達標）
// 刻意用「顯示出來的數字」判斷：畫面寫「1800 / 1800」就一定是達標，
// 不會因為實際是 1800.4 而顯示超過，讓使用者困惑。
function goalStatus(measure, value, goal, hasRecords) {
  if (goal === null) return "unset";
  if (!hasRecords) return "noRecords";
  const shown = roundMeasure(measure.key, value);
  if (measure.goal.limit === "ceiling") return shown <= goal ? "achieved" : "over";
  return shown >= goal ? "achieved" : "missed";
}

// 計算每一項目標的進度。hasRecords：這一天有沒有任何餐點或喝水紀錄。
export function goalProgress(values, goals, hasRecords) {
  return Object.fromEntries(
    GOAL_MEASURES.map((measure) => {
      const value = values[measure.key];
      const goal = goals[measure.key];
      return [measure.key, { value, goal, status: goalStatus(measure, value, goal, hasRecords) }];
    }),
  );
}
