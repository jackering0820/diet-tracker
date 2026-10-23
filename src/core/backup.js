// 備份檔的格式：匯出成 JSON 文字，匯入時先完整檢查再交給日記核心。
// 刻意「挑選」要放進備份的內容（餐點、喝水、目標），API 金鑰和其他設定一律不放。
import { dayKeyOf, validateAt } from "./day.js";
import { validateGoals } from "./goals.js";
import { createMealDraft } from "./meal.js";
import { validateWaterMl } from "./water.js";

const FORMAT = "diet-tracker-backup";
const VERSION = 1;
const SOURCES = ["manual", "ai"];

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
    if (!Array.isArray(raw.items)) fail("缺少食物清單");
    if (!Array.isArray(raw.photos) || !raw.photos.every((p) => typeof p === "string" && p.startsWith("data:image/"))) {
      fail("照片格式不對");
    }
    if (!SOURCES.includes(raw.source)) fail("來源不明");
    const draft = createMealDraft({ id: raw.id, at: raw.at, mealType: raw.mealType, items: raw.items, photos: raw.photos, source: raw.source });
    return draft.toRecord();
  } catch (err) {
    fail(`備份檔的第 ${index + 1} 筆餐點有問題：${err.message}`);
  }
}

function readWater(raw, index) {
  try {
    if (typeof raw?.id !== "string" || raw.id === "") fail("缺少識別碼");
    return { id: raw.id, at: validateAt(raw.at), ml: validateWaterMl(raw.ml) };
  } catch (err) {
    fail(`備份檔的第 ${index + 1} 筆喝水紀錄有問題：${err.message}`);
  }
}

// 同一種紀錄的識別碼不能重複，否則匯入時會互相覆蓋、資料悄悄變少。
function checkUniqueIds(records, label) {
  const ids = new Set(records.map((r) => r.id));
  if (ids.size !== records.length) fail(`備份檔裡有重複的${label}識別碼`);
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
  if (data.goals === null || typeof data.goals !== "object") fail("備份檔缺少每日目標");

  const meals = data.meals.map(readMeal);
  const water = data.water.map(readWater);
  checkUniqueIds(meals, "餐點");
  checkUniqueIds(water, "喝水紀錄");
  let goals;
  try {
    goals = validateGoals(data.goals);
  } catch (err) {
    fail(`備份檔的目標有問題：${err.message}`);
  }
  return { meals, water, goals };
}

// 備份摘要：一份備份裡有什麼。紀錄天數是有任何餐點或喝水的日子，檔案大小是備份檔的位元組數。
export function summarizeBackup(text) {
  const { meals, water } = parseBackup(text);
  const days = new Set([...meals, ...water].map((record) => dayKeyOf(new Date(record.at))));
  return {
    days: days.size,
    meals: meals.length,
    photos: meals.reduce((sum, meal) => sum + meal.photos.length, 0),
    water: water.length,
    bytes: new TextEncoder().encode(text).length,
  };
}
