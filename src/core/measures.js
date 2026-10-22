// 指標目錄：每天追蹤的每一項數值。名稱、單位、顯示格式、目標設定都只寫在這裡，
// 其他模組（包含畫面）都從這裡讀。清單的順序就是所有畫面的順序。
// 新增一項指標：在這裡加一行（key 一旦用了就不要改，手機上的資料和備份檔都用它）。
//
// source：food 是來自食物的營養，water 是另外記錄的喝水。
// goal：null 表示只顯示、不設目標；limit 是 ceiling（上限）或 floor（下限）；step 是設定頁步進器按一下的幅度，
// suggested 是目標未設定時按步進器開始的建議值。
// short：一個字的簡稱，標在歷史的星星旁邊（有目標的指標才需要）。
const LIST = [
  { key: "kcal", name: "熱量", short: "熱", unit: "大卡", decimals: 0, source: "food", goal: { limit: "ceiling", default: null, step: 50, suggested: 1800 } },
  { key: "protein", name: "蛋白質", short: "蛋", unit: "g", decimals: 1, source: "food", goal: { limit: "floor", default: null, step: 5, suggested: 60 } },
  { key: "carbs", name: "碳水", unit: "g", decimals: 1, source: "food", goal: null },
  { key: "fat", name: "脂肪", unit: "g", decimals: 1, source: "food", goal: null },
  // 蔬菜預設至少 3 份：台灣每日飲食指南的建議
  { key: "veg", name: "蔬菜", short: "菜", unit: "份", decimals: 1, source: "food", goal: { limit: "floor", default: 3, step: 0.5, suggested: 3 } },
  { key: "waterMl", name: "喝水", short: "水", unit: "ml", decimals: 0, source: "water", goal: { limit: "floor", default: null, step: 250, suggested: 2000 } },
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

// 喝水這一項指標（不是營養，另外記錄）。
export const WATER_MEASURE = MEASURES.find((m) => m.source === "water");

const BY_KEY = new Map(MEASURES.map((m) => [m.key, m]));

// 依這項指標的小數位數格式化（熱量和喝水取整數，其他取到小數點後一位）。
export function formatMeasure(key, value) {
  return value.toFixed(BY_KEY.get(key).decimals);
}

// 格式化並加上單位，例如「820 大卡」。
export function formatWithUnit(key, value) {
  return `${formatMeasure(key, value)} ${BY_KEY.get(key).unit}`;
}

// 依顯示規則四捨五入後的數值：判斷達標狀態時用它，才會和畫面上看到的數字一致。
export function roundMeasure(key, value) {
  return Number(formatMeasure(key, value));
}
