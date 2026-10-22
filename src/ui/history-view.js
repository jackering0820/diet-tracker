// 歷史：一週一排，最新的一週在最上面，每排左邊是最新的一天。
// 每天一張卡片：星期、日期、四顆星（各標一個字）、當天熱量；整天沒紀錄是虛線的「無紀錄」卡片。
// 今天畫面的「本週」貨架也用同一種卡片（比較窄、不寫熱量）。
import { dayRange } from "../core/day.js";
import { GOAL_MEASURES, formatWithUnit } from "../core/measures.js";
import { GOAL_STATUSES } from "../core/goals.js";
import { byId as $ } from "./dom.js";
import { statusStar } from "./stars.js";

const WEEK_DAYS = 7;
const WEEK_NAMES = ["本週", "上週", "兩週前", "三週前"];

const dateOf = (dayKey) => new Date(dayRange(dayKey).from);

export function formatDayTitle(dayKey) {
  return dateOf(dayKey).toLocaleDateString("zh-TW", { month: "long", day: "numeric", weekday: "short" });
}

const monthDay = (dayKey) => `${dateOf(dayKey).getMonth() + 1}/${dateOf(dayKey).getDate()}`;

// 四顆星，每顆旁邊標著是哪一項，顏色不是唯一的提示
function goalStars(progress) {
  const stars = document.createElement("span");
  stars.className = "stars";
  stars.setAttribute("role", "img");
  stars.setAttribute("aria-label", GOAL_MEASURES.map(({ key, name }) => `${name}${GOAL_STATUSES[progress[key].status].text}`).join("、"));
  for (const { key, short } of GOAL_MEASURES) {
    const item = document.createElement("span");
    item.className = "sg";
    item.append(statusStar(progress[key].status), short);
    stars.append(item);
  }
  return stars;
}

// 一天的卡片。wide：歷史用的寬卡片（多寫當天熱量）；isToday：有框和「今天」標籤。
export function dayTile(day, { wide = false, isToday = false, onSelect }) {
  const tile = document.createElement("button");
  tile.type = "button";
  tile.className = ["day", wide && "wide", isToday && "is-today", !day.hasRecords && "none"].filter(Boolean).join(" ");

  const head = document.createElement("span");
  head.className = "h";
  const weekday = document.createElement("span");
  weekday.textContent = dateOf(day.dayKey).toLocaleDateString("zh-TW", { weekday: "short" });
  if (isToday) {
    const badge = document.createElement("span");
    badge.className = "badge";
    badge.textContent = "今天";
    weekday.append(badge);
  }
  const date = document.createElement("b");
  date.className = "n";
  date.textContent = monthDay(day.dayKey);
  head.append(weekday, date);
  tile.append(head);

  if (!day.hasRecords) {
    const none = document.createElement("span");
    none.className = "none-t";
    none.textContent = GOAL_STATUSES.noRecords.text;
    tile.append(none);
    tile.setAttribute("aria-label", `${formatDayTitle(day.dayKey)} 無紀錄，點一下補記`);
  } else {
    tile.append(goalStars(day.progress));
    if (wide) {
      const kcal = document.createElement("span");
      kcal.className = "kc n";
      kcal.textContent = formatWithUnit("kcal", day.nutritionTotals.kcal);
      tile.append(kcal);
    }
  }
  tile.addEventListener("click", () => onSelect(day.dayKey));
  return tile;
}

// 一週一排：標題是第幾週、日期範圍和「4 項全達標 N 天」（四項全達標由日記核心判斷）
function weekRow(days, index, todayKey, onSelect) {
  const section = document.createElement("section");
  section.className = "card week";
  const head = document.createElement("div");
  head.className = "sec-h";
  const title = document.createElement("h2");
  title.textContent = WEEK_NAMES[index] ?? `${index} 週前`;
  const hint = document.createElement("span");
  hint.className = "hint";
  const range = document.createElement("span");
  range.className = "n";
  range.textContent = `${monthDay(days.at(-1).dayKey)} – ${monthDay(days[0].dayKey)}`;
  hint.append(range, `・${GOAL_MEASURES.length} 項全達標 ${days.filter((d) => d.allAchieved).length} 天`);
  head.append(title, hint);
  section.setAttribute("aria-label", `${title.textContent} ${range.textContent}`);

  const shelf = document.createElement("div");
  shelf.className = "shelf";
  shelf.append(...days.map((day) => dayTile(day, { wide: true, isToday: day.dayKey === todayKey, onSelect })));
  section.append(head, shelf);
  return section;
}

// 圖例：四種星星的意思
export function renderLegend(container) {
  container.replaceChildren(...["achieved", "over", "missed", "unset"].map((status) => {
    const item = document.createElement("span");
    item.append(statusStar(status), status === "over" ? "超過上限" : GOAL_STATUSES[status].text);
    return item;
  }));
}

// onSelect(dayKey)：點進某一天時呼叫。
export function createHistory({ diary, onSelect }) {
  let oldest = null;
  let weeks = 0;
  let loading = false;
  // 每次重新打開就換一個編號；舊的載入結果回來時編號不同，直接丟掉。
  let generation = 0;

  renderLegend($("history-legend"));

  // 「載入更早的日子」一次多一週
  async function loadWeek() {
    if (loading) return; // 避免連按時同一週載入兩次
    loading = true;
    $("load-older").disabled = true;
    const myGeneration = generation;
    try {
      const days = await diary.getHistory({ before: oldest ?? undefined, days: WEEK_DAYS });
      if (myGeneration !== generation) return;
      oldest = days.at(-1).dayKey;
      $("history-weeks").append(weekRow(days, weeks, diary.todayKey(), onSelect));
      weeks += 1;
    } finally {
      // 只有同一次打開的載入才解除鎖定，舊的載入不能影響新的。
      if (myGeneration === generation) {
        loading = false;
        $("load-older").disabled = false;
      }
    }
  }

  $("load-older").addEventListener("click", loadWeek);

  return {
    // 每次打開都從今天重新載入，資料才會是最新的；先顯示最近三週。
    async open() {
      generation += 1;
      loading = false;
      oldest = null;
      weeks = 0;
      $("history-weeks").replaceChildren();
      const myGeneration = generation;
      for (let i = 0; i < 3 && myGeneration === generation; i++) await loadWeek();
    },
  };
}
