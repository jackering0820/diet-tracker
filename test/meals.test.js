import { test } from "node:test";
import assert from "node:assert/strict";
import { setup } from "./helpers.js";
import { formatMeasure } from "../src/core/measures.js";

test("依建立時間預設餐別，每個時間邊界都正確", () => {
  const cases = [
    [3, 59, "點心"],
    [4, 0, "早餐"],
    [10, 29, "早餐"],
    [10, 30, "午餐"],
    [14, 29, "午餐"],
    [14, 30, "點心"],
    [16, 59, "點心"],
    [17, 0, "晚餐"],
    [21, 29, "晚餐"],
    [21, 30, "點心"],
  ];
  for (const [h, m, expected] of cases) {
    const { diary } = setup(new Date(2026, 9, 11, h, m));
    assert.equal(diary.newMealDraft().mealType, expected, `${h}:${String(m).padStart(2, "0")}`);
  }
});

test("草稿新增、修改、刪除食物項目後，這餐的總數自動重算", () => {
  const { diary } = setup();
  const draft = diary.newMealDraft();

  const rice = draft.addItem({ name: "白飯", portion: "一碗", kcal: 280, protein: 4.8, carbs: 62, fat: 0.5, veg: 0 });
  draft.addItem({ name: "燙青菜", portion: "一盤", kcal: 60, protein: 2, carbs: 5, fat: 3.5, veg: 1 });
  const tea = draft.addItem({ name: "紅茶", portion: "中杯", kcal: 90, protein: 0, carbs: 22, fat: 0, veg: 0 });
  assert.deepEqual(draft.totals(), { kcal: 430, protein: 6.8, carbs: 89, fat: 4, veg: 1 });

  draft.updateItem(rice.id, { portion: "半碗", kcal: 140, protein: 2.4, carbs: 31, fat: 0.25 });
  draft.removeItem(tea.id);
  assert.deepEqual(draft.totals(), { kcal: 200, protein: 4.4, carbs: 36, fat: 3.75, veg: 1 });
  assert.deepEqual(draft.items.map((i) => i.portion), ["半碗", "一盤"]);
});

test("食物項目的營養數字是負數或不是數字、或名稱空白時拒絕，草稿不變", () => {
  const { diary } = setup();
  const draft = diary.newMealDraft();
  const ok = { name: "茶葉蛋", portion: "1 顆", kcal: 75, protein: 7, carbs: 1, fat: 5, veg: 0 };
  const egg = draft.addItem(ok);

  assert.throws(() => draft.addItem({ ...ok, kcal: -1 }), /熱量/);
  assert.throws(() => draft.addItem({ ...ok, protein: NaN }), /蛋白質/);
  assert.throws(() => draft.addItem({ ...ok, veg: "abc" }), /蔬菜/);
  assert.throws(() => draft.addItem({ ...ok, name: "  " }), /名稱/);
  assert.throws(() => draft.updateItem(egg.id, { fat: -2 }), /脂肪/);

  assert.equal(draft.items.length, 1);
  assert.deepEqual(draft.totals(), { kcal: 75, protein: 7, carbs: 1, fat: 5, veg: 0 });
});

const BENTO = { name: "雞腿便當", portion: "一個", kcal: 800, protein: 35, carbs: 95, fat: 30, veg: 1.5 };
const SOY_MILK = { name: "無糖豆漿", portion: "中杯", kcal: 120, protein: 11, carbs: 5, fat: 6, veg: 0 };

test("確認儲存前草稿不算進今天；儲存後出現在今天的餐點與 5 項總數", async () => {
  const { diary, clock } = setup(new Date(2026, 9, 11, 12, 15));
  const draft = diary.newMealDraft();
  draft.addItem(BENTO);

  const before = await diary.getDaySummary("2026-10-11");
  assert.equal(before.meals.length, 0);
  assert.deepEqual(before.nutritionTotals, { kcal: 0, protein: 0, carbs: 0, fat: 0, veg: 0 });

  await diary.saveMeal(draft);
  clock.now = () => new Date(2026, 9, 11, 8, 0);
  const breakfast = diary.newMealDraft();
  breakfast.addItem(SOY_MILK);
  await diary.saveMeal(breakfast);

  const after = await diary.getDaySummary("2026-10-11");
  assert.deepEqual(after.meals.map((m) => [m.mealType, m.totals.kcal]), [["早餐", 120], ["午餐", 800]]);
  assert.deepEqual(after.nutritionTotals, { kcal: 920, protein: 46, carbs: 100, fat: 36, veg: 1.5 });
});

test("重新打開已存的一餐修改項目和餐別，存回去後今天只有這一餐且內容已更新", async () => {
  const { diary } = setup(new Date(2026, 9, 11, 12, 15));
  const draft = diary.newMealDraft();
  const bento = draft.addItem(BENTO);
  const saved = await diary.saveMeal(draft);

  const editing = await diary.loadMealDraft(saved.id);
  assert.equal(editing.mealType, "午餐");
  assert.deepEqual(editing.totals(), { kcal: 800, protein: 35, carbs: 95, fat: 30, veg: 1.5 });
  editing.mealType = "晚餐";
  editing.updateItem(bento.id, { kcal: 700 });
  editing.addItem(SOY_MILK);
  await diary.saveMeal(editing);

  const day = await diary.getDaySummary("2026-10-11");
  assert.equal(day.meals.length, 1);
  assert.equal(day.meals[0].mealType, "晚餐");
  assert.equal(day.nutritionTotals.kcal, 820);
});

test("刪除整餐後，今天不再列出這一餐，總數也扣掉", async () => {
  const { diary } = setup(new Date(2026, 9, 11, 12, 15));
  const lunch = diary.newMealDraft();
  lunch.addItem(BENTO);
  const savedLunch = await diary.saveMeal(lunch);
  const drink = diary.newMealDraft();
  drink.addItem(SOY_MILK);
  await diary.saveMeal(drink);

  await diary.deleteMeal(savedLunch.id);

  const day = await diary.getDaySummary("2026-10-11");
  assert.deepEqual(day.meals.map((m) => m.items[0].name), ["無糖豆漿"]);
  assert.equal(day.nutritionTotals.kcal, 120);
});

test("營養數字的顯示：熱量取整數，其他取到小數點後一位", () => {
  assert.equal(formatMeasure("kcal", 819.6), "820");
  assert.equal(formatMeasure("kcal", 0), "0");
  assert.equal(formatMeasure("protein", 0.1 + 0.2), "0.3");
  assert.equal(formatMeasure("fat", 3.75), "3.8");
  assert.equal(formatMeasure("veg", 2), "2.0");
});

test("沒有任何食物的一餐不能儲存", async () => {
  const { diary } = setup();
  await assert.rejects(diary.saveMeal(diary.newMealDraft()), /至少/);
  const day = await diary.getDaySummary(diary.todayKey());
  assert.equal(day.meals.length, 0);
});

test("同一份草稿存兩次（例如連按兩次儲存），今天還是只有一餐", async () => {
  const { diary } = setup();
  const draft = diary.newMealDraft();
  draft.addItem(BENTO);
  await diary.saveMeal(draft);
  await diary.saveMeal(draft);
  const day = await diary.getDaySummary(diary.todayKey());
  assert.equal(day.meals.length, 1);
});

test("修改不存在的食物項目時明確報錯，草稿不變", () => {
  const { diary } = setup();
  const draft = diary.newMealDraft();
  draft.addItem(SOY_MILK);
  assert.throws(() => draft.updateItem("not-there", BENTO), /找不到/);
  assert.deepEqual(draft.items.map((i) => i.name), ["無糖豆漿"]);
  assert.equal(draft.totals().kcal, 120);
});

test("草稿可以預先帶入食物和照片；之後打開修改再存，照片仍然保留", async () => {
  const { diary } = setup();
  const photos = ["data:image/jpeg;base64,AAAA", "data:image/jpeg;base64,BBBB"];
  const draft = diary.newMealDraft({ items: [BENTO], photos });
  assert.equal(draft.totals().kcal, 800);
  const saved = await diary.saveMeal(draft);

  const editing = await diary.loadMealDraft(saved.id);
  editing.addItem(SOY_MILK);
  await diary.saveMeal(editing);

  const [meal] = (await diary.getDaySummary(diary.todayKey())).meals;
  assert.deepEqual(meal.photos, photos);
  assert.equal(meal.totals.kcal, 920);
});
