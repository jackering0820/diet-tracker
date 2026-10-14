// 依照指標目錄產生的測試：目錄裡每多一項指標，這裡就自動多測一項。
import { test } from "node:test";
import assert from "node:assert/strict";
import { setup } from "./helpers.js";
import { MEASURES, NUTRIENTS, formatMeasure } from "../src/core/measures.js";
import { GOAL_STATUSES } from "../src/core/goals.js";

const WITH_GOAL = MEASURES.filter((m) => m.goal);
const ALL_NULL_GOALS = Object.fromEntries(WITH_GOAL.map((m) => [m.key, null]));

// 一個所有營養都是 0 的食物項目，再把指定的營養設成 value。
function food(overrides = {}) {
  return { name: "測試食物", portion: "", ...Object.fromEntries(NUTRIENTS.map((m) => [m.key, 0])), ...overrides };
}

// 在這一天記錄某一項指標的數值：營養記成一餐，喝水記成一筆喝水。
async function record(diary, measure, value) {
  if (measure.source === "food") await diary.saveMeal(diary.newMealDraft({ items: [food({ [measure.key]: value })] }));
  else await diary.addWater(value);
}

// 只設定這一項目標，記錄 value，回傳這一項的達標狀態。
async function statusFor(measure, goal, value) {
  const { diary } = setup();
  await diary.setGoals({ ...ALL_NULL_GOALS, [measure.key]: goal });
  await record(diary, measure, value);
  return (await diary.getDaySummary(diary.todayKey())).progress[measure.key].status;
}

for (const measure of WITH_GOAL) {
  test(`目標「${measure.name}」：剛好等於目標是達標，往錯的方向多一點就不達標`, async () => {
    assert.equal(await statusFor(measure, 100, 100), "achieved");
    if (measure.goal.limit === "ceiling") assert.equal(await statusFor(measure, 100, 101), "over");
    else assert.equal(await statusFor(measure, 100, 99), "missed");
  });

  test(`目標「${measure.name}」：負數會被拒絕，錯誤訊息寫出指標名稱`, async () => {
    const { diary } = setup();
    await assert.rejects(diary.setGoals({ ...ALL_NULL_GOALS, [measure.key]: -1 }), new RegExp(measure.name));
  });
}

test("第一次使用時的目標就是目錄裡的預設值", async () => {
  const { diary } = setup();
  assert.deepEqual(await diary.getGoals(), Object.fromEntries(WITH_GOAL.map((m) => [m.key, m.goal.default])));
});

for (const measure of NUTRIENTS) {
  test(`營養「${measure.name}」：食物項目一定要有，負數會被拒絕，並計入一餐和一天的總數`, async () => {
    const { diary } = setup();
    const draft = diary.newMealDraft();
    assert.throws(() => draft.addItem(food({ [measure.key]: -1 })), new RegExp(measure.name));
    assert.throws(() => draft.addItem(food({ [measure.key]: undefined })), new RegExp(measure.name));
    draft.addItem(food({ [measure.key]: 12 }));
    draft.addItem(food({ [measure.key]: 3 }));
    assert.equal(draft.totals()[measure.key], 15);
    await diary.saveMeal(draft);
    assert.equal((await diary.getDaySummary(diary.todayKey())).nutritionTotals[measure.key], 15);
  });
}

test("每一項指標都有名稱、單位和顯示格式；營養就是來源為食物的指標", () => {
  for (const measure of MEASURES) {
    assert.ok(measure.name && measure.unit, measure.key);
    assert.equal(formatMeasure(measure.key, 2.25), measure.decimals === 0 ? "2" : "2.3");
  }
  assert.deepEqual(NUTRIENTS, MEASURES.filter((m) => m.source === "food"));
});

test("核心會產生的每一種達標狀態，在狀態目錄裡都有文字和圖示", async () => {
  const produced = new Set();
  const { diary } = setup();
  for (const status of Object.values((await diary.getDaySummary(diary.todayKey())).progress)) produced.add(status.status);
  for (const measure of WITH_GOAL) {
    produced.add(await statusFor(measure, 100, 100));
    produced.add(await statusFor(measure, 100, measure.goal.limit === "ceiling" ? 101 : 99));
    produced.add(await statusFor(measure, null, 1));
  }
  assert.deepEqual([...produced].sort(), ["achieved", "missed", "noRecords", "over", "unset"]);
  for (const status of produced) {
    assert.ok(GOAL_STATUSES[status]?.text, `${status} 缺少文字`);
    assert.ok(GOAL_STATUSES[status]?.icon, `${status} 缺少圖示`);
  }
});
