// 畫面層（UI Shell）：只處理畫面，所有規則交給日記核心。
import { createDiary } from "../core/diary.js";
import { dayRange } from "../core/day.js";
import { formatNutrient } from "../core/format.js";
import { createIndexedDbStorage } from "../adapters/indexeddb-storage.js";
import { createMealEditor, renderNutrition } from "./meal-editor.js";
import { byId as $, fromLocalInputValue, showMessage, toLocalInputValue } from "./dom.js";
import { createSettings, renderProgress } from "./goals-view.js";
import { createHistory, formatDayTitle } from "./history-view.js";

// 新版 App 要升級資料庫時，重新整理以載入新版。
const storage = await createIndexedDbStorage({ onOutdated: () => location.reload() });
const diary = createDiary({ storage, clock: { now: () => new Date() } });

function formatTime(ms) {
  return new Date(ms).toLocaleTimeString("zh-TW", { hour: "2-digit", minute: "2-digit", hour12: false });
}

const showWaterError = (message) => showMessage("water-error", message);

// 目前的畫面：
//   { name: "day", pastDay }  某一天；pastDay 是過去某天的 dayKey，null 表示今天
//   { name: "history" }       歷史列表
// 所有重新整理都經過 render()，依這個狀態決定顯示什麼。
let view = { name: "day", pastDay: null };
const currentDayKey = () => view.pastDay ?? diary.todayKey();

// 在過去的日子新增紀錄就是補記，時間規則由日記核心決定。
const timeForNewRecord = () => diary.timeForNewRecord(currentDayKey());

function waterItem(w) {
  const li = document.createElement("li");
  const time = document.createElement("button");
  time.type = "button";
  time.className = "time link";
  time.textContent = formatTime(w.at);
  time.setAttribute("aria-label", `修改 ${formatTime(w.at)} 的 ${w.ml} ml 的時間`);
  time.addEventListener("click", () => openWaterTime(w));
  const ml = document.createElement("span");
  ml.className = "ml";
  ml.textContent = `${w.ml} ml`;
  const del = document.createElement("button");
  del.type = "button";
  del.className = "delete";
  del.textContent = "刪除";
  del.setAttribute("aria-label", `刪除 ${formatTime(w.at)} 的 ${w.ml} ml`);
  del.addEventListener("click", async () => {
    await diary.deleteWater(w.id);
    await render();
  });
  li.append(time, ml, del);
  return li;
}

function mealRow(meal) {
  const li = document.createElement("li");
  const button = document.createElement("button");
  button.type = "button";
  button.className = "meal-row";
  const time = document.createElement("span");
  time.className = "time";
  time.textContent = formatTime(meal.at);
  const type = document.createElement("span");
  type.className = "grow";
  type.textContent = meal.mealType;
  const kcal = document.createElement("span");
  kcal.textContent = `${formatNutrient("kcal", meal.totals.kcal)} 大卡 ›`;
  button.append(time, type, kcal);
  button.setAttribute("aria-label", `修改 ${formatTime(meal.at)} 的${meal.mealType}`);
  button.addEventListener("click", () => editor.openExisting(meal.id));
  li.append(button);
  return li;
}

async function render() {
  const showingHistory = view.name === "history";
  $("history-view").hidden = !showingHistory;
  $("day-view").hidden = showingHistory;
  $("open-history").hidden = showingHistory;
  if (showingHistory) {
    $("page-title").textContent = "歷史";
    $("today-date").textContent = "點一天查看或補記";
    $("back-to-today").hidden = false;
    return historyView.open();
  }
  return renderDay();
}

async function renderDay() {
  const day = await diary.getDaySummary(currentDayKey());
  const isToday = day.dayKey === diary.todayKey();
  $("page-title").textContent = isToday ? "今天" : formatDayTitle(day.dayKey);
  $("back-to-today").hidden = isToday;
  // 標題日期由日記核心的 dayKey 推算，和資料用的是同一個時間來源。
  $("today-date").textContent = new Date(dayRange(day.dayKey).from).toLocaleDateString("zh-TW", {
    year: "numeric", month: "long", day: "numeric", weekday: "long",
  });
  renderProgress($("goal-progress"), day.progress);
  renderNutrition($("nutrition-totals"), day.nutritionTotals);
  $("meals-empty").hidden = day.meals.length > 0;
  $("meal-list").replaceChildren(...day.meals.map(mealRow));
  $("water-total").textContent = day.waterTotalMl.toLocaleString("zh-TW");
  $("water-empty").hidden = day.water.length > 0;
  $("water-list").replaceChildren(...day.water.map(waterItem));
}

async function addWater(ml) {
  try {
    await diary.addWater(ml, timeForNewRecord());
    showWaterError("");
    await render();
    return true;
  } catch (err) {
    showWaterError(err.message);
    return false;
  }
}

const editor = createMealEditor({ diary, onDone: render });
$("add-meal").addEventListener("click", () => editor.openNew(timeForNewRecord()));

// 修改喝水時間的視窗
let movingWater = null;
function openWaterTime(w) {
  movingWater = w;
  $("water-time-form").elements.at.value = toLocalInputValue(w.at);
  showMessage("water-time-error", "");
  $("water-time").showModal();
}
$("water-time-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    await diary.moveWater(movingWater.id, fromLocalInputValue(event.target.elements.at.value));
    $("water-time").close();
    await render();
  } catch (err) {
    showMessage("water-time-error", err.message);
  }
});
$("close-water-time").addEventListener("click", () => $("water-time").close());

// 切換畫面：只改狀態，畫面交給 render()。
function switchTo(nextView) {
  view = nextView;
  window.scrollTo(0, 0);
  return render();
}
const showDay = (dayKey) => switchTo({ name: "day", pastDay: dayKey === diary.todayKey() ? null : dayKey });

const historyView = createHistory({ diary, onSelect: showDay });
$("open-history").addEventListener("click", () => switchTo({ name: "history" }));
$("back-to-today").addEventListener("click", () => showDay(diary.todayKey()));

const settings = createSettings({ diary, onSaved: render });
$("open-settings").addEventListener("click", () => settings.open());

for (const btn of document.querySelectorAll("[data-ml]")) {
  btn.addEventListener("click", () => addWater(Number(btn.dataset.ml)));
}

$("custom-water").addEventListener("submit", async (event) => {
  event.preventDefault();
  const input = $("custom-ml");
  const raw = input.value.trim();
  if (await addWater(raw === "" ? NaN : Number(raw))) input.value = "";
});

// 從背景回到前景時重新整理，跨過午夜也會換成新的一天。
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") render();
});

await render();

// 本機開發時不使用 service worker，避免一直拿到快取裡的舊檔案。
const isLocalDev = ["localhost", "127.0.0.1"].includes(location.hostname);
if ("serviceWorker" in navigator) {
  if (isLocalDev) {
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.all(registrations.map((r) => r.unregister()));
  } else {
    navigator.serviceWorker.register("sw.js");
  }
}
