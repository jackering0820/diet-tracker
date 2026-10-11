import { test } from "node:test";
import assert from "node:assert/strict";
import { setup } from "./helpers.js";
import { createDiary } from "../src/core/diary.js";

const VEG = { name: "燙青菜", portion: "一盤", kcal: 60, protein: 2, carbs: 5, fat: 3, veg: 1 };

test("第一次使用時蔬菜目標是 3 份，其他目標未設定也不判斷達標", async () => {
  const { diary } = setup();
  assert.deepEqual(await diary.getGoals(), { kcal: null, protein: null, veg: 3, waterMl: null });

  const meal = diary.newMealDraft({ items: [VEG, VEG, VEG] });
  await diary.saveMeal(meal);
  const { progress } = await diary.getDaySummary(diary.todayKey());

  assert.deepEqual(progress.veg, { value: 3, goal: 3, achieved: true });
  assert.deepEqual(progress.kcal, { value: 180, goal: null, achieved: null });
  assert.equal(progress.protein.achieved, null);
  assert.equal(progress.waterMl.achieved, null);
});

test("設定的目標會保存，重新打開 App 後仍然存在；留空表示未設定", async () => {
  const { diary, storage, clock } = setup();
  await diary.setGoals({ kcal: 1800, protein: 90, veg: null, waterMl: 2000 });

  const reopened = createDiary({ storage, clock });
  assert.deepEqual(await reopened.getGoals(), { kcal: 1800, protein: 90, veg: null, waterMl: 2000 });
});

test("目標是負數或不是數字時拒絕儲存，原本的目標不變", async () => {
  const { diary } = setup();
  await diary.setGoals({ kcal: 1800, protein: 90, veg: 3, waterMl: 2000 });

  await assert.rejects(diary.setGoals({ kcal: -1, protein: 90, veg: 3, waterMl: 2000 }), /熱量/);
  await assert.rejects(diary.setGoals({ kcal: 1800, protein: NaN, veg: 3, waterMl: 2000 }), /蛋白質/);
  await assert.rejects(diary.setGoals({ kcal: 1800, protein: 90, veg: "3", waterMl: 2000 }), /蔬菜/);
  await assert.rejects(diary.setGoals({ kcal: 1800, protein: 90, veg: 3, waterMl: -500 }), /喝水/);

  assert.deepEqual(await diary.getGoals(), { kcal: 1800, protein: 90, veg: 3, waterMl: 2000 });
});

// 建立一天：一餐（指定熱量、蛋白質、蔬菜）加一筆喝水，回傳 4 項是否達標。
async function achievedFor({ kcal, protein, veg, waterMl }) {
  const { diary } = setup();
  await diary.setGoals({ kcal: 1800, protein: 90, veg: 3, waterMl: 2000 });
  await diary.saveMeal(diary.newMealDraft({ items: [{ name: "一天的飲食", portion: "", kcal, protein, carbs: 0, fat: 0, veg }] }));
  await diary.addWater(waterMl);
  const { progress } = await diary.getDaySummary(diary.todayKey());
  return Object.fromEntries(Object.entries(progress).map(([k, p]) => [k, p.achieved]));
}

test("剛好等於目標：4 項都達標", async () => {
  assert.deepEqual(
    await achievedFor({ kcal: 1800, protein: 90, veg: 3, waterMl: 2000 }),
    { kcal: true, protein: true, veg: true, waterMl: true },
  );
});

test("略高於目標：熱量超過上限未達標，其他 3 項達標", async () => {
  assert.deepEqual(
    await achievedFor({ kcal: 1801, protein: 90.5, veg: 3.5, waterMl: 2250 }),
    { kcal: false, protein: true, veg: true, waterMl: true },
  );
});

test("略低於目標：熱量在上限內達標，其他 3 項未達標", async () => {
  assert.deepEqual(
    await achievedFor({ kcal: 1799, protein: 89.5, veg: 2.5, waterMl: 1750 }),
    { kcal: true, protein: false, veg: false, waterMl: false },
  );
});

test("達標判斷和畫面顯示一致：顯示成剛好等於目標的數字，就算剛好達標", async () => {
  // 熱量 1800.4 顯示為「1800」、蛋白質 89.96 顯示為「90.0」，看起來都剛好等於目標。
  assert.deepEqual(
    await achievedFor({ kcal: 1800.4, protein: 89.96, veg: 3, waterMl: 2000 }),
    { kcal: true, protein: true, veg: true, waterMl: true },
  );
});
