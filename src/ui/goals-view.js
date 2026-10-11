// 今日目標的進度條，以及設定每日目標的視窗。
import { formatNutrient } from "../core/meal.js";
import { byId as $, showMessage } from "./dom.js";

const GOAL_ROWS = [
  { key: "kcal", label: "熱量", unit: "大卡", ceiling: true },
  { key: "protein", label: "蛋白質", unit: "g" },
  { key: "veg", label: "蔬菜", unit: "份" },
  { key: "waterMl", label: "喝水", unit: "ml" },
];

function statusText({ goal, achieved }, ceiling) {
  if (goal === null) return "未設定";
  if (achieved) return "✅ 達標";
  return ceiling ? "❌ 超過" : "❌ 未達標";
}

export function renderProgress(list, progress) {
  list.replaceChildren(...GOAL_ROWS.map(({ key, label, unit, ceiling }) => {
    const p = progress[key];
    const li = document.createElement("li");
    if (p.goal === null) li.className = "unset";
    else if (p.achieved) li.className = "achieved";
    else li.className = ceiling ? "over" : "missed";

    const head = document.createElement("div");
    head.className = "progress-head";
    const name = document.createElement("span");
    name.className = "grow";
    name.textContent = label;
    const numbers = document.createElement("span");
    const value = formatNutrient(key, p.value);
    numbers.textContent = p.goal === null ? `${value} ${unit}` : `${value} / ${formatNutrient(key, p.goal)} ${unit}`;
    const status = document.createElement("span");
    status.className = "status";
    status.textContent = statusText(p, ceiling);
    head.append(name, numbers, status);

    const bar = document.createElement("div");
    bar.className = "bar";
    bar.setAttribute("aria-hidden", "true");
    const fill = document.createElement("div");
    const ratio = p.goal ? Math.min(p.value / p.goal, 1) : 0;
    fill.style.width = `${ratio * 100}%`;
    bar.append(fill);

    li.append(head, bar);
    return li;
  }));
}

// onSaved 在儲存目標之後呼叫，讓「今天」畫面重新整理。
export function createSettings({ diary, onSaved }) {
  const dialog = $("settings");
  const form = $("goals-form");
  const keys = GOAL_ROWS.map((r) => r.key);

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const goals = {};
    for (const key of keys) {
      const input = form.elements[key];
      const raw = input.value.trim();
      goals[key] = input.validity.badInput ? NaN : raw === "" ? null : Number(raw);
    }
    try {
      await diary.setGoals(goals);
      dialog.close();
      await onSaved();
    } catch (err) {
      showMessage("goals-error", err.message);
    }
  });

  $("close-settings").addEventListener("click", () => dialog.close());

  return {
    async open() {
      const goals = await diary.getGoals();
      for (const key of keys) form.elements[key].value = goals[key] ?? "";
      showMessage("goals-error", "");
      dialog.showModal();
    },
  };
}
