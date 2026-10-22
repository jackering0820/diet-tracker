import { test } from "node:test";
import assert from "node:assert/strict";
import { setup } from "./helpers.js";

const food = (name, kcal = 100) => ({ name, portion: "", kcal, protein: 0, carbs: 0, fat: 0, veg: 0 });
const at = (day, hour) => new Date(2026, 9, day, hour, 0).getTime();

// 在指定時間存一餐
async function eat(diary, when, names, photos = []) {
  return diary.saveMeal(diary.newMealDraft({ at: when, items: names.map((n) => food(n)), photos }));
}

test("最近吃過從最新的一餐往回列出", async () => {
  const { diary } = setup(new Date(2026, 9, 11, 20, 0));
  await eat(diary, at(9, 8), ["蛋餅"]);
  await eat(diary, at(11, 12), ["雞腿便當"]);
  await eat(diary, at(10, 19), ["牛肉麵"]);
  const recent = await diary.recentMeals();
  assert.deepEqual(recent.map((r) => r.title), ["雞腿便當", "牛肉麵", "蛋餅"]);
});

test("最近吃過以食物名稱的組合去除重複：順序不同也算同一組合，留下最新的那一餐", async () => {
  const { diary } = setup(new Date(2026, 9, 11, 20, 0));
  await eat(diary, at(9, 8), ["蛋餅", "豆漿"]);
  await eat(diary, at(10, 8), ["豆漿", "蛋餅"]);
  await eat(diary, at(10, 12), ["蛋餅"]);
  const newest = await eat(diary, at(11, 8), ["蛋餅", "豆漿"]);
  const recent = await diary.recentMeals();
  assert.deepEqual(recent.map((r) => r.title), ["蛋餅、豆漿", "蛋餅"]);
  assert.equal(recent[0].mealId, newest.id);
});

test("最近吃過最多 20 個，超過的是比較舊的", async () => {
  const { diary } = setup(new Date(2026, 9, 11, 20, 0));
  for (let i = 0; i < 25; i++) await eat(diary, at(1, 0) + i * 60_000, [`食物 ${i}`]);
  const recent = await diary.recentMeals();
  assert.equal(recent.length, 20);
  assert.equal(recent[0].title, "食物 24");
  assert.equal(recent.at(-1).title, "食物 5");
});

test("最近吃過的每一個附上標題和熱量，有照片的附第一張照片當縮圖", async () => {
  const { diary } = setup(new Date(2026, 9, 11, 20, 0));
  await eat(diary, at(10, 12), ["拉麵"], ["data:image/jpeg;base64,AAA", "data:image/jpeg;base64,BBB"]);
  await diary.saveMeal(diary.newMealDraft({ at: at(11, 8), items: [food("蛋餅", 280), food("豆漿", 120)] }));
  const recent = await diary.recentMeals();
  assert.deepEqual(
    recent.map(({ title, kcal, photo }) => ({ title, kcal, photo })),
    [
      { title: "蛋餅、豆漿", kcal: 400, photo: null },
      { title: "拉麵", kcal: 100, photo: "data:image/jpeg;base64,AAA" },
    ],
  );
});

test("再記一次：複製那一餐的食物（新的 id），時間是現在、餐別依現在時間、不帶照片，原本那一餐不變", async () => {
  const { diary } = setup(new Date(2026, 9, 11, 12, 40));
  const original = await eat(diary, at(9, 8), ["蛋餅", "豆漿"], ["data:image/jpeg;base64,AAA"]);
  const again = await diary.logAgain(original.id);

  assert.notEqual(again.id, original.id);
  assert.equal(again.at, new Date(2026, 9, 11, 12, 40).getTime());
  assert.equal(again.mealType, "午餐");
  assert.deepEqual(again.photos, []);
  const strip = ({ id, ...rest }) => rest;
  assert.deepEqual(again.items.map(strip), original.items.map(strip));
  for (const item of again.items) assert.ok(!original.items.some((o) => o.id === item.id), "食物要有新的 id");

  const today = await diary.getDaySummary(diary.todayKey());
  assert.deepEqual(today.meals.map((m) => m.id), [again.id]);
  const before = (await diary.getDaySummary("2026-10-09")).meals;
  assert.deepEqual(before.map(({ id, at, photos, items }) => ({ id, at, photos, items })),
    [{ id: original.id, at: original.at, photos: original.photos, items: original.items }]);
});
