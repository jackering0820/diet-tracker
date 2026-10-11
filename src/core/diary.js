// 日記核心（Diary Core）：所有業務規則都在這裡，也是唯一的測試 seam。
// 資料儲存（storage）和時間（clock）由外部注入。
import { dayKeyOf, dayRange } from "./day.js";

const WATER = "water";

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

    async getDaySummary(dayKey) {
      const { from, to } = dayRange(dayKey);
      const water = (await storage.listByTime(WATER, from, to)).sort((a, b) => a.at - b.at);
      return {
        dayKey,
        water,
        waterTotalMl: water.reduce((sum, w) => sum + w.ml, 0),
      };
    },
  };
}
