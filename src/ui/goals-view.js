// 目標的進度條。指標和狀態的文字、圖示都來自核心的目錄，這裡只負責顯示。
import { GOAL_MEASURES, formatMeasure } from "../core/measures.js";
import { GOAL_STATUSES } from "../core/goals.js";

// 例如「✅ 達標」；沒有圖示的狀態（－）只顯示文字，例如「未設定」。
function statusLabel(status) {
  const { text, icon } = GOAL_STATUSES[status];
  return icon === "－" ? text : `${icon} ${text}`;
}

export function renderProgress(list, progress) {
  list.replaceChildren(...GOAL_MEASURES.map(({ key, name: measureName, unit }) => {
    const p = progress[key];
    const li = document.createElement("li");
    li.className = p.status;

    const head = document.createElement("div");
    head.className = "progress-head";
    const name = document.createElement("span");
    name.className = "grow";
    name.textContent = measureName;
    const numbers = document.createElement("span");
    const value = formatMeasure(key, p.value);
    numbers.textContent = p.goal === null ? `${value} ${unit}` : `${value} / ${formatMeasure(key, p.goal)} ${unit}`;
    const status = document.createElement("span");
    status.className = "status";
    status.textContent = statusLabel(p.status);
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
