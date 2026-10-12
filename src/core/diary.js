// 日記核心（Diary Core）：所有業務規則都在這裡，也是唯一的測試 seam。
// 資料儲存（storage）和時間（clock）由外部注入。
import { addDays, atTimeOnDay, dayKeyOf, dayRange, validateAt } from "./day.js";
import { createMealDraft, defaultMealType, sumNutrients } from "./meal.js";
import { goalProgress, validateGoals, withDefaults } from "./goals.js";
import { ANALYSIS_ERRORS, AnalysisError } from "./analysis-error.js";
import { DEFAULT_MODEL, isBlankKey, keyStatus, normalizeKey, validateModel } from "./ai-settings.js";

const WATER = "water";
const MEALS = "meals";
const SETTINGS = "settings";
const GOALS_ID = "goals";
// 金鑰和目標存在同一張 settings 表；做備份（#9）時必須排除金鑰，不能整張表匯出。
const API_KEY_ID = "apiKey";
const MODEL_ID = "model";

const byTime = (a, b) => a.at - b.at;


// analyzer：AI 分析轉接器（測試時使用假的 transport）。
export function createDiary({ storage, clock, analyzer }) {
  async function getGoals() {
    const saved = await storage.get(SETTINGS, GOALS_ID);
    return withDefaults(saved?.goals);
  }

  async function getModel() {
    const saved = await storage.get(SETTINGS, MODEL_ID);
    return saved?.model ?? DEFAULT_MODEL;
  }

  function todayKey() {
    return dayKeyOf(clock.now());
  }

  async function getDaySummary(dayKey) {
    const { from, to } = dayRange(dayKey);
    const water = (await storage.listByTime(WATER, from, to)).sort(byTime);
    const meals = (await storage.listByTime(MEALS, from, to))
      .sort(byTime)
      .map((meal) => ({ ...meal, totals: sumNutrients(meal.items) }));
    const waterTotalMl = water.reduce((sum, w) => sum + w.ml, 0);
    const nutritionTotals = sumNutrients(meals.flatMap((m) => m.items));
    const hasRecords = meals.length + water.length > 0;
    return {
      dayKey,
      hasRecords,
      water,
      waterTotalMl,
      meals,
      nutritionTotals,
      progress: goalProgress(
        { ...nutritionTotals, waterMl: waterTotalMl },
        await getGoals(),
        hasRecords,
      ),
    };
  }

  return {
    todayKey,

    // 新紀錄的預設時間：今天就是現在；補記過去的日子時，用那一天的「現在這個時刻」。
    timeForNewRecord(dayKey) {
      const now = clock.now();
      return dayKey === todayKey() ? now.getTime() : atTimeOnDay(dayKey, now);
    },

    // at：補記時指定的時間（毫秒時間戳），沒給就是現在。
    async addWater(ml, at = clock.now().getTime()) {
      if (typeof ml !== "number" || !Number.isFinite(ml) || ml <= 0) {
        throw new Error("喝水量必須是大於 0 的數字");
      }
      const entry = { id: crypto.randomUUID(), at: validateAt(at), ml };
      await storage.put(WATER, entry);
      return entry;
    },

    // 修改一筆喝水的日期時間，紀錄會移到新的那一天。
    async moveWater(id, at) {
      validateAt(at);
      const entry = await storage.get(WATER, id);
      if (!entry) throw new Error("找不到這筆喝水紀錄");
      await storage.put(WATER, { ...entry, at });
    },

    async deleteWater(id) {
      await storage.delete(WATER, id);
    },

    // at：補記時指定的時間（毫秒時間戳），沒給就是現在。餐別依這個時間預設。
    newMealDraft({ at = clock.now().getTime(), items, photos } = {}) {
      validateAt(at);
      return createMealDraft({ at, mealType: defaultMealType(new Date(at)), items, photos });
    },

    async saveMeal(draft) {
      const meal = draft.toRecord();
      await storage.put(MEALS, meal);
      return meal;
    },

    // 用 AI 分析草稿的照片，結果放進草稿的食物項目（還沒儲存）。
    // 金鑰只在這裡讀取並交給轉接器，不會回傳給畫面。
    async analyzeDraft(draft) {
      const saved = await storage.get(SETTINGS, API_KEY_ID);
      if (!saved?.key) throw new AnalysisError(ANALYSIS_ERRORS.NO_API_KEY, "還沒設定 API 金鑰，請先到設定頁貼上金鑰");
      const items = await analyzer.analyze({ apiKey: saved.key, model: await getModel(), photos: draft.photos });
      try {
        draft.applyAnalysis(items);
      } catch {
        // AI 給的內容沒通過檢查（例如名稱空白），不是使用者輸入錯誤。
        throw new AnalysisError(ANALYSIS_ERRORS.INVALID_RESPONSE, "AI 的回覆無法解讀");
      }
    },

    async loadMealDraft(id) {
      const meal = await storage.get(MEALS, id);
      if (!meal) throw new Error("找不到這一餐");
      return createMealDraft(meal);
    },

    async deleteMeal(id) {
      await storage.delete(MEALS, id);
    },

    getGoals,

    async setGoals(goals) {
      await storage.put(SETTINGS, { id: GOALS_ID, goals: validateGoals(goals) });
    },

    getDaySummary,

    async getApiKeyStatus() {
      const saved = await storage.get(SETTINGS, API_KEY_ID);
      return keyStatus(saved?.key);
    },

    async setApiKey(key) {
      await storage.put(SETTINGS, { id: API_KEY_ID, key: normalizeKey(key) });
    },

    getModel,

    async setModel(model) {
      await storage.put(SETTINGS, { id: MODEL_ID, model: validateModel(model) });
    },

    // 設定頁一次儲存 AI 設定：金鑰留空表示不更換（還沒有金鑰就維持未設定），模型一律儲存。
    // 先檢查完兩項才寫入，有任何一項不對就整組不存。
    async saveAiSettings({ key, model }) {
      const newKey = isBlankKey(key) ? null : normalizeKey(key);
      validateModel(model);
      if (newKey !== null) await storage.put(SETTINGS, { id: API_KEY_ID, key: newKey });
      await storage.put(SETTINGS, { id: MODEL_ID, model });
    },

    // 歷史列表：從 before 的前一天（沒給就從今天）往前列出 days 天，新的在前。
    async getHistory({ before, days }) {
      if (!Number.isInteger(days) || days < 1) throw new Error("歷史列表的天數必須是正整數");
      const newest = before ? addDays(before, -1) : todayKey();
      const keys = Array.from({ length: days }, (_, i) => addDays(newest, -i));
      return Promise.all(keys.map(getDaySummary));
    },
  };
}
