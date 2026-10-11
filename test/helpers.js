import { createDiary } from "../src/core/diary.js";
import { createMemoryStorage } from "../src/adapters/memory-storage.js";

// 建立一個使用記憶體版儲存和固定時間的日記核心。
export function setup(now = new Date(2026, 9, 11, 12, 0)) {
  const storage = createMemoryStorage();
  const clock = { now: () => now };
  return { diary: createDiary({ storage, clock }), storage, clock };
}
