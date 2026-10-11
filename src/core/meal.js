// 一餐的規則：餐別預設、草稿編輯、總數計算。

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

export const NUTRIENTS = ["kcal", "protein", "carbs", "fat", "veg"];

export const NUTRIENT_LABELS = { kcal: "熱量", protein: "蛋白質", carbs: "碳水", fat: "脂肪", veg: "蔬菜份數" };

// 顯示規則：熱量和喝水量取整數，其他取到小數點後一位。
function displayDecimals(key) {
  return key === "kcal" || key === "waterMl" ? 0 : 1;
}

export function formatNutrient(key, value) {
  return value.toFixed(displayDecimals(key));
}

// 依顯示規則四捨五入後的數值，讓判斷結果和畫面上看到的一致。
export function roundForDisplay(key, value) {
  return Number(formatNutrient(key, value));
}

// 檢查一個完整的食物項目，有問題就丟出錯誤（訊息給使用者看）。
function validateItem(item) {
  if (typeof item.name !== "string" || item.name.trim() === "") {
    throw new Error("食物名稱不能空白");
  }
  for (const k of NUTRIENTS) {
    const v = item[k];
    if (typeof v !== "number" || !Number.isFinite(v) || v < 0) {
      throw new Error(`${NUTRIENT_LABELS[k]}必須是 0 或正數`);
    }
  }
}

// 加總食物項目的 5 項營養。總數不儲存，每次都即時算。
export function sumNutrients(items) {
  const totals = Object.fromEntries(NUTRIENTS.map((k) => [k, 0]));
  for (const item of items) {
    for (const k of NUTRIENTS) totals[k] += item[k];
  }
  return totals;
}

// 草稿：正在編輯、還沒確認儲存的一餐。有 id 表示是在修改已存的一餐。
// 可以預先帶入食物項目和縮圖照片（例如 AI 分析的結果）。
export function createMealDraft({ id, at, mealType, items = [], photos = [], source = "manual" }) {
  const prefilled = items.map((i) => ({ ...i, id: i.id ?? crypto.randomUUID() }));
  prefilled.forEach(validateItem);
  return {
    id,
    at,
    mealType,
    items: prefilled,
    photos: [...photos],
    source,

    addItem(fields) {
      const item = { id: crypto.randomUUID(), ...fields };
      validateItem(item);
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

    removeItem(id) {
      this.items = this.items.filter((i) => i.id !== id);
    },

    totals() {
      return sumNutrients(this.items);
    },

    // 轉成要儲存的資料（不含方法，也不存總數）。
    toRecord() {
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
