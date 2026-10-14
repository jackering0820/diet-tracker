// 一餐的規則：餐別預設、草稿編輯、總數計算。
import { validateAt } from "./day.js";
import { NUTRIENTS } from "./measures.js";

export const MEAL_TYPES = ["早餐", "午餐", "晚餐", "點心"];

// 依時間預設餐別：04:00–10:29 早餐、10:30–14:29 午餐、14:30–16:59 點心、
// 17:00–21:29 晚餐、其他時間點心。
export function defaultMealType(date) {
  const minutes = date.getHours() * 60 + date.getMinutes();
  if (minutes >= 4 * 60 && minutes < 10 * 60 + 30) return "早餐";
  if (minutes >= 10 * 60 + 30 && minutes < 14 * 60 + 30) return "午餐";
  if (minutes >= 17 * 60 && minutes < 21 * 60 + 30) return "晚餐";
  return "點心";
}

// 檢查一個完整的食物項目，有問題就丟出錯誤（訊息給使用者看）。
function validateItem(item) {
  if (typeof item.name !== "string" || item.name.trim() === "") {
    throw new Error("食物名稱不能空白");
  }
  for (const { key, name } of NUTRIENTS) {
    const v = item[key];
    if (typeof v !== "number" || !Number.isFinite(v) || v < 0) {
      throw new Error(`${name}必須是 0 或正數`);
    }
  }
}

// 加總食物項目的每一項營養。總數不儲存，每次都即時算。
export function sumNutrients(items) {
  const totals = Object.fromEntries(NUTRIENTS.map(({ key }) => [key, 0]));
  for (const item of items) {
    for (const { key } of NUTRIENTS) totals[key] += item[key];
  }
  return totals;
}

// 建立一個經過檢查的食物項目（沒有 id 就給一個新的）。
function newItem(fields, id = crypto.randomUUID()) {
  const item = { ...fields, id };
  validateItem(item);
  return item;
}

// 草稿：正在編輯、還沒確認儲存的一餐。有 id 表示是在修改已存的一餐。
// 可以預先帶入食物項目和縮圖照片（例如 AI 分析的結果）。
export function createMealDraft({ id, at, mealType, items = [], photos = [], source = "manual" }) {
  const prefilled = items.map((i) => newItem(i, i.id));
  return {
    id,
    at,
    mealType,
    items: prefilled,
    photos: [...photos],
    source,

    addItem(fields) {
      const item = newItem(fields);
      this.items.push(item);
      return item;
    },

    updateItem(id, changes) {
      const index = this.items.findIndex((i) => i.id === id);
      if (index === -1) throw new Error("找不到這項食物");
      const updated = { ...this.items[index], ...changes, id };
      validateItem(updated);
      this.items[index] = updated;
      return updated;
    },

    // 追加照片到同一餐（例如主餐、飲料分開拍）。
    addPhotos(photos) {
      this.photos.push(...photos);
    },

    removeItem(id) {
      this.items = this.items.filter((i) => i.id !== id);
    },

    totals() {
      return sumNutrients(this.items);
    },

    // 用 AI 分析的結果取代食物項目；每一項都經過和手動輸入相同的檢查。
    applyAnalysis(items) {
      this.items = items.map((fields) => newItem(fields));
      this.source = "ai";
    },

    // 轉成要儲存的資料（不含方法，也不存總數）。
    toRecord() {
      validateAt(this.at);
      if (!MEAL_TYPES.includes(this.mealType)) throw new Error("請選擇餐別");
      if (this.items.length === 0) throw new Error("請至少加入一項食物");
      // 第一次儲存時才給 id，並記在草稿上，之後再存一次就是更新同一餐。
      this.id ??= crypto.randomUUID();
      return {
        id: this.id,
        at: this.at,
        mealType: this.mealType,
        items: this.items.map((i) => ({ ...i })),
        photos: [...this.photos],
        source: this.source,
      };
    },
  };
}
