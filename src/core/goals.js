// 每日目標與達標判斷。
import { roundForDisplay } from "./format.js";

// 第一次使用時的目標：蔬菜依台灣每日飲食指南建議至少 3 份，其他未設定（null）。
export const DEFAULT_GOALS = { kcal: null, protein: null, veg: 3, waterMl: null };

const GOAL_LABELS = { kcal: "熱量", protein: "蛋白質", veg: "蔬菜份數", waterMl: "喝水量" };

// 熱量是上限（≤ 目標達標），其他是下限（≥ 目標達標）。
const CEILINGS = new Set(["kcal"]);

// 檢查並整理目標：每項必須是 0 或正數，null 表示未設定。
export function validateGoals(goals) {
  return Object.fromEntries(
    Object.keys(DEFAULT_GOALS).map((key) => {
      const v = goals[key] ?? null;
      if (v !== null && (typeof v !== "number" || !Number.isFinite(v) || v < 0)) {
        throw new Error(`${GOAL_LABELS[key]}目標必須是 0 或正數，或留空`);
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
// 刻意用「顯示出來的數字」判斷：畫面寫「1800 / 1800」就一定是達標，
// 不會因為實際是 1800.4 而顯示超過，讓使用者困惑。
function goalStatus(key, value, goal) {
  if (goal === null) return "unset";
  const shown = roundForDisplay(key, value);
  if (CEILINGS.has(key)) return shown <= goal ? "achieved" : "over";
  return shown >= goal ? "achieved" : "missed";
}

// 計算 4 項目標的進度。
export function goalProgress(values, goals) {
  return Object.fromEntries(
    Object.keys(DEFAULT_GOALS).map((key) => {
      const value = values[key];
      const goal = goals[key];
      return [key, { value, goal, status: goalStatus(key, value, goal) }];
    }),
  );
}
