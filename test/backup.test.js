import { test } from "node:test";
import assert from "node:assert/strict";
import { setup } from "./helpers.js";

// 測試只使用明顯是假的金鑰和假照片。
const FAKE_KEY = "sk-ant-FAKE-test-key-0000WXYZ";
const BENTO = { name: "雞腿便當", portion: "一個", kcal: 800, protein: 35, carbs: 95, fat: 30, veg: 1.5 };
const TEA = { name: "無糖綠茶", portion: "大杯", kcal: 0, protein: 0, carbs: 0, fat: 0, veg: 0 };
const PHOTO = "data:image/jpeg;base64,AAAA";
const GOALS = { kcal: 1800, protein: 90, veg: 3, waterMl: 2000 };

// 建立一個有兩天紀錄、目標和金鑰的日記。
async function filledDiary() {
  const env = setup(new Date(2026, 9, 10, 12, 0));
  const { diary, clock } = env;
  await diary.setGoals(GOALS);
  await diary.saveAiSettings({ key: FAKE_KEY, model: "claude-haiku-5-5" });
  await diary.saveMeal(diary.newMealDraft({ items: [BENTO], photos: [PHOTO] }));
  await diary.addWater(500);
  clock.now = () => new Date(2026, 9, 11, 8, 0);
  await diary.saveMeal(diary.newMealDraft({ items: [TEA] }));
  await diary.addWater(250);
  return env;
}

const DAYS = ["2026-10-10", "2026-10-11"];
const daySnapshot = async (diary) => Promise.all(DAYS.map((d) => diary.getDaySummary(d)));

test("匯出後在另一支手機（空的 App）匯入，每一天的餐點、照片、喝水和目標都完全一樣", async () => {
  const { diary } = await filledDiary();
  const backup = await diary.exportBackup();

  const { diary: newPhone } = setup(new Date(2026, 9, 12, 9, 0));
  await newPhone.importBackup(backup);

  assert.deepEqual(await daySnapshot(newPhone), await daySnapshot(diary));
  assert.deepEqual(await newPhone.getGoals(), GOALS);
});

test("備份檔有格式版本號和匯出時間，不包含 API 金鑰", async () => {
  const { diary } = await filledDiary();
  const text = await diary.exportBackup();
  const backup = JSON.parse(text);

  assert.equal(backup.version, 1);
  assert.equal(backup.exportedAt, new Date(2026, 9, 11, 8, 0).toISOString());
  assert.equal(backup.meals.length, 2);
  assert.equal(backup.water.length, 2);
  assert.ok(!text.includes("FAKE"), "備份檔不能包含金鑰");
  assert.ok(!text.includes("apiKey"));
});

test("匯入是整份取代：原本的餐點、喝水和目標都被備份的內容取代，不會合併；金鑰和模型保留", async () => {
  const { diary: oldPhone } = await filledDiary();
  const backup = await oldPhone.exportBackup();

  const { diary } = setup(new Date(2026, 9, 10, 18, 0));
  await diary.saveAiSettings({ key: "sk-ant-FAKE-this-phone-key-1111ABCD", model: "claude-sonnet-5-5" });
  await diary.setGoals({ kcal: 2500, protein: null, veg: 5, waterMl: null });
  await diary.saveMeal(diary.newMealDraft({ items: [{ ...BENTO, name: "這支手機原本的晚餐" }] }));
  await diary.addWater(999);

  await diary.importBackup(backup);

  const oct10 = await diary.getDaySummary("2026-10-10");
  assert.deepEqual(oct10.meals.map((m) => m.items[0].name), ["雞腿便當"]);
  assert.equal(oct10.waterTotalMl, 500);
  assert.deepEqual(await diary.getGoals(), GOALS);
  assert.equal((await diary.getApiKeyStatus()).masked, "sk-ant-…ABCD");
  assert.equal(await diary.getModel(), "claude-sonnet-5-5");
});

test("格式錯誤或版本不符的備份會被拒絕並說明原因，現有資料完全不變", async () => {
  const { diary } = await filledDiary();
  const good = JSON.parse(await diary.exportBackup());
  const before = await daySnapshot(diary);
  const with_ = (changes) => JSON.stringify({ ...good, ...changes });

  const BAD = [
    ["不是 JSON", "這不是備份檔", /不是.*備份檔/],
    ["別的 App 的 JSON", JSON.stringify({ hello: "world" }), /不是.*備份檔/],
    ["版本太新", with_({ version: 2 }), /版本/],
    ["餐點不是清單", with_({ meals: "很多" }), /餐點/],
    ["某一餐的熱量是負數", with_({ meals: [{ ...good.meals[0], items: [{ ...BENTO, kcal: -1 }] }] }), /餐點/],
    ["某一餐的餐別不存在", with_({ meals: [{ ...good.meals[0], mealType: "宵夜" }] }), /餐點/],
    ["某一餐的照片格式不對", with_({ meals: [{ ...good.meals[0], photos: [123] }] }), /餐點/],
    ["喝水量是負數", with_({ water: [{ ...good.water[0], ml: -500 }] }), /喝水/],
    ["喝水時間無效", with_({ water: [{ ...good.water[0], at: "昨天" }] }), /喝水/],
    ["目標是負數", with_({ goals: { ...GOALS, kcal: -1 } }), /目標/],
    ["缺少目標", with_({ goals: undefined }), /目標/],
    ["某一餐缺少食物清單", with_({ meals: [{ ...good.meals[0], items: undefined }] }), /餐點/],
    ["某一餐缺少照片清單", with_({ meals: [{ ...good.meals[0], photos: undefined }] }), /餐點/],
    ["某一餐的來源不明", with_({ meals: [{ ...good.meals[0], source: "robot" }] }), /餐點/],
    ["兩餐的識別碼重複", with_({ meals: [good.meals[0], { ...good.meals[1], id: good.meals[0].id }] }), /重複/],
    ["兩筆喝水的識別碼重複", with_({ water: [good.water[0], { ...good.water[1], id: good.water[0].id }] }), /重複/],
  ];

  for (const [label, text, message] of BAD) {
    await assert.rejects(diary.importBackup(text), message, label);
  }
  assert.deepEqual(await daySnapshot(diary), before);
  assert.deepEqual(await diary.getGoals(), GOALS);
});

test("提醒定期備份：有紀錄但從沒備份過、或上次存好備份超過 7 天時提醒；沒有任何紀錄時不提醒", async () => {
  const { diary, clock } = setup(new Date(2026, 9, 1, 9, 0));
  assert.equal(await diary.backupReminderDue(), false, "還沒有任何紀錄");

  await diary.addWater(250);
  assert.equal(await diary.backupReminderDue(), true, "有紀錄但從沒備份過");

  assert.equal(await diary.getLastExportAt(), null);
  await diary.exportBackup();
  assert.equal(await diary.backupReminderDue(), true, "只產生了備份，使用者可能取消了儲存");
  await diary.markExported();
  assert.equal(await diary.backupReminderDue(), false, "確定存好了");
  assert.equal(await diary.getLastExportAt(), new Date(2026, 9, 1, 9, 0).getTime());

  clock.now = () => new Date(2026, 9, 8, 9, 0);
  assert.equal(await diary.backupReminderDue(), false, "剛好 7 天");

  clock.now = () => new Date(2026, 9, 8, 9, 1);
  assert.equal(await diary.backupReminderDue(), true, "超過 7 天");
});

test("匯入改版前的備份：裡面沒有四捨五入的目標（例如 2.25 份）匯入後也是看到的數字", async () => {
  const { diary: oldPhone } = await filledDiary();
  // 改版前匯出的備份，目標是使用者輸入的原始數字
  const backup = JSON.parse(await oldPhone.exportBackup());
  backup.goals = { kcal: 1800.4, protein: 90.25, veg: 2.25, waterMl: 2000.6 };

  const { diary } = setup();
  await diary.importBackup(JSON.stringify(backup));

  assert.deepEqual(await diary.getGoals(), { kcal: 1800, protein: 90.3, veg: 2.3, waterMl: 2001 });
});
