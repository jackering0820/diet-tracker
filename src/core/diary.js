// 日記核心（Diary Core）：所有業務規則都在這裡，也是唯一的測試 seam。
// 資料儲存（storage）和時間（clock）由外部注入。
import { addDays, atTimeOnDay, dayKeyOf, dayRange, isDayKey, validateAt } from "./day.js";
import { createMealDraft, defaultMealType, mealTitle, sumNutrients } from "./meal.js";
import { goalProgress, validateGoals, withDefaults } from "./goals.js";
import { ANALYSIS_ERRORS, AnalysisError } from "./analysis-error.js";
import { buildBackup, parseBackup } from "./backup.js";
import { constellationLit, validateWaterMl } from "./water.js";
import { DEFAULT_MODEL, isBlankKey, keyStatus, normalizeKey, validateModel } from "./ai-settings.js";
import { WATER_MEASURE } from "./measures.js";

const WATER = "water";
const MEALS = "meals";
const SETTINGS = "settings";
const GOALS_ID = "goals";
// 金鑰和目標存在同一張 settings 表；做備份（#9）時必須排除金鑰，不能整張表匯出。
const API_KEY_ID = "apiKey";
const MODEL_ID = "model";
const LAST_EXPORT_ID = "lastExport";

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
      .map((meal) => ({ ...meal, title: mealTitle(meal.items), totals: sumNutrients(meal.items) }));
    const waterTotalMl = water.reduce((sum, w) => sum + w.ml, 0);
    const nutritionTotals = sumNutrients(meals.flatMap((m) => m.items));
    const hasRecords = meals.length + water.length > 0;
    const goals = await getGoals();
    return {
      dayKey,
      hasRecords,
      water,
      waterTotalMl,
      constellationLit: constellationLit(waterTotalMl, goals[WATER_MEASURE.key]),
      meals,
      nutritionTotals,
      progress: goalProgress({ ...nutritionTotals, [WATER_MEASURE.key]: waterTotalMl }, goals, hasRecords),
    };
  }

  return {
    todayKey,

    // 要打開的某一天（"YYYY-MM-DD"）；格式不對、日曆上不存在或在今天以後時是今天（不能在未來補記）。
    dayOrToday(dayKey) {
      const today = todayKey();
      return isDayKey(dayKey) && dayKey < today ? dayKey : today;
    },

    // 新紀錄的預設時間：今天就是現在；補記過去的日子時，用那一天的「現在這個時刻」。
    timeForNewRecord(dayKey) {
      const now = clock.now();
      return dayKey === todayKey() ? now.getTime() : atTimeOnDay(dayKey, now);
    },

    // at：補記時指定的時間（毫秒時間戳），沒給就是現在。
    async addWater(ml, at = clock.now().getTime()) {
      const entry = { id: crypto.randomUUID(), at: validateAt(at), ml: validateWaterMl(ml) };
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
      if (!saved?.key) throw new AnalysisError(ANALYSIS_ERRORS.NO_API_KEY);
      const items = await analyzer.analyze({ apiKey: saved.key, model: await getModel(), photos: draft.photos });
      try {
        draft.applyAnalysis(items);
      } catch {
        // AI 給的內容沒通過檢查（例如名稱空白），不是使用者輸入錯誤。
        throw new AnalysisError(ANALYSIS_ERRORS.INVALID_RESPONSE);
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

    // 匯出備份：餐點（含縮圖）、喝水、目標。不包含 API 金鑰。
    // 產生備份檔的內容。這時還沒存到手機，所以不算「已備份」。
    async exportBackup() {
      return buildBackup({
        meals: await storage.listAll(MEALS),
        water: await storage.listAll(WATER),
        goals: await getGoals(),
        exportedAt: clock.now().toISOString(),
      });
    },

    // 備份檔確定交給手機儲存之後才呼叫；使用者取消儲存時不要呼叫，提醒才會繼續出現。
    async markExported() {
      await storage.put(SETTINGS, { id: LAST_EXPORT_ID, at: clock.now().getTime() });
    },

    // 上次匯出備份的時間（毫秒時間戳），沒匯出過是 null。
    async getLastExportAt() {
      return (await storage.get(SETTINGS, LAST_EXPORT_ID))?.at ?? null;
    },

    // 匯入備份：整份取代餐點、喝水和目標；API 金鑰和模型設定保留不變。
    async importBackup(text) {
      const backup = parseBackup(text); // 先完整檢查；有問題就丟出錯誤，什麼都不寫入
      await storage.batch([
        { type: "clear", name: MEALS },
        { type: "clear", name: WATER },
        ...backup.meals.map((record) => ({ type: "put", name: MEALS, record })),
        ...backup.water.map((record) => ({ type: "put", name: WATER, record })),
        { type: "put", name: SETTINGS, record: { id: GOALS_ID, goals: backup.goals } },
      ]);
    },

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
