import { test } from "node:test";
import assert from "node:assert/strict";
import { setup, fakeTransport, claudeReply } from "./helpers.js";
import { ANALYSIS_ERRORS } from "../src/core/analysis-error.js";

// 測試只使用明顯是假的金鑰和假照片。
const FAKE_KEY = "sk-ant-FAKE-test-key-0000WXYZ";
const PHOTOS = ["data:image/jpeg;base64,AAAA", "data:image/jpeg;base64,BBBB"];
const AI_ITEMS = [
  { name: "雞腿便當", portion: "一個", kcal: 820, protein: 38, carbs: 98, fat: 30, veg: 1.5 },
  { name: "紅茶（微糖）", portion: "大杯", kcal: 120, protein: 0, carbs: 30, fat: 0, veg: 0 },
];

test("同一餐的多張照片只送出一個請求、使用選擇的模型，回應轉成草稿的食物項目", async () => {
  // AI 多回傳了一個不需要的欄位，應該被濾掉。
  const transport = fakeTransport(claudeReply([{ ...AI_ITEMS[0], note: "多餘的欄位" }, AI_ITEMS[1]]));
  const { diary } = setup(undefined, { transport });
  await diary.saveAiSettings({ key: FAKE_KEY, model: "claude-haiku-5-5" });

  const draft = diary.newMealDraft({ photos: PHOTOS });
  await diary.analyzeDraft(draft);

  assert.equal(transport.requests.length, 1);
  const { body } = transport.requests[0];
  assert.equal(body.model, "claude-haiku-5-5");
  const images = body.messages[0].content.filter((b) => b.type === "image");
  assert.deepEqual(images.map((b) => b.source.data), ["AAAA", "BBBB"]);

  assert.deepEqual(draft.items.map(({ id, ...fields }) => fields), AI_ITEMS);
  assert.equal(draft.totals().kcal, 940);
  assert.equal(draft.source, "ai");
});

test("請求帶金鑰、API 版本和瀏覽器直接存取的標頭；提示詞要求台灣飲食、繁體中文、同一食物只算一次，並要求結構化回傳", async () => {
  const transport = fakeTransport(claudeReply(AI_ITEMS));
  const { diary } = setup(undefined, { transport });
  await diary.saveAiSettings({ key: FAKE_KEY, model: "claude-sonnet-5-5" });
  await diary.analyzeDraft(diary.newMealDraft({ photos: PHOTOS }));

  const { url, headers, body } = transport.requests[0];
  assert.equal(url, "https://api.anthropic.com/v1/messages");
  assert.equal(headers["x-api-key"], FAKE_KEY);
  assert.equal(headers["anthropic-version"], "2023-06-01");
  assert.equal(headers["anthropic-dangerous-direct-browser-access"], "true");

  for (const phrase of ["台灣", "繁體中文", "只算一次"]) assert.match(body.system, new RegExp(phrase));
  assert.equal(body.output_config.format.type, "json_schema");
  assert.deepEqual(body.output_config.format.schema.properties.items.items.required, ["name", "portion", "kcal", "protein", "carbs", "fat", "veg"]);
});

test("還沒設定金鑰時不送出請求，回報需要設定金鑰，草稿的照片和餐別保留", async () => {
  const transport = fakeTransport();
  const { diary } = setup(new Date(2026, 9, 11, 19, 0), { transport });
  const draft = diary.newMealDraft({ photos: PHOTOS });

  await assert.rejects(diary.analyzeDraft(draft), (err) => {
    assert.equal(err.kind, ANALYSIS_ERRORS.NO_API_KEY);
    assert.match(err.message, /金鑰/);
    return true;
  });
  assert.equal(transport.requests.length, 0);
  assert.deepEqual(draft.photos, PHOTOS);
  assert.equal(draft.mealType, "晚餐");
  assert.equal(draft.items.length, 0);
});

test("AI 回傳無法解讀的內容、缺欄位、型別錯誤或負數時，一律是「回應無法解讀」，草稿的食物項目保持原樣", async () => {
  const garbled = { status: 200, body: { type: "message", stop_reason: "end_turn", content: [{ type: "text", text: "不是 JSON" }] } };
  const negative = claudeReply([{ ...AI_ITEMS[0], kcal: -100 }]);
  const missingField = claudeReply([{ name: "便當", portion: "一個", kcal: 800 }]);
  const wrongType = claudeReply([{ ...AI_ITEMS[0], protein: "很多" }]);
  const transport = fakeTransport(garbled, negative, missingField, wrongType);
  const { diary } = setup(undefined, { transport });
  await diary.saveAiSettings({ key: FAKE_KEY, model: "claude-sonnet-5-5" });

  const draft = diary.newMealDraft({ photos: PHOTOS });
  draft.addItem({ name: "已經手動加的", portion: "", kcal: 50, protein: 0, carbs: 0, fat: 0, veg: 0 });

  for (let i = 0; i < 4; i++) {
    await assert.rejects(diary.analyzeDraft(draft), (err) => {
      assert.equal(err.kind, ANALYSIS_ERRORS.INVALID_RESPONSE);
      return true;
    });
  }
  assert.deepEqual(draft.items.map((i) => i.name), ["已經手動加的"]);
  assert.equal(draft.source, "manual");
});

test("分析後確認儲存，這一餐的來源標記為 AI，照片也一起保存", async () => {
  const transport = fakeTransport(claudeReply(AI_ITEMS));
  const { diary } = setup(undefined, { transport });
  await diary.saveAiSettings({ key: FAKE_KEY, model: "claude-sonnet-5-5" });
  const draft = diary.newMealDraft({ photos: PHOTOS });
  await diary.analyzeDraft(draft);
  draft.removeItem(draft.items[1].id); // 使用者刪掉一項
  await diary.saveMeal(draft);

  const [meal] = (await diary.getDaySummary(diary.todayKey())).meals;
  assert.equal(meal.source, "ai");
  assert.deepEqual(meal.photos, PHOTOS);
  assert.equal(meal.totals.kcal, 820);
});

test("可以在同一餐追加照片（例如分開拍飲料），重新分析時所有照片放在同一個請求", async () => {
  const transport = fakeTransport(claudeReply(AI_ITEMS));
  const { diary } = setup(undefined, { transport });
  await diary.saveAiSettings({ key: FAKE_KEY, model: "claude-sonnet-5-5" });

  const draft = diary.newMealDraft({ photos: [PHOTOS[0]] });
  draft.addPhotos([PHOTOS[1], "data:image/jpeg;base64,CCCC"]);
  await diary.analyzeDraft(draft);

  assert.equal(transport.requests.length, 1);
  const images = transport.requests[0].body.messages[0].content.filter((b) => b.type === "image");
  assert.deepEqual(images.map((b) => b.source.data), ["AAAA", "BBBB", "CCCC"]);
  assert.equal(draft.photos.length, 3);
});

test("API 回傳錯誤時保留狀態碼和錯誤類型；網路斷線時標成 network；錯誤訊息都不包含金鑰", async () => {
  const unauthorized = {
    status: 401,
    body: { type: "error", error: { type: "authentication_error", message: `invalid x-api-key ${FAKE_KEY}` } },
  };
  const responses = [unauthorized];
  async function transport(url, init) {
    const next = responses.shift();
    if (!next) throw new TypeError("Failed to fetch"); // 模擬斷線
    return { ok: false, status: next.status, json: async () => next.body };
  }
  const { diary } = setup(undefined, { transport });
  await diary.saveAiSettings({ key: FAKE_KEY, model: "claude-sonnet-5-5" });
  const draft = diary.newMealDraft({ photos: PHOTOS });

  await assert.rejects(diary.analyzeDraft(draft), (err) => {
    assert.equal(err.kind, ANALYSIS_ERRORS.INVALID_KEY);
    assert.equal(err.status, 401);
    assert.equal(err.apiErrorType, "authentication_error");
    assert.ok(!err.message.includes("FAKE"), "錯誤訊息不能包含金鑰");
    return true;
  });
  await assert.rejects(diary.analyzeDraft(draft), (err) => {
    assert.equal(err.kind, ANALYSIS_ERRORS.NETWORK);
    return true;
  });
  assert.deepEqual(draft.photos, PHOTOS);
});
