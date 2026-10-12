import { test } from "node:test";
import assert from "node:assert/strict";
import { setup } from "./helpers.js";
import { createDiary } from "../src/core/diary.js";

// 測試只使用明顯是假的金鑰。
const FAKE_KEY = "sk-ant-FAKE-test-key-0000WXYZ";
const OTHER_FAKE_KEY = "sk-ant-FAKE-another-key-1111ABCD";

test("第一次使用時沒有金鑰，模型預設是 Sonnet 5.5", async () => {
  const { diary } = setup();
  assert.deepEqual(await diary.getApiKeyStatus(), { isSet: false, masked: null });
  assert.equal(await diary.getModel(), "claude-sonnet-5-5");
});

test("儲存金鑰後只看得到遮罩後的片段；更換後顯示新的片段；重新打開 App 仍然存在", async () => {
  const { diary, storage, clock } = setup();
  await diary.setApiKey(`  ${FAKE_KEY}\n`); // 貼上時常會多出空白或換行
  const status = await diary.getApiKeyStatus();
  assert.deepEqual(status, { isSet: true, masked: "sk-ant-…WXYZ" });
  assert.ok(!JSON.stringify(status).includes("FAKE-test-key"));

  await diary.setApiKey(OTHER_FAKE_KEY);
  const reopened = createDiary({ storage, clock });
  assert.deepEqual(await reopened.getApiKeyStatus(), { isSet: true, masked: "sk-ant-…ABCD" });
});

test("空白或中間有空格的金鑰會被拒絕，原本的金鑰不變，錯誤訊息也不包含貼上的內容", async () => {
  const { diary } = setup();
  await diary.setApiKey(FAKE_KEY);

  await assert.rejects(diary.setApiKey("   "), /金鑰/);
  const pastedWithSpace = "sk-ant-FAKE oops-9999";
  await assert.rejects(diary.setApiKey(pastedWithSpace), (err) => {
    assert.match(err.message, /金鑰/);
    assert.ok(!err.message.includes("oops"), "錯誤訊息不能包含金鑰內容");
    return true;
  });

  assert.equal((await diary.getApiKeyStatus()).masked, "sk-ant-…WXYZ");
});

test("可以切換成 Haiku 5.5，重新打開 App 後仍然保留；不認識的模型會被拒絕", async () => {
  const { diary, storage, clock } = setup();
  await diary.setModel("claude-haiku-5-5");
  await assert.rejects(diary.setModel("gpt-4"), /模型/);

  const reopened = createDiary({ storage, clock });
  assert.equal(await reopened.getModel(), "claude-haiku-5-5");
  await reopened.setModel("claude-sonnet-5-5");
  assert.equal(await reopened.getModel(), "claude-sonnet-5-5");
});
