// 備份檔的格式：匯出成 JSON 文字，匯入時先完整檢查再交給日記核心。
// 刻意「挑選」要放進備份的內容（餐點、喝水、目標），API 金鑰和其他設定一律不放。
import { validateAt } from "./day.js";
import { validateGoals } from "./goals.js";
import { createMealDraft } from "./meal.js";

const FORMAT = "diet-tracker-backup";
const VERSION = 1;

export function buildBackup({ meals, water, goals, exportedAt }) {
  return JSON.stringify({ format: FORMAT, version: VERSION, exportedAt, meals, water, goals });
}

function fail(message) {
  throw new Error(message);
}

// 每一餐用和平常儲存一餐時相同的規則檢查，回傳整理過的紀錄（多餘的欄位會被丟掉）。
function readMeal(raw, index) {
  try {
    if (typeof raw?.id !== "string" || raw.id === "") fail("缺少識別碼");
    const photos = raw.photos ?? [];
    if (!Array.isArray(photos) || !photos.every((p) => typeof p === "string" && p.startsWith("data:image/"))) {
      fail("照片格式不對");
    }
    const draft = createMealDraft({ id: raw.id, at: raw.at, mealType: raw.mealType, items: raw.items ?? [], photos, source: raw.source === "ai" ? "ai" : "manual" });
    return draft.toRecord();
  } catch (err) {
    fail(`備份檔的第 ${index + 1} 筆餐點有問題：${err.message}`);
  }
}

function readWater(raw, index) {
  try {
    if (typeof raw?.id !== "string" || raw.id === "") fail("缺少識別碼");
    validateAt(raw.at);
    if (typeof raw.ml !== "number" || !Number.isFinite(raw.ml) || raw.ml <= 0) fail("喝水量必須是大於 0 的數字");
    return { id: raw.id, at: raw.at, ml: raw.ml };
  } catch (err) {
    fail(`備份檔的第 ${index + 1} 筆喝水紀錄有問題：${err.message}`);
  }
}

// 解析並完整檢查備份檔；任何一處有問題就整份拒絕（丟出錯誤，訊息給使用者看）。
export function parseBackup(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    fail("這不是飲食紀錄的備份檔（無法讀取）");
  }
  if (data?.format !== FORMAT) fail("這不是飲食紀錄的備份檔");
  if (data.version !== VERSION) fail(`不支援這個備份檔的版本（版本 ${data.version}），請更新 App 後再試`);
  if (!Array.isArray(data.meals)) fail("備份檔的餐點資料不完整");
  if (!Array.isArray(data.water)) fail("備份檔的喝水資料不完整");

  const meals = data.meals.map(readMeal);
  const water = data.water.map(readWater);
  let goals;
  try {
    goals = validateGoals(data.goals ?? {});
  } catch (err) {
    fail(`備份檔的目標有問題：${err.message}`);
  }
  return { meals, water, goals };
}
