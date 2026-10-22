// 設定分頁：每日目標（步進器）、AI 分析的 API 金鑰和模型、資料備份。
// 畫面永遠拿不到完整金鑰：只送出使用者剛貼上的值，顯示時只用遮罩後的片段。
import { MODEL_OPTIONS } from "../core/ai-settings.js";
import { byId as $, showMessage } from "./dom.js";
import { GOAL_MEASURES, formatMeasure } from "../core/measures.js";
import { saveBackup } from "./backup.js";

const GOALS_DIRTY = "有變更還沒儲存";

// 一項目標的步進器：名稱、上限／下限標籤、「未設定」、− 數字 ＋（單位在欄位裡）
function goalStepper(measure) {
  const row = document.createElement("div");
  row.className = "goal-row";
  const head = document.createElement("div");
  head.className = "h";
  const dot = document.createElement("span");
  dot.className = `dot ring-${measure.key}`;
  dot.setAttribute("aria-hidden", "true");
  const label = document.createElement("label");
  label.htmlFor = `goal-${measure.key}`;
  label.textContent = measure.name;
  const tag = document.createElement("span");
  tag.className = "tag";
  tag.textContent = measure.goal.limit === "ceiling" ? "上限" : "下限";
  const unset = document.createElement("span");
  unset.className = "unset";
  unset.textContent = "未設定";
  head.append(dot, label, tag, unset);

  const stepper = document.createElement("div");
  stepper.className = "stepper";
  const key = (text, direction) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "secondary sbtn";
    button.textContent = text;
    button.dataset.step = String(direction);
    button.setAttribute("aria-label", `${measure.name}目標${direction > 0 ? "增加" : "減少"}`);
    return button;
  };
  const field = document.createElement("span");
  field.className = "sfield";
  const input = document.createElement("input");
  input.id = `goal-${measure.key}`;
  input.name = measure.key;
  input.type = "number";
  input.inputMode = "decimal";
  input.min = "0";
  input.step = "any";
  input.placeholder = "未設定";
  input.className = "n";
  const unit = document.createElement("span");
  unit.className = "unit";
  unit.setAttribute("aria-hidden", "true");
  unit.textContent = measure.unit;
  field.append(input, unit);
  stepper.append(key("−", -1), field, key("+", +1));
  row.append(head, stepper);
  return row;
}

// 欄位的數值：空白是 null（未設定），打了無法解讀的字是 NaN（交給日記核心回報錯誤）
function readGoal(input) {
  const raw = input.value.trim();
  return input.validity.badInput ? NaN : raw === "" ? null : Number(raw);
}

// 上次匯出：今天、N 天前、還沒匯出過
function formatDaysAgo(days) {
  if (days === null) return "還沒匯出過";
  return days === 0 ? "今天" : `${days} 天前`;
}

export function createSettings({ diary }) {
  const goalsForm = $("goals-form");
  const aiForm = $("ai-form");
  $("goal-fields").replaceChildren(...GOAL_MEASURES.map(goalStepper));
  let savedGoals = ""; // 已儲存的目標（欄位顯示的樣子），用來判斷有沒有變更

  $("model-options").replaceChildren(...MODEL_OPTIONS.map((m) => {
    const label = document.createElement("label");
    label.className = "radio";
    const input = document.createElement("input");
    input.type = "radio";
    input.name = "model";
    input.value = m.id;
    const text = document.createElement("span");
    const note = document.createElement("small");
    note.textContent = m.note;
    text.append(m.name, note);
    label.append(input, text);
    return label;
  }));

  function clearMessages() {
    for (const id of ["goals-error", "ai-error", "ai-saved", "backup-error", "backup-saved"]) showMessage(id, "");
    $("goals-status").textContent = "";
  }

  // ---------- 每日目標 ----------
  const currentGoals = () => GOAL_MEASURES.map(({ key }) => goalsForm.elements[key].value.trim()).join("|");

  // 依目標填入欄位（顯示的位數和其他畫面一樣），並記下這是已儲存的樣子
  function fillGoals(goals) {
    for (const { key } of GOAL_MEASURES) goalsForm.elements[key].value = goals[key] === null ? "" : formatMeasure(key, goals[key]);
    savedGoals = currentGoals();
    renderGoalsState();
  }

  // 「未設定」標籤和「有變更還沒儲存」
  function renderGoalsState() {
    for (const row of $("goal-fields").children) {
      row.querySelector(".unset").hidden = row.querySelector("input").value.trim() !== "";
    }
    const status = $("goals-status");
    const dirty = currentGoals() !== savedGoals;
    if (dirty) status.textContent = GOALS_DIRTY;
    else if (status.textContent === GOALS_DIRTY) status.textContent = "";
    status.classList.toggle("dirty", dirty);
  }

  goalsForm.addEventListener("input", () => {
    showMessage("goals-error", "");
    renderGoalsState();
  });

  // ＋／−：下一個數值由日記核心決定（幅度、從建議值開始、不小於 0）
  $("goal-fields").addEventListener("click", (event) => {
    const button = event.target.closest("[data-step]");
    if (!button) return;
    const input = button.closest(".stepper").querySelector("input");
    const value = readGoal(input);
    const next = diary.stepGoal(input.name, Number.isNaN(value) ? null : value, Number(button.dataset.step));
    input.value = formatMeasure(input.name, next);
    showMessage("goals-error", "");
    renderGoalsState();
  });

  goalsForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    clearMessages();
    const goals = Object.fromEntries(GOAL_MEASURES.map(({ key }) => [key, readGoal(goalsForm.elements[key])]));
    try {
      await diary.setGoals(goals);
      fillGoals(await diary.getGoals()); // 存下來的是四捨五入後的數字，欄位跟著更新
      $("goals-status").textContent = "✓ 已儲存目標";
    } catch (err) {
      showMessage("goals-error", err.message);
      renderGoalsState();
    }
  });

  // ---------- AI 分析 ----------
  async function renderKeyStatus() {
    const { isSet, masked } = await diary.getApiKeyStatus();
    $("key-status").textContent = isSet ? `已設定・${masked}` : "尚未設定";
    $("key-label").textContent = isSet ? "貼上新的 API 金鑰（不換就留空）" : "貼上 API 金鑰";
  }

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

  // ---------- 資料備份 ----------
  async function renderBackupInfo() {
    $("last-export").textContent = formatDaysAgo(await diary.daysSinceLastExport());
    const { days, bytes } = diary.backupSummary(await diary.exportBackup());
    $("data-amount").textContent = `${days} 天・${Math.max(1, Math.round(bytes / 1024)).toLocaleString("zh-TW")} KB`;
  }

  $("export-backup").addEventListener("click", async () => {
    clearMessages();
    try {
      const { saved, name } = await saveBackup(diary);
      await renderBackupInfo();
      if (saved) showMessage("backup-saved", `✓ 已匯出 ${name}`);
      else showMessage("backup-error", "已取消，備份沒有存下來");
    } catch (err) {
      showMessage("backup-error", `匯出失敗：${err.message}`);
    }
  });

  // 匯入：選好檔案後先在畫面內確認會覆蓋，按「匯入並覆蓋」才交給日記核心（核心會先完整檢查，有問題就什麼都不改）。
  let pendingImport = null; // 選好、還沒確認的檔案
  function askImport(file) {
    pendingImport = file;
    $("import-file-name").textContent = file ? `📄 ${file.name}` : "";
    $("import-confirm").hidden = !file;
    $("backup-buttons").hidden = Boolean(file);
  }

  $("import-backup").addEventListener("change", (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    clearMessages();
    askImport(file);
  });
  $("import-no").addEventListener("click", () => askImport(null));
  $("import-yes").addEventListener("click", async () => {
    const file = pendingImport;
    askImport(null);
    try {
      await diary.importBackup(await file.text());
      showMessage("backup-saved", "✓ 已匯入備份");
      fillGoals(await diary.getGoals()); // 目標也被還原了，重新填入
      await renderBackupInfo();
    } catch (err) {
      showMessage("backup-error", err.message);
    }
  });

  return {
    // 進入設定分頁時，填入目前的設定。
    async open() {
      clearMessages();
      askImport(null);
      fillGoals(await diary.getGoals());
      const model = await diary.getModel();
      for (const radio of aiForm.elements.model) radio.checked = radio.value === model;
      aiForm.elements.apiKey.value = "";
      await renderKeyStatus();
      await renderBackupInfo();
    },
    // 離開設定分頁時，不讓貼上的金鑰留在畫面上。
    leave() {
      aiForm.elements.apiKey.value = "";
    },
  };
}
