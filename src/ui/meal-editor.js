// 一餐的編輯畫面（全螢幕）：手動新增、修改、拍照分析共用。
// 草稿、檢查、總計的預覽、那一天熱量的預告都由日記核心負責；這裡只負責畫面。
import { MEAL_TYPES } from "../core/meal.js";
import { NUTRIENTS, formatMeasure, formatWithUnit } from "../core/measures.js";
import { measureLabel, renderMeasureInputs } from "./measure-fields.js";
import { AnalysisError } from "../core/analysis-error.js";
import { resizePhotos } from "./photos.js";
import { byId as $, fromLocalInputValue, showMessage, toLocalInputValue } from "./dom.js";

const FORM_STILL_OPEN = "還有一項食物沒有加入或取消";

export function renderNutrition(dl, totals) {
  dl.replaceChildren(...NUTRIENTS.flatMap(({ key, name }) => {
    const dt = document.createElement("dt");
    dt.textContent = name;
    const dd = document.createElement("dd");
    dd.textContent = formatMeasure(key, totals[key]);
    return [dt, dd];
  }));
}

// 這餐總計：每一項營養一行，括號裡是還開著的表單帶來的變化，例如「610 大卡（+85）」
function renderMealTotals(dl, totals, before) {
  dl.replaceChildren(...NUTRIENTS.map(({ key, name, unit }) => {
    const row = document.createElement("div");
    row.className = "lrow";
    const dt = document.createElement("dt");
    dt.textContent = name;
    const lead = document.createElement("span");
    lead.className = "lead";
    lead.setAttribute("aria-hidden", "true");
    const dd = document.createElement("dd");
    dd.className = "n";
    const value = document.createElement("b");
    value.textContent = formatMeasure(key, totals[key]);
    dd.append(value, ` ${unit}`);
    const change = Number(formatMeasure(key, totals[key])) - Number(formatMeasure(key, before[key]));
    if (Math.abs(change) > 1e-9) {
      const delta = document.createElement("span");
      delta.className = change > 0 ? "delta up" : "delta down";
      delta.textContent = `（${change > 0 ? "+" : "−"}${formatMeasure(key, Math.abs(change))}）`;
      dd.append(delta);
    }
    row.append(dt, lead, dd);
    return row;
  }));
}

// onDone 在儲存或刪除之後呼叫，讓「今天」畫面重新整理。
// onOpenSettings 在還沒設定金鑰、使用者按「前往設定」時呼叫（編輯視窗先收起，草稿不會不見，之後用 resume() 打開）。
export function createMealEditor({ diary, onDone, onOpenSettings }) {
  const dialog = $("meal-editor");
  const form = $("item-form");
  renderMeasureInputs($("nutrient-fields"), NUTRIENTS, measureLabel);
  let draft = null;
  let editingItemId = null; // 正在修改的那一項；新增時是 null

  const showItemError = (message) => showMessage("item-error", message);
  const showError = (message) => showMessage("editor-error", message);

  // ---------- 餐別：四個鍵帽 ----------
  const typeKeys = MEAL_TYPES.map((type) => {
    const key = document.createElement("button");
    key.type = "button";
    key.className = "secondary type-key";
    key.setAttribute("role", "radio");
    key.textContent = type;
    key.addEventListener("click", () => {
      draft.mealType = type;
      changed();
      renderMealType();
    });
    return key;
  });
  $("meal-types").replaceChildren(...typeKeys);

  function renderMealType() {
    for (const key of typeKeys) key.setAttribute("aria-checked", String(key.textContent === draft.mealType));
    const byTime = diary.defaultMealType(draft.at);
    const hint = $("type-hint");
    const picked = draft.mealType !== byTime;
    hint.textContent = picked ? `已改成${draft.mealType}（依時間預設是${byTime}）` : `依時間預設是${byTime}`;
    hint.classList.toggle("picked", picked);
  }

  // ---------- 食物表單：新增或修改一項時才展開 ----------
  function closeItemForm() {
    form.reset();
    form.hidden = true;
    showItemError("");
    editingItemId = null;
    $("open-item-form").hidden = false;
    renderItems();
    renderTotals();
  }

  function openItemForm(item = null) {
    form.reset();
    showItemError("");
    showError("");
    editingItemId = item?.id ?? null;
    if (item) for (const key of ["name", "portion", ...NUTRIENTS.map((n) => n.key)]) form.elements[key].value = item[key];
    $("item-form-title").textContent = item ? "修改食物" : "新增食物";
    $("item-submit").textContent = item ? "更新這一項" : "加入這一項";
    form.hidden = false;
    $("open-item-form").hidden = true;
    renderItems();
    renderTotals();
    const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
    form.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "nearest" });
    form.elements.name.focus({ preventScroll: true });
  }

  // 表單的營養數字：空白當 0；打了無法解讀的字，瀏覽器會給空字串，所以用 validity 判斷（NaN 交給核心）
  function readNutrients() {
    return Object.fromEntries(NUTRIENTS.map(({ key }) => {
      const input = form.elements[key];
      const raw = input.value.trim();
      return [key, input.validity.badInput ? NaN : raw === "" ? 0 : Number(raw)];
    }));
  }

  function readItemForm() {
    return { name: form.elements.name.value.trim(), portion: form.elements.portion.value.trim(), ...readNutrients() };
  }

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    try {
      const fields = readItemForm();
      if (editingItemId) draft.updateItem(editingItemId, fields);
      else draft.addItem(fields);
      changed();
      closeItemForm();
      $("open-item-form").focus();
    } catch (err) {
      showItemError(err.message);
    }
  });
  form.addEventListener("input", () => {
    showItemError("");
    renderTotals();
  });
  $("item-cancel").addEventListener("click", closeItemForm);
  $("open-item-form").addEventListener("click", () => openItemForm());

  // ---------- 食物清單 ----------
  function itemRow(item) {
    const li = document.createElement("li");
    li.className = item.id === editingItemId ? "irow editing" : "irow";
    const text = document.createElement("span");
    text.className = "nm";
    const name = document.createElement("b");
    name.textContent = item.name;
    const sub = document.createElement("span");
    sub.className = "n";
    sub.textContent = `${item.portion ? `${item.portion}・` : ""}蛋白質 ${formatWithUnit("protein", item.protein)}`;
    text.append(name, sub);
    const kcal = document.createElement("span");
    kcal.className = "kc n";
    kcal.textContent = formatWithUnit("kcal", item.kcal);
    const edit = document.createElement("button");
    edit.type = "button";
    edit.className = "secondary ibtn";
    edit.textContent = "修改";
    edit.setAttribute("aria-label", `修改 ${item.name}`);
    edit.addEventListener("click", () => openItemForm(item));
    const del = document.createElement("button");
    del.type = "button";
    del.className = "secondary ibtn";
    del.textContent = "刪除";
    del.setAttribute("aria-label", `刪除 ${item.name}`);
    del.addEventListener("click", () => {
      draft.removeItem(item.id);
      changed();
      if (editingItemId === item.id) closeItemForm();
      else renderDraft();
    });
    li.append(text, kcal, edit, del);
    return li;
  }

  function renderItems() {
    $("item-list").replaceChildren(...draft.items.map(itemRow));
    $("items-empty").hidden = draft.items.length > 0 || !form.hidden;
    $("item-count").textContent = draft.items.length ? `${draft.items.length} 項` : "";
  }

  // ---------- 這餐總計和那一天熱量的預告（打字時就更新） ----------
  let previewRequest = 0;
  async function renderTotals() {
    const before = draft.totals();
    const totals = draft.previewTotals(form.hidden ? null : readNutrients(), editingItemId);
    renderMealTotals($("draft-totals"), totals, before);

    const request = ++previewRequest; // 打字很快時，只用最後一次的結果
    const target = draft;
    const day = await diary.previewDayKcal({ mealId: draft.id ?? null, at: draft.at, kcal: totals.kcal });
    if (request !== previewRequest || target !== draft) return;
    const isToday = new Date(draft.at).toDateString() === new Date().toDateString();
    const preview = $("day-preview");
    const amount = document.createElement("b");
    amount.className = "n";
    amount.textContent = day.kcal.toLocaleString("zh-TW");
    preview.replaceChildren(`存了之後，${isToday ? "今天" : "那天"}熱量 `, amount);
    if (day.goal === null) {
      preview.append(" 大卡");
    } else {
      preview.append(` / ${day.goal.toLocaleString("zh-TW")} 大卡・${day.overBy > 0 ? `會超過上限 ${day.overBy.toLocaleString("zh-TW")} 大卡` : "還在上限內"}`);
    }
    preview.classList.toggle("over", day.overBy > 0);
  }

  // ---------- 照片和 AI 分析 ----------
  function renderPhotos() {
    $("draft-photos").replaceChildren(...draft.photos.map((src, i) => {
      const cover = document.createElement("span");
      cover.className = "cover";
      const img = document.createElement("img");
      img.src = src;
      img.alt = `這一餐的第 ${i + 1} 張照片`;
      cover.append(img);
      return cover;
    }));
    $("photo-count").textContent = draft.photos.length ? `${draft.photos.length} 張` : "";
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
    $("open-item-form").disabled = busy;
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
    openItemForm();
  });

  // 用 AI 分析草稿的照片。分析期間關掉或換了別的草稿，結果就不再更新畫面。
  async function analyze() {
    const target = draft;
    setAnalysisState({ busy: true, message: `分析中…（${target.photos.length} 張照片）` });
    try {
      await diary.analyzeDraft(target);
      if (draft !== target) return;
      setAnalysisState({});
      changed();
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
      changed();
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
    renderItems();
    renderTotals();
  }

  // 修改日期時間：儲存後這一餐會移到新的那一天；依時間的預設餐別和那一天的預告也跟著變。
  $("meal-at").addEventListener("change", (event) => {
    draft.at = fromLocalInputValue(event.target.value);
    changed();
    renderMealType();
    renderTotals();
  });

  // ---------- 儲存、刪除、離開 ----------
  // 存好之後畫面換成「✓ 已儲存這一餐」和「回到今天」；之後又改了什麼，就換回儲存按鍵。
  function showSaved(saved) {
    $("editor-saved").hidden = !saved;
    $("back-to-day").hidden = !saved;
    $("editor-actions").hidden = saved;
    $("delete-area").hidden = saved || !draft.id;
  }
  function changed() {
    showError("");
    if (!$("editor-saved").hidden) showSaved(false);
  }

  $("save-meal").addEventListener("click", async () => {
    // 表單還開著時擋下：不然那一項會默默不見
    if (!form.hidden) {
      showError(FORM_STILL_OPEN);
      return;
    }
    try {
      await diary.saveMeal(draft);
      showError("");
      showSaved(true);
      $("back-to-day").focus();
      await onDone();
    } catch (err) {
      showError(err.message);
    }
  });

  // 刪除這一餐：畫面內確認（不用瀏覽器的確認視窗）
  function askDelete(asking) {
    $("delete-confirm").hidden = !asking;
    $("delete-meal").hidden = asking;
    (asking ? $("delete-no") : $("delete-meal")).focus();
  }
  $("delete-meal").addEventListener("click", () => askDelete(true));
  $("delete-no").addEventListener("click", () => askDelete(false));
  $("delete-yes").addEventListener("click", async () => {
    try {
      await diary.deleteMeal(draft.id);
      dialog.close();
      await onDone();
    } catch (err) {
      showError(`刪除失敗：${err.message}`);
    }
  });

  for (const id of ["close-editor", "editor-back", "back-to-day"]) $(id).addEventListener("click", () => dialog.close());

  // formOpen：一打開就展開空白的食物表單（手寫新增一餐）
  function open(newDraft, { formOpen = false } = {}) {
    paused = false;
    draft = newDraft;
    const isExisting = Boolean(draft.id);
    $("editor-title").textContent = isExisting ? "修改這一餐" : "新增一餐";
    const isToday = new Date(draft.at).toDateString() === new Date().toDateString();
    $("editor-back").textContent = isToday ? "‹ 今天" : "‹ 返回";
    $("meal-at").value = toLocalInputValue(draft.at);
    showError("");
    showSaved(false);
    $("delete-confirm").hidden = true;
    $("delete-meal").hidden = false;
    setAnalysisState({});
    renderMealType();
    closeItemForm();
    renderPhotos();
    dialog.showModal();
    dialog.scrollTop = 0;
    if (formOpen) openItemForm();
  }

  return {
    // 用照片建立的草稿打開，並馬上開始 AI 分析。
    openForAnalysis(photoDraft) {
      open(photoDraft);
      return analyze();
    },
    // 手寫新增一餐。at：這一餐的時間；補記過去的日子時由畫面指定。
    openNew(at) {
      open(diary.newMealDraft({ at }), { formOpen: true });
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
