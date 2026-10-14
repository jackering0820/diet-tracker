// 指標目錄：每天追蹤的每一項數值。名稱、單位、顯示格式、目標設定都只寫在這裡，
// 其他模組（包含畫面）都從這裡讀。清單的順序就是所有畫面的順序。
// 新增一項指標：在這裡加一行（key 一旦用了就不要改，手機上的資料和備份檔都用它）。
//
// source：food 是來自食物的營養，water 是另外記錄的喝水。
// goal：null 表示只顯示、不設目標；limit 是 ceiling（上限）或 floor（下限）。
const LIST = [
  { key: "kcal", name: "熱量", unit: "大卡", decimals: 0, source: "food", goal: { limit: "ceiling", default: null } },
  { key: "protein", name: "蛋白質", unit: "g", decimals: 1, source: "food", goal: { limit: "floor", default: null } },
  { key: "carbs", name: "碳水", unit: "g", decimals: 1, source: "food", goal: null },
  { key: "fat", name: "脂肪", unit: "g", decimals: 1, source: "food", goal: null },
  // 蔬菜預設至少 3 份：台灣每日飲食指南的建議
  { key: "veg", name: "蔬菜", unit: "份", decimals: 1, source: "food", goal: { limit: "floor", default: 3 } },
  { key: "waterMl", name: "喝水", unit: "ml", decimals: 0, source: "water", goal: { limit: "floor", default: null } },
];

function freeze(measure) {
  if (measure.goal) Object.freeze(measure.goal);
  return Object.freeze(measure);
}

export const MEASURES = Object.freeze(LIST.map(freeze));

// 營養：來自食物的指標。一餐的每一項食物都有這些數值。
export const NUTRIENTS = Object.freeze(MEASURES.filter((m) => m.source === "food"));

// 有目標的指標。
export const GOAL_MEASURES = Object.freeze(MEASURES.filter((m) => m.goal));

const BY_KEY = new Map(MEASURES.map((m) => [m.key, m]));

// 依這項指標的小數位數格式化（熱量和喝水取整數，其他取到小數點後一位）。
export function formatMeasure(key, value) {
  return value.toFixed(BY_KEY.get(key).decimals);
}

// 依顯示規則四捨五入後的數值，讓判斷結果和畫面上看到的一致。
export function roundMeasure(key, value) {
  return Number(formatMeasure(key, value));
}
