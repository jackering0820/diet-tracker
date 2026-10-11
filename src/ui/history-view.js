// 歷史列表：往前翻看每一天，每天顯示 4 項目標的 ✅ / ❌，沒有紀錄的日子顯示「無紀錄」。
import { dayRange } from "../core/day.js";
import { byId as $ } from "./dom.js";

const PAGE_DAYS = 14;
const SHORT_LABELS = { kcal: "熱量", protein: "蛋白質", veg: "蔬菜", waterMl: "喝水" };
const STATUS_ICON = { achieved: "✅", over: "❌", missed: "❌", unset: "－" };

export function formatDayTitle(dayKey) {
  return new Date(dayRange(dayKey).from).toLocaleDateString("zh-TW", { month: "long", day: "numeric", weekday: "short" });
}

function historyRow(day, onSelect) {
  const li = document.createElement("li");
  const button = document.createElement("button");
  button.type = "button";
  button.className = "history-row";

  const date = document.createElement("span");
  date.className = "history-date";
  date.textContent = formatDayTitle(day.dayKey);
  button.append(date);

  if (!day.hasRecords) {
    const none = document.createElement("span");
    none.className = "empty-inline";
    none.textContent = "無紀錄";
    button.append(none);
  } else {
    const chips = document.createElement("span");
    chips.className = "chips";
    for (const [key, p] of Object.entries(day.progress)) {
      const chip = document.createElement("span");
      chip.className = `chip ${p.status}`;
      chip.textContent = `${SHORT_LABELS[key]} ${STATUS_ICON[p.status]}`;
      chips.append(chip);
    }
    button.append(chips);
  }

  button.addEventListener("click", () => onSelect(day.dayKey));
  li.append(button);
  return li;
}

// onSelect(dayKey)：點進某一天時呼叫。
export function createHistory({ diary, onSelect }) {
  let oldest = null;

  async function loadPage() {
    const days = await diary.getHistory({ before: oldest ?? undefined, days: PAGE_DAYS });
    oldest = days.at(-1).dayKey;
    $("history-list").append(...days.map((d) => historyRow(d, onSelect)));
  }

  $("load-older").addEventListener("click", loadPage);

  return {
    // 每次打開都從今天重新載入，資料才會是最新的。
    async open() {
      oldest = null;
      $("history-list").replaceChildren();
      await loadPage();
    },
  };
}
