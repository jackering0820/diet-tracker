// 一餐的編輯畫面：手動新增和修改共用。之後拍照分析也會把結果放進這裡。
import { MEAL_TYPES, NUTRIENTS, NUTRIENT_LABELS, formatNutrient } from "../core/meal.js";

const $ = (id) => document.getElementById(id);

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
export function createMealEditor({ diary, onDone }) {
  const dialog = $("meal-editor");
  const form = $("item-form");
  let draft = null;
  let editingItemId = null;

  $("meal-type").replaceChildren(...MEAL_TYPES.map((t) => new Option(t, t)));

  function showMessage(id, message) {
    $(id).textContent = message;
    $(id).hidden = !message;
  }
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

  function renderDraft() {
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
    await diary.deleteMeal(draft.id);
    dialog.close();
    await onDone();
  });

  $("close-editor").addEventListener("click", () => dialog.close());

  function open(newDraft) {
    draft = newDraft;
    const isExisting = Boolean(draft.id);
    $("editor-title").textContent = isExisting ? "修改這一餐" : "新增一餐";
    $("delete-meal").hidden = !isExisting;
    $("meal-type").value = draft.mealType;
    resetItemForm();
    showError("");
    renderDraft();
    dialog.showModal();
  }

  return {
    openNew() {
      open(diary.newMealDraft());
    },
    async openExisting(id) {
      open(await diary.editMeal(id));
    },
  };
}
