// 一餐的編輯畫面：手動新增、修改、拍照分析共用。
import { MEAL_TYPES, NUTRIENTS, NUTRIENT_LABELS } from "../core/meal.js";
import { ANALYSIS_ERRORS } from "../core/analysis-error.js";
import { resizePhotos } from "./photos.js";
import { formatNutrient } from "../core/format.js";
import { byId as $, fromLocalInputValue, showMessage, toLocalInputValue } from "./dom.js";

export function renderNutrition(dl, totals) {
  dl.replaceChildren(...NUTRIENTS.flatMap((k) => {
    const dt = document.createElement("dt");
    dt.textContent = NUTRIENT_LABELS[k];
    const dd = document.createElement("dd");
    dd.textContent = formatNutrient(k, totals[k]);
    return [dt, dd];
  }));
}

// onDone 在儲存或刪除之後呼叫，讓「今天」畫面重新整理。
// onOpenSettings 在還沒設定金鑰、使用者按「前往設定」時呼叫（編輯視窗保持打開，草稿不會不見）。
export function createMealEditor({ diary, onDone, onOpenSettings }) {
  const dialog = $("meal-editor");
  const form = $("item-form");
  let draft = null;
  let editingItemId = null;

  $("meal-type").replaceChildren(...MEAL_TYPES.map((t) => new Option(t, t)));

  const showItemError = (message) => showMessage("item-error", message);
  const showError = (message) => showMessage("editor-error", message);

  function resetItemForm() {
    form.reset();
    showItemError("");
    editingItemId = null;
    $("item-form-title").textContent = "新增食物";
    $("item-submit").textContent = "加入這一項";
    $("item-cancel").hidden = true;
  }

  function startEditingItem(item) {
    editingItemId = item.id;
    for (const key of ["name", "portion", ...NUTRIENTS]) form.elements[key].value = item[key];
    $("item-form-title").textContent = "修改食物";
    $("item-submit").textContent = "更新這一項";
    $("item-cancel").hidden = false;
    form.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function itemRow(item) {
    const li = document.createElement("li");
    const label = document.createElement("span");
    label.className = "grow";
    label.textContent = item.portion ? `${item.name}（${item.portion}）` : item.name;
    const kcal = document.createElement("span");
    kcal.textContent = `${formatNutrient("kcal", item.kcal)} 大卡`;
    const edit = document.createElement("button");
    edit.type = "button";
    edit.className = "link";
    edit.textContent = "修改";
    edit.setAttribute("aria-label", `修改 ${item.name}`);
    edit.addEventListener("click", () => startEditingItem(item));
    const del = document.createElement("button");
    del.type = "button";
    del.className = "delete";
    del.textContent = "刪除";
    del.setAttribute("aria-label", `刪除 ${item.name}`);
    del.addEventListener("click", () => {
      draft.removeItem(item.id);
      if (editingItemId === item.id) resetItemForm();
      renderDraft();
    });
    li.append(label, kcal, edit, del);
    return li;
  }

  function renderPhotos() {
    $("draft-photos").hidden = draft.photos.length === 0;
    $("draft-photos").replaceChildren(...draft.photos.map((src, i) => {
      const img = document.createElement("img");
      img.src = src;
      img.alt = `這一餐的第 ${i + 1} 張照片`;
      return img;
    }));
    $("ai-notice").hidden = draft.source !== "ai";
  }

  function setAnalysisState({ busy = false, message = "", needsKey = false, canRetry = false }) {
    $("analysis-status").textContent = message;
    $("analysis-status").hidden = !message;
    $("analysis-status").classList.toggle("busy", busy);
    $("analysis-status").classList.toggle("error", !busy && Boolean(message));
    $("go-settings").hidden = !needsKey;
    $("reanalyze").hidden = !canRetry;
    $("analysis-actions").hidden = !needsKey && !canRetry;
    $("save-meal").disabled = busy;
    // 分析中鎖住食物的輸入和列表：結果回來時會取代整個清單，避免使用者的輸入被蓋掉。
    form.inert = busy;
    $("item-list").inert = busy;
    $("add-photos-label").inert = busy;
  }

  // 用 AI 分析草稿的照片。分析期間關掉或換了別的草稿，結果就不再更新畫面。
  async function analyze() {
    const target = draft;
    setAnalysisState({ busy: true, message: `分析中…（${target.photos.length} 張照片）` });
    try {
      await diary.analyzeDraft(target);
      if (draft !== target) return;
      setAnalysisState({});
      renderDraft();
    } catch (err) {
      if (draft !== target) return;
      setAnalysisState({
        message: `${err.message}。也可以直接在下方手動輸入。`,
        needsKey: err.kind === ANALYSIS_ERRORS.NO_API_KEY,
        canRetry: true,
      });
    }
  }

  // 重新分析會取代目前的食物清單（包含已經修正過的），先確認。
  $("reanalyze").addEventListener("click", () => {
    if (draft.items.length > 0 && !confirm("重新分析會取代目前的食物清單（包含你修改過的內容），確定嗎？")) return;
    analyze();
  });

  // 追加照片到同一餐：還沒有食物就直接分析，已經有食物就讓使用者決定要不要重新分析。
  $("add-photos").addEventListener("change", async (event) => {
    const files = event.target.files;
    if (!files?.length) return;
    try {
      draft.addPhotos(await resizePhotos(files));
      renderPhotos();
      if (draft.items.length === 0) await analyze();
      else setAnalysisState({ message: "已加入照片。按「重新分析」可以依全部照片更新食物清單。", canRetry: true });
    } catch (err) {
      setAnalysisState({ message: err.message });
    } finally {
      event.target.value = "";
    }
  });
  $("go-settings").addEventListener("click", () => onOpenSettings());

  function renderDraft() {
    renderPhotos();
    $("item-list").replaceChildren(...draft.items.map(itemRow));
    $("items-empty").hidden = draft.items.length > 0;
    renderNutrition($("draft-totals"), draft.totals());
  }

  function readItemForm() {
    const fields = { name: form.elements.name.value.trim(), portion: form.elements.portion.value.trim() };
    for (const k of NUTRIENTS) {
      const raw = form.elements[k].value.trim();
      // 空白當作 0；輸入框裡打了無法解讀的字，瀏覽器會給空字串，所以用 validity 判斷。
      fields[k] = form.elements[k].validity.badInput ? NaN : raw === "" ? 0 : Number(raw);
    }
    return fields;
  }

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    try {
      const fields = readItemForm();
      if (editingItemId) draft.updateItem(editingItemId, fields);
      else draft.addItem(fields);
      resetItemForm();
      renderDraft();
    } catch (err) {
      showItemError(err.message);
    }
  });

  $("item-cancel").addEventListener("click", resetItemForm);

  $("meal-type").addEventListener("change", (event) => {
    draft.mealType = event.target.value;
  });

  // 修改日期時間：儲存後這一餐會移到新的那一天。
  $("meal-at").addEventListener("change", (event) => {
    draft.at = fromLocalInputValue(event.target.value);
  });

  $("save-meal").addEventListener("click", async () => {
    try {
      await diary.saveMeal(draft);
      dialog.close();
      await onDone();
    } catch (err) {
      showError(err.message);
    }
  });

  $("delete-meal").addEventListener("click", async () => {
    if (!confirm("確定要刪除這一餐嗎？")) return;
    try {
      await diary.deleteMeal(draft.id);
      dialog.close();
      await onDone();
    } catch (err) {
      showError(`刪除失敗：${err.message}`);
    }
  });

  $("close-editor").addEventListener("click", () => dialog.close());

  function open(newDraft) {
    draft = newDraft;
    const isExisting = Boolean(draft.id);
    $("editor-title").textContent = isExisting ? "修改這一餐" : "新增一餐";
    $("delete-meal").hidden = !isExisting;
    $("meal-type").value = draft.mealType;
    $("meal-at").value = toLocalInputValue(draft.at);
    resetItemForm();
    showError("");
    setAnalysisState({});
    renderDraft();
    dialog.showModal();
  }

  return {
    // 用照片建立的草稿打開，並馬上開始 AI 分析。
    openForAnalysis(photoDraft) {
      open(photoDraft);
      return analyze();
    },
    // at：這一餐的時間；補記過去的日子時由畫面指定。
    openNew(at) {
      open(diary.newMealDraft({ at }));
    },
    async openExisting(id) {
      open(await diary.loadMealDraft(id));
    },
  };
}
