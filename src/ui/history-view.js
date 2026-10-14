// 歷史列表：往前翻看每一天，每天顯示 4 項目標的 ✅ / ❌，沒有紀錄的日子顯示「無紀錄」。
import { dayRange } from "../core/day.js";
import { GOAL_MEASURES } from "../core/measures.js";
import { GOAL_STATUSES } from "../core/goals.js";
import { byId as $ } from "./dom.js";

const PAGE_DAYS = 14;

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
    for (const { key, name } of GOAL_MEASURES) {
      const { status } = day.progress[key];
      const chip = document.createElement("span");
      chip.className = `chip ${status}`;
      chip.textContent = `${name} ${GOAL_STATUSES[status].icon}`;
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
  let loading = false;
  // 每次重新打開就換一個編號；舊的載入結果回來時編號不同，直接丟掉。
  let generation = 0;

  async function loadPage() {
    if (loading) return; // 避免連按時同一頁載入兩次
    loading = true;
    $("load-older").disabled = true;
    const myGeneration = generation;
    try {
      const days = await diary.getHistory({ before: oldest ?? undefined, days: PAGE_DAYS });
      if (myGeneration !== generation) return;
      oldest = days.at(-1).dayKey;
      $("history-list").append(...days.map((d) => historyRow(d, onSelect)));
    } finally {
      // 只有同一次打開的載入才解除鎖定，舊的載入不能影響新的。
      if (myGeneration === generation) {
        loading = false;
        $("load-older").disabled = false;
      }
    }
  }

  $("load-older").addEventListener("click", loadPage);

  return {
    // 每次打開都從今天重新載入，資料才會是最新的。
    async open() {
      generation += 1;
      loading = false;
      oldest = null;
      $("history-list").replaceChildren();
      await loadPage();
    },
  };
}
