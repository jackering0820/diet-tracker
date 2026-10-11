// 日記核心（Diary Core）：所有業務規則都在這裡，也是唯一的測試 seam。
// 資料儲存（storage）和時間（clock）由外部注入。
import { dayKeyOf, dayRange } from "./day.js";
import { createMealDraft, defaultMealType, sumNutrients } from "./meal.js";

const WATER = "water";
const MEALS = "meals";

const byTime = (a, b) => a.at - b.at;

export function createDiary({ storage, clock }) {
  return {
    todayKey() {
      return dayKeyOf(clock.now());
    },

    async addWater(ml) {
      if (typeof ml !== "number" || !Number.isFinite(ml) || ml <= 0) {
        throw new Error("喝水量必須是大於 0 的數字");
      }
      const entry = { id: crypto.randomUUID(), at: clock.now().getTime(), ml };
      await storage.put(WATER, entry);
      return entry;
    },

    async deleteWater(id) {
      await storage.delete(WATER, id);
    },

    newMealDraft() {
      const now = clock.now();
      return createMealDraft({ at: now.getTime(), mealType: defaultMealType(now) });
    },

    async saveMeal(draft) {
      const meal = draft.toRecord();
      await storage.put(MEALS, meal);
      return meal;
    },

    async editMeal(id) {
      const meal = await storage.get(MEALS, id);
      if (!meal) throw new Error("找不到這一餐");
      return createMealDraft(meal);
    },

    async deleteMeal(id) {
      await storage.delete(MEALS, id);
    },

    async getDaySummary(dayKey) {
      const { from, to } = dayRange(dayKey);
      const water = (await storage.listByTime(WATER, from, to)).sort(byTime);
      const meals = (await storage.listByTime(MEALS, from, to))
        .sort(byTime)
        .map((meal) => ({ ...meal, totals: sumNutrients(meal.items) }));
      return {
        dayKey,
        water,
        waterTotalMl: water.reduce((sum, w) => sum + w.ml, 0),
        meals,
        nutritionTotals: sumNutrients(meals.flatMap((m) => m.items)),
      };
    },
  };
}
