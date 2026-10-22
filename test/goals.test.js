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

  assert.deepEqual(progress.veg, { value: 3, goal: 3, status: "achieved" });
  assert.deepEqual(progress.kcal, { value: 180, goal: null, status: "unset" });
  assert.equal(progress.protein.status, "unset");
  assert.equal(progress.waterMl.status, "unset");
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

// 建立一天：一餐（指定熱量、蛋白質、蔬菜）加一筆喝水，回傳 4 項的狀態。
async function achievedFor({ kcal, protein, veg, waterMl }) {
  const { diary } = setup();
  await diary.setGoals({ kcal: 1800, protein: 90, veg: 3, waterMl: 2000 });
  await diary.saveMeal(diary.newMealDraft({ items: [{ name: "一天的飲食", portion: "", kcal, protein, carbs: 0, fat: 0, veg }] }));
  await diary.addWater(waterMl);
  const { progress } = await diary.getDaySummary(diary.todayKey());
  return Object.fromEntries(Object.entries(progress).map(([k, p]) => [k, p.status]));
}

test("剛好等於目標：4 項都達標", async () => {
  assert.deepEqual(
    await achievedFor({ kcal: 1800, protein: 90, veg: 3, waterMl: 2000 }),
    { kcal: "achieved", protein: "achieved", veg: "achieved", waterMl: "achieved" },
  );
});

test("略高於目標：熱量超過上限未達標，其他 3 項達標", async () => {
  assert.deepEqual(
    await achievedFor({ kcal: 1801, protein: 90.5, veg: 3.5, waterMl: 2250 }),
    { kcal: "over", protein: "achieved", veg: "achieved", waterMl: "achieved" },
  );
});

test("略低於目標：熱量在上限內達標，其他 3 項未達標", async () => {
  assert.deepEqual(
    await achievedFor({ kcal: 1799, protein: 89.5, veg: 2.5, waterMl: 1750 }),
    { kcal: "achieved", protein: "missed", veg: "missed", waterMl: "missed" },
  );
});

test("刻意的設計：用顯示出來的數字判斷，畫面上剛好等於目標就算達標（不用未四捨五入的原始數字）", async () => {
  // 熱量 1800.4 顯示為「1800」、蛋白質 89.96 顯示為「90.0」，看起來都剛好等於目標。
  assert.deepEqual(
    await achievedFor({ kcal: 1800.4, protein: 89.96, veg: 3, waterMl: 2000 }),
    { kcal: "achieved", protein: "achieved", veg: "achieved", waterMl: "achieved" },
  );
});

test("每一項回傳狀態：熱量超過上限是 over，下限未達到是 missed，未設定是 unset", async () => {
  const { diary } = setup();
  await diary.setGoals({ kcal: 1800, protein: 90, veg: 3, waterMl: null });
  await diary.saveMeal(diary.newMealDraft({ items: [{ name: "大餐", portion: "", kcal: 1900, protein: 95, carbs: 0, fat: 0, veg: 2 }] }));
  const { progress } = await diary.getDaySummary(diary.todayKey());
  assert.deepEqual(
    Object.fromEntries(Object.entries(progress).map(([k, p]) => [k, p.status])),
    { kcal: "over", protein: "achieved", veg: "missed", waterMl: "unset" },
  );
});

test("設定了目標之後又清空，那一項就不再判斷達標", async () => {
  const { diary } = setup();
  await diary.setGoals({ kcal: 1800, protein: 90, veg: 3, waterMl: 2000 });
  await diary.setGoals({ kcal: 1800, protein: null, veg: 3, waterMl: 2000 });
  const { progress } = await diary.getDaySummary(diary.todayKey());
  assert.equal(progress.protein.goal, null);
  assert.equal(progress.protein.status, "unset");
});

test("儲存目標時四捨五入到畫面顯示的位數：存的數字就是看到的數字", async () => {
  const { diary } = setup();
  await diary.setGoals({ kcal: 1800.4, protein: 90.25, veg: 2.25, waterMl: 2000.6 });

  assert.deepEqual(await diary.getGoals(), { kcal: 1800, protein: 90.3, veg: 2.3, waterMl: 2001 });
});

test("改版前就存著的目標（例如 2.25 份），讀取時也照同樣規則四捨五入，不需要另外轉換資料", async () => {
  const { diary, storage } = setup();
  // 改版前的 App 會原樣存下使用者輸入的數字
  await storage.put("settings", { id: "goals", goals: { kcal: 1800.4, protein: 90.25, veg: 2.25, waterMl: 2000.6 } });

  assert.deepEqual(await diary.getGoals(), { kcal: 1800, protein: 90.3, veg: 2.3, waterMl: 2001 });
});

test("畫面寫「2.3 / 2.3」就一定是達標：目標輸入 2.34 份、吃了 2.3 份", async () => {
  const { diary } = setup();
  await diary.setGoals({ kcal: null, protein: null, veg: 2.34, waterMl: null });
  await diary.saveMeal(diary.newMealDraft({ items: [{ ...VEG, veg: 2.3 }] }));

  const { progress } = await diary.getDaySummary(diary.todayKey());
  assert.deepEqual(progress.veg, { value: 2.3, goal: 2.3, status: "achieved" });
});
