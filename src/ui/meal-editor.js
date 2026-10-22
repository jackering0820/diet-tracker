// 一餐的編輯畫面：手動新增、修改、拍照分析共用。
import { MEAL_TYPES } from "../core/meal.js";
import { NUTRIENTS, formatMeasure, formatWithUnit } from "../core/measures.js";
import { measureLabel, renderMeasureInputs } from "./measure-fields.js";
import { AnalysisError } from "../core/analysis-error.js";
import { resizePhotos } from "./photos.js";
import { byId as $, fromLocalInputValue, showMessage, toLocalInputValue } from "./dom.js";

export function renderNutrition(dl, totals) {
  dl.replaceChildren(...NUTRIENTS.flatMap(({ key, name }) => {
    const dt = document.createElement("dt");
    dt.textContent = name;
    const dd = document.createElement("dd");
    dd.textContent = formatMeasure(key, totals[key]);
    return [dt, dd];
  }));
}

// onDone 在儲存或刪除之後呼叫，讓「今天」畫面重新整理。
// onOpenSettings 在還沒設定金鑰、使用者按「前往設定」時呼叫（編輯視窗先收起，草稿不會不見，之後用 resume() 打開）。
export function createMealEditor({ diary, onDone, onOpenSettings }) {
  const dialog = $("meal-editor");
  const form = $("item-form");
  renderMeasureInputs($("nutrient-fields"), NUTRIENTS, measureLabel);
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
    for (const key of ["name", "portion", ...NUTRIENTS.map((n) => n.key)]) form.elements[key].value = item[key];
    $("item-form-title").textContent = "修改食物";
    $("item-submit").textContent = "更新這一項";
    $("item-cancel").hidden = false;
    const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
    form.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
  }

  function itemRow(item) {
    const li = document.createElement("li");
    const label = document.createElement("span");
    label.className = "grow";
    label.textContent = item.portion ? `${item.name}（${item.portion}）` : item.name;
    const kcal = document.createElement("span");
    kcal.textContent = formatWithUnit("kcal", item.kcal);
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

  // isError：分析失敗，顯示「改成手動輸入」；retryLabel：重試按鈕的文字。
  function setAnalysisState({ busy = false, message = "", isError = false, needsSettings = false, canRetry = false, retryLabel = "重新分析" }) {
    $("analysis-status").textContent = message;
    $("analysis-status").hidden = !message;
    $("analysis-status").classList.toggle("busy", busy);
    $("analysis-status").classList.toggle("error", isError);
    $("go-settings").hidden = !needsSettings;
    $("reanalyze").hidden = !canRetry;
    $("reanalyze").textContent = retryLabel;
    $("switch-to-manual").hidden = !isError;
    $("analysis-actions").hidden = !needsSettings && !canRetry && !isError;
    $("save-meal").disabled = busy;
    // 分析中鎖住食物的輸入和列表：結果回來時會取代整個清單，避免使用者的輸入被蓋掉。
    form.inert = busy;
    $("item-list").inert = busy;
    $("add-photos-label").inert = busy;
  }

  // 訊息、要不要前往設定、能不能重試，都由日記核心的錯誤決定；畫面只照著顯示。
  // 不是分析錯誤（例如程式錯誤）時，顯示通用訊息並允許重試。
  function showAnalysisError(err) {
    const isAnalysisError = err instanceof AnalysisError;
    setAnalysisState({
      message: isAnalysisError ? err.message : "分析失敗，請稍後再試",
      isError: true,
      needsSettings: isAnalysisError && err.needsSettings,
      canRetry: isAnalysisError ? err.retryable : true,
      retryLabel: "重試",
    });
  }

  // 改成手動輸入：收起錯誤訊息，照片和餐別都保留，直接開始輸入第一項食物。
  $("switch-to-manual").addEventListener("click", () => {
    setAnalysisState({ canRetry: draft.photos.length > 0 });
    form.elements.name.focus();
  });

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
      showAnalysisError(err);
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
      setAnalysisState({ message: err.message, isError: true, canRetry: draft.photos.length > 0 });
    } finally {
      event.target.value = "";
    }
  });
  // 前往設定：先收起編輯視窗但保留草稿（照片和已輸入的食物），回到某一天的畫面時由 resume() 再打開。
  let paused = false;
  $("go-settings").addEventListener("click", () => {
    paused = true;
    dialog.close();
    onOpenSettings();
  });

  function renderDraft() {
    renderPhotos();
    $("item-list").replaceChildren(...draft.items.map(itemRow));
    $("items-empty").hidden = draft.items.length > 0;
    renderNutrition($("draft-totals"), draft.totals());
  }

  function readItemForm() {
    const fields = { name: form.elements.name.value.trim(), portion: form.elements.portion.value.trim() };
    for (const { key } of NUTRIENTS) {
      const raw = form.elements[key].value.trim();
      // 空白當作 0；輸入框裡打了無法解讀的字，瀏覽器會給空字串，所以用 validity 判斷。
      fields[key] = form.elements[key].validity.badInput ? NaN : raw === "" ? 0 : Number(raw);
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
    paused = false;
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
    // 從設定回來：打開剛才收起的草稿，有照片就可以直接重新分析。
    resume() {
      if (!paused) return;
      paused = false;
      setAnalysisState({ canRetry: draft.photos.length > 0 });
      dialog.showModal();
    },
  };
}
