import { test } from "node:test";
import assert from "node:assert/strict";
import { createDiary } from "../src/core/diary.js";
import { createMemoryStorage } from "../src/adapters/memory-storage.js";

function setup(now = new Date(2026, 9, 11, 12, 0)) {
  const storage = createMemoryStorage();
  const clock = { now: () => now };
  return { diary: createDiary({ storage, clock }), storage, clock };
}

test("記錄一筆 250ml 喝水後，今天的喝水總量是 250ml", async () => {
  const { diary } = setup();
  await diary.addWater(250);
  const day = await diary.getDaySummary(diary.todayKey());
  assert.equal(day.waterTotalMl, 250);
});

test("刪除按錯的喝水紀錄後，總量扣掉那一筆", async () => {
  const { diary } = setup();
  await diary.addWater(500);
  const mistake = await diary.addWater(250);
  await diary.deleteWater(mistake.id);
  const day = await diary.getDaySummary(diary.todayKey());
  assert.equal(day.waterTotalMl, 500);
  assert.equal(day.water.length, 1);
});

test("喝水量是 0、負數或不是數字時拒絕記錄，總量不變", async () => {
  const { diary } = setup();
  for (const bad of [0, -250, NaN, "abc", Infinity]) {
    await assert.rejects(diary.addWater(bad), /喝水量/);
  }
  const day = await diary.getDaySummary(diary.todayKey());
  assert.equal(day.waterTotalMl, 0);
});

test("23:59 和隔天 00:00 的喝水紀錄分屬兩天", async () => {
  const { diary, clock } = setup(new Date(2026, 9, 11, 23, 59));
  await diary.addWater(250);
  clock.now = () => new Date(2026, 9, 12, 0, 0);
  await diary.addWater(500);

  assert.equal((await diary.getDaySummary("2026-10-11")).waterTotalMl, 250);
  assert.equal((await diary.getDaySummary("2026-10-12")).waterTotalMl, 500);
  assert.equal(diary.todayKey(), "2026-10-12");
});

test("重新打開 App 後，今天的喝水紀錄依時間排序列出", async () => {
  const { diary, storage, clock } = setup(new Date(2026, 9, 11, 15, 0));
  await diary.addWater(500);
  clock.now = () => new Date(2026, 9, 11, 9, 30);
  await diary.addWater(250);

  const reopened = createDiary({ storage, clock });
  const day = await reopened.getDaySummary("2026-10-11");
  assert.deepEqual(
    day.water.map((w) => [new Date(w.at).getHours(), w.ml]),
    [[9, 250], [15, 500]],
  );
});
