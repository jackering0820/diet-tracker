import { test } from "node:test";
import assert from "node:assert/strict";
import { setup } from "./helpers.js";

const GOALS = { kcal: 1800, protein: 90, veg: 3, waterMl: 2000 };
const statuses = (progress) => Object.fromEntries(Object.entries(progress).map(([k, p]) => [k, p.status]));

test("一整天沒有任何紀錄時，已設定的目標都是「無紀錄」，未設定的仍是未設定", async () => {
  const { diary } = setup();
  await diary.setGoals({ ...GOALS, protein: null });
  const { progress } = await diary.getDaySummary(diary.todayKey());
  assert.deepEqual(statuses(progress), { kcal: "noRecords", protein: "unset", veg: "noRecords", waterMl: "noRecords" });
});

const DAY_FOOD = { name: "一天的飲食", portion: "", kcal: 1700, protein: 95, carbs: 200, fat: 50, veg: 3 };

test("歷史列表從今天往前列出每天的狀態，沒有紀錄的日子是「無紀錄」，並可以往前翻頁", async () => {
  const { diary, clock } = setup(new Date(2026, 9, 9, 20, 0));
  await diary.setGoals(GOALS);
  await diary.addWater(1500); // 10/9：只有喝水
  clock.now = () => new Date(2026, 9, 11, 12, 0);
  await diary.saveMeal(diary.newMealDraft({ items: [DAY_FOOD] })); // 10/11：吃了，沒喝水
  // 10/10：完全沒有紀錄

  const page = await diary.getHistory({ days: 3 });
  assert.deepEqual(page.map((d) => [d.dayKey, statuses(d.progress)]), [
    ["2026-10-11", { kcal: "achieved", protein: "achieved", veg: "achieved", waterMl: "missed" }],
    ["2026-10-10", { kcal: "noRecords", protein: "noRecords", veg: "noRecords", waterMl: "noRecords" }],
    ["2026-10-09", { kcal: "achieved", protein: "missed", veg: "missed", waterMl: "missed" }],
  ]);

  assert.deepEqual(page.map((d) => d.hasRecords), [true, false, true]);

  const older = await diary.getHistory({ before: "2026-10-09", days: 2 });
  assert.deepEqual(older.map((d) => d.dayKey), ["2026-10-08", "2026-10-07"]);
});

test("可以在過去某一天補記喝水和一餐，餐別依補記的時間預設，今天不受影響", async () => {
  const { diary } = setup(new Date(2026, 9, 11, 12, 0));
  await diary.addWater(500, new Date(2026, 9, 9, 8, 0).getTime());
  const dinner = diary.newMealDraft({ at: new Date(2026, 9, 9, 19, 0).getTime(), items: [DAY_FOOD] });
  assert.equal(dinner.mealType, "晚餐");
  await diary.saveMeal(dinner);

  const past = await diary.getDaySummary("2026-10-09");
  assert.equal(past.waterTotalMl, 500);
  assert.deepEqual(past.meals.map((m) => m.mealType), ["晚餐"]);
  const today = await diary.getDaySummary("2026-10-11");
  assert.equal(today.meals.length + today.water.length, 0);
});

test("修改喝水和一餐的日期時間後，紀錄從原本那天移到新的那天，兩天的總數都正確", async () => {
  const { diary } = setup(new Date(2026, 9, 11, 12, 0));
  const water = await diary.addWater(500);
  await diary.addWater(250);
  const lunch = await diary.saveMeal(diary.newMealDraft({ items: [DAY_FOOD] }));

  const yesterdayNight = new Date(2026, 9, 10, 21, 0).getTime();
  await diary.moveWater(water.id, yesterdayNight);
  const editing = await diary.loadMealDraft(lunch.id);
  editing.at = yesterdayNight;
  await diary.saveMeal(editing);

  const today = await diary.getDaySummary("2026-10-11");
  const yesterday = await diary.getDaySummary("2026-10-10");
  assert.deepEqual([today.waterTotalMl, today.nutritionTotals.kcal], [250, 0]);
  assert.deepEqual([yesterday.waterTotalMl, yesterday.nutritionTotals.kcal], [500, 1700]);
});

test("修改成無效的日期時間時拒絕，紀錄留在原本那天", async () => {
  const { diary } = setup(new Date(2026, 9, 11, 12, 0));
  const water = await diary.addWater(500);
  await assert.rejects(diary.moveWater(water.id, NaN), /日期時間/);
  const draft = diary.newMealDraft({ items: [DAY_FOOD] });
  draft.at = NaN;
  await assert.rejects(diary.saveMeal(draft), /日期時間/);

  const today = await diary.getDaySummary("2026-10-11");
  assert.deepEqual([today.waterTotalMl, today.meals.length], [500, 0]);
});
