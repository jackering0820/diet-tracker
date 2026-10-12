import { test } from "node:test";
import assert from "node:assert/strict";
import { setup, fakeTransport, claudeReply } from "./helpers.js";
import { ANALYSIS_ERRORS } from "../src/core/analysis-error.js";

// 測試只使用明顯是假的金鑰和假照片。
const FAKE_KEY = "sk-ant-FAKE-test-key-0000WXYZ";
const PHOTOS = ["data:image/jpeg;base64,AAAA"];

// API 的錯誤回應；錯誤訊息裡刻意放了金鑰，確認不會被帶到畫面。
function apiError(status, type) {
  return { status, body: { type: "error", error: { type, message: `problem with ${FAKE_KEY}` } } };
}

// 用一個假回應跑一次分析，回傳丟出的錯誤和草稿。
async function failWith(response, { withKey = true } = {}) {
  const transport = response === "network"
    ? async () => { throw new TypeError("Failed to fetch"); }
    : fakeTransport(response);
  const { diary } = setup(new Date(2026, 9, 11, 12, 30), { transport });
  if (withKey) await diary.saveAiSettings({ key: FAKE_KEY, model: "claude-sonnet-5-5" });
  const draft = diary.newMealDraft({ photos: PHOTOS });
  let error;
  try {
    await diary.analyzeDraft(draft);
  } catch (err) {
    error = err;
  }
  assert.ok(error, "應該要失敗");
  return { error, draft };
}

const CASES = [
  ["尚未設定金鑰", undefined, ANALYSIS_ERRORS.NO_API_KEY, /設定/],
  ["金鑰無效（401）", apiError(401, "authentication_error"), ANALYSIS_ERRORS.INVALID_KEY, /API 金鑰已失效，請到設定更換/],
  ["額度問題（402）", apiError(402, "billing_error"), ANALYSIS_ERRORS.QUOTA, /額度.*(下個月|儲值)/],
  ["請求太頻繁（429）", apiError(429, "rate_limit_error"), ANALYSIS_ERRORS.BUSY, /稍後重試/],
  ["伺服器錯誤（500）", apiError(500, "api_error"), ANALYSIS_ERRORS.BUSY, /稍後重試/],
  ["服務過載（529）", apiError(529, "overloaded_error"), ANALYSIS_ERRORS.BUSY, /稍後重試/],
  ["網路無法連線", "network", ANALYSIS_ERRORS.NETWORK, /無法連線，請確認網路/],
  ["回應無法解讀", claudeReply([{ name: "便當" }]), ANALYSIS_ERRORS.INVALID_RESPONSE, /重試|手動/],
];

for (const [label, response, kind, message] of CASES) {
  test(`${label}：錯誤種類和訊息正確，草稿的照片和餐別保留，訊息不含金鑰`, async () => {
    const { error, draft } = await failWith(response, { withKey: response !== undefined });
    assert.equal(error.kind, kind);
    assert.match(error.message, message);
    assert.ok(!error.message.includes("FAKE"), "錯誤訊息不能包含金鑰");
    assert.deepEqual(draft.photos, PHOTOS);
    assert.equal(draft.mealType, "午餐");
  });
}

test("其他錯誤（例如 404）顯示錯誤代碼，方便回報問題", async () => {
  const { error } = await failWith(apiError(404, "not_found_error"));
  assert.equal(error.kind, ANALYSIS_ERRORS.REQUEST_FAILED);
  assert.match(error.message, /404/);
});
