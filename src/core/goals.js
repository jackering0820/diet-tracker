// 每日目標與達標判斷。
import { roundForDisplay } from "./meal.js";

// 第一次使用時的目標：蔬菜依台灣每日飲食指南建議至少 3 份，其他未設定（null）。
export const DEFAULT_GOALS = { kcal: null, protein: null, veg: 3, waterMl: null };

const GOAL_LABELS = { kcal: "熱量", protein: "蛋白質", veg: "蔬菜份數", waterMl: "喝水量" };

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

// 熱量是上限（≤ 目標達標），其他是下限（≥ 目標達標）。
const CEILINGS = new Set(["kcal"]);

// 計算 4 項目標的進度。未設定目標的項目 achieved 為 null（不判斷）。
export function goalProgress(values, goals) {
  return Object.fromEntries(
    Object.keys(DEFAULT_GOALS).map((key) => {
      const value = values[key];
      const goal = goals[key];
      let achieved = null;
      const shown = roundForDisplay(key, value);
      if (goal !== null) achieved = CEILINGS.has(key) ? shown <= goal : shown >= goal;
      return [key, { value, goal, achieved }];
    }),
  );
}
