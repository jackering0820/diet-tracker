// 設定視窗：每日目標，以及 AI 分析的 API 金鑰和模型。
// 畫面永遠拿不到完整金鑰：只送出使用者剛貼上的值，顯示時只用遮罩後的片段。
import { MODEL_OPTIONS } from "../core/ai-settings.js";
import { byId as $, showMessage } from "./dom.js";
import { GOAL_ROWS } from "./goals-view.js";

// onClose 在關閉視窗之後呼叫，讓畫面重新整理。
export function createSettings({ diary, onClose }) {
  const dialog = $("settings");
  const goalsForm = $("goals-form");
  const aiForm = $("ai-form");
  const goalKeys = GOAL_ROWS.map((r) => r.key);

  aiForm.elements.model.replaceChildren(...MODEL_OPTIONS.map((m) => new Option(m.label, m.id)));

  function clearMessages() {
    for (const id of ["goals-error", "goals-saved", "ai-error", "ai-saved"]) showMessage(id, "");
  }

  async function renderKeyStatus() {
    const { isSet, masked } = await diary.getApiKeyStatus();
    $("key-status").textContent = isSet ? masked : "尚未設定";
    $("key-label").textContent = isSet ? "更換 API 金鑰（不換就留空）" : "貼上 API 金鑰";
  }

  goalsForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    clearMessages();
    const goals = {};
    for (const key of goalKeys) {
      const input = goalsForm.elements[key];
      const raw = input.value.trim();
      goals[key] = input.validity.badInput ? NaN : raw === "" ? null : Number(raw);
    }
    try {
      await diary.setGoals(goals);
      showMessage("goals-saved", "✓ 已儲存目標");
    } catch (err) {
      showMessage("goals-error", err.message);
    }
  });

  aiForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    clearMessages();
    const keyInput = aiForm.elements.apiKey;
    try {
      // 「留空表示不更換」的規則由日記核心處理。
      await diary.saveAiSettings({ key: keyInput.value, model: aiForm.elements.model.value });
      keyInput.value = "";
      await renderKeyStatus();
      showMessage("ai-saved", "✓ 已儲存 AI 設定");
    } catch (err) {
      showMessage("ai-error", err.message);
    }
  });

  $("close-settings").addEventListener("click", () => dialog.close());
  dialog.addEventListener("close", () => {
    aiForm.elements.apiKey.value = ""; // 不讓貼上的金鑰留在畫面上
    onClose();
  });

  return {
    async open() {
      const goals = await diary.getGoals();
      for (const key of goalKeys) goalsForm.elements[key].value = goals[key] ?? "";
      aiForm.elements.model.value = await diary.getModel();
      aiForm.elements.apiKey.value = "";
      await renderKeyStatus();
      clearMessages();
      dialog.showModal();
    },
  };
}
