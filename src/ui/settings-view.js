// 設定視窗：每日目標、AI 分析的 API 金鑰和模型、備份。
// 畫面永遠拿不到完整金鑰：只送出使用者剛貼上的值，顯示時只用遮罩後的片段。
import { MODEL_OPTIONS } from "../core/ai-settings.js";
import { byId as $, showMessage } from "./dom.js";
import { GOAL_ROWS } from "./goals-view.js";
import { formatLastExport, saveBackup } from "./backup.js";

// onClose 在關閉視窗之後呼叫，讓畫面重新整理；onDataChanged 在匯入備份之後馬上呼叫。
export function createSettings({ diary, onClose, onDataChanged }) {
  const dialog = $("settings");
  const goalsForm = $("goals-form");
  const aiForm = $("ai-form");
  const goalKeys = GOAL_ROWS.map((r) => r.key);

  aiForm.elements.model.replaceChildren(...MODEL_OPTIONS.map((m) => new Option(m.label, m.id)));

  function clearMessages() {
    for (const id of ["goals-error", "goals-saved", "ai-error", "ai-saved", "backup-error", "backup-saved"]) showMessage(id, "");
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

  async function renderLastExport() {
    $("last-export").textContent = formatLastExport(await diary.getLastExportAt());
  }

  $("export-backup").addEventListener("click", async () => {
    clearMessages();
    try {
      const { saved, name } = await saveBackup(diary);
      await renderLastExport();
      if (saved) showMessage("backup-saved", `✓ 已匯出 ${name}`);
      else showMessage("backup-error", "已取消，備份沒有存下來");
    } catch (err) {
      showMessage("backup-error", `匯出失敗：${err.message}`);
    }
  });

  // 匯入：先警告會覆蓋，確認後才交給日記核心（核心會先完整檢查，有問題就什麼都不改）。
  $("import-backup").addEventListener("change", async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    clearMessages();
    if (!confirm("匯入會「覆蓋」目前所有的餐點、喝水紀錄和每日目標（API 金鑰會保留）。確定要匯入嗎？")) return;
    try {
      await diary.importBackup(await file.text());
      showMessage("backup-saved", "✓ 已從備份還原");
      await onDataChanged();
      // 目標也被還原了，重新填入表單
      const goals = await diary.getGoals();
      for (const key of goalKeys) goalsForm.elements[key].value = goals[key] ?? "";
    } catch (err) {
      showMessage("backup-error", err.message);
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
      await renderLastExport();
      clearMessages();
      dialog.showModal();
    },
  };
}
