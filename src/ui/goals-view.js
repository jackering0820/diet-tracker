// 今日目標的進度條，以及設定每日目標的視窗。
import { formatNutrient } from "../core/format.js";
import { byId as $, showMessage } from "./dom.js";

const GOAL_ROWS = [
  { key: "kcal", label: "熱量", unit: "大卡" },
  { key: "protein", label: "蛋白質", unit: "g" },
  { key: "veg", label: "蔬菜", unit: "份" },
  { key: "waterMl", label: "喝水", unit: "ml" },
];

// 狀態由日記核心判斷，這裡只負責顯示。
const STATUS_TEXT = { unset: "未設定", achieved: "✅ 達標", over: "❌ 超過", missed: "❌ 未達標", noRecords: "無紀錄" };

export function renderProgress(list, progress) {
  list.replaceChildren(...GOAL_ROWS.map(({ key, label, unit }) => {
    const p = progress[key];
    const li = document.createElement("li");
    li.className = p.status;

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
    status.textContent = STATUS_TEXT[p.status];
    head.append(name, numbers, status);

    const bar = document.createElement("div");
    bar.className = "bar";
    bar.setAttribute("aria-hidden", "true");
    const fill = document.createElement("div");
    // 目標是 0 時無法算比例：有判斷結果就畫滿，未設定就留空。
    let ratio = 0;
    if (p.goal > 0) ratio = Math.min(p.value / p.goal, 1);
    else if (p.status !== "unset") ratio = 1;
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
