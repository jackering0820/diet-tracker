// 畫面層（UI Shell）：只處理畫面，所有規則交給日記核心。
import { createDiary } from "../core/diary.js";
import { dayRange } from "../core/day.js";
import { formatWithUnit } from "../core/measures.js";
import { createIndexedDbStorage } from "../adapters/indexeddb-storage.js";
import { createClaudeAnalyzer } from "../adapters/claude-analyzer.js";
import { resizePhotos } from "./photos.js";
import { createMealEditor, renderNutrition } from "./meal-editor.js";
import { byId as $, fromLocalInputValue, showMessage, toLocalInputValue } from "./dom.js";
import { renderProgress } from "./goals-view.js";
import { createSettings } from "./settings-view.js";
import { saveBackup } from "./backup.js";
import { createHistory, formatDayTitle } from "./history-view.js";
import { startSky } from "./sky.js";
import { installKeyRipple } from "./keys.js";

startSky($("sky"));
installKeyRipple();

// 新版 App 要升級資料庫時，重新整理以載入新版。
const storage = await createIndexedDbStorage({ onOutdated: () => location.reload() });
const analyzer = createClaudeAnalyzer({ transport: (url, init) => fetch(url, init) });
const diary = createDiary({ storage, clock: { now: () => new Date() }, analyzer });

function formatTime(ms) {
  return new Date(ms).toLocaleTimeString("zh-TW", { hour: "2-digit", minute: "2-digit", hour12: false });
}

const showWaterError = (message) => showMessage("water-error", message);

// 目前的畫面，由網址的 # 決定：
//   #today、沒有 # 或看不懂的網址  { name: "day", pastDay: null }  今天
//   #day/YYYY-MM-DD                { name: "day", pastDay }        過去某一天（哪些日子能打開由日記核心決定）
//   #history                       { name: "history" }             歷史列表
//   #settings                      { name: "settings" }            設定
// 所有重新整理都經過 render()，依這個狀態決定顯示什麼。
function viewFromHash(hash) {
  if (hash === "#history") return { name: "history" };
  if (hash === "#settings") return { name: "settings" };
  if (hash.startsWith("#day/")) {
    const dayKey = diary.dayOrToday(hash.slice("#day/".length));
    return { name: "day", pastDay: dayKey === diary.todayKey() ? null : dayKey };
  }
  return { name: "day", pastDay: null };
}
let view = viewFromHash(location.hash);
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
  if (meal.photos?.length) {
    const thumb = document.createElement("img");
    thumb.className = "meal-thumb";
    thumb.src = meal.photos[0];
    thumb.alt = "";
    button.append(thumb);
  }
  const kcal = document.createElement("span");
  kcal.textContent = `${formatWithUnit("kcal", meal.totals.kcal)} ›`;
  button.append(time, type, kcal);
  button.setAttribute("aria-label", `修改 ${formatTime(meal.at)} 的${meal.mealType}`);
  button.addEventListener("click", () => editor.openExisting(meal.id));
  li.append(button);
  return li;
}

async function render() {
  // 過去某一天屬於「歷史」分頁
  const tab = view.name === "day" && !view.pastDay ? "today" : view.name === "settings" ? "settings" : "history";
  for (const link of document.querySelectorAll("[data-tab]")) {
    if (link.dataset.tab === tab) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  }
  $("day-view").hidden = view.name !== "day";
  $("history-view").hidden = view.name !== "history";
  $("settings-view").hidden = view.name !== "settings";
  $("back-to-history").hidden = !(view.name === "day" && view.pastDay);
  if (view.name === "history") {
    $("page-title").textContent = "歷史";
    $("today-date").textContent = "點一天查看或補記";
    return historyView.open();
  }
  if (view.name === "settings") {
    $("page-title").textContent = "設定";
    $("today-date").textContent = "";
    return settings.open();
  }
  await renderDay();
  editor.resume(); // 從設定回來時，打開剛才收起的那一餐
}

async function renderDay() {
  $("backup-reminder").hidden = !(await diary.backupReminderDue());
  const day = await diary.getDaySummary(currentDayKey());
  const isToday = day.dayKey === diary.todayKey();
  $("page-title").textContent = isToday ? "今天" : formatDayTitle(day.dayKey);
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

const editor = createMealEditor({ diary, onDone: render, onOpenSettings: () => { location.hash = "#settings"; } });
$("add-meal").addEventListener("click", () => editor.openNew(timeForNewRecord()));

// 拍照記一餐：縮圖 → 建立帶照片的草稿 → 打開編輯視窗並開始 AI 分析。
$("meal-photos").addEventListener("change", async (event) => {
  const files = event.target.files;
  if (!files?.length) return;
  try {
    const photos = await resizePhotos(files);
    await editor.openForAnalysis(diary.newMealDraft({ at: timeForNewRecord(), photos }));
  } catch (err) {
    alert(err.message);
  } finally {
    event.target.value = ""; // 讓同一張照片可以再選一次
  }
});

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

// 切換畫面：分頁和「‹ 歷史」都是一般連結，只改網址的 #；這裡跟著網址改狀態，畫面交給 render()。
// 每次切換都會留在瀏覽紀錄裡，所以 iPhone 往右滑（返回）會回到上一個畫面。
addEventListener("hashchange", () => {
  if (view.name === "settings") settings.leave();
  view = viewFromHash(location.hash);
  window.scrollTo(0, 0);
  render();
});

// 從歷史點進某一天
const showDay = (dayKey) => { location.hash = dayKey === diary.todayKey() ? "#today" : `#day/${dayKey}`; };
const historyView = createHistory({ diary, onSelect: showDay });

const settings = createSettings({ diary });

$("reminder-export").addEventListener("click", async () => {
  try {
    await saveBackup(diary);
  } catch (err) {
    alert(`匯出失敗：${err.message}`);
  }
  await render();
});

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
// 設定分頁不重新整理，避免正在輸入的目標被換掉。
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && view.name !== "settings") render();
});

// 捲動後頂端縮成半透明標題列：頂端的小標記離開畫面時加上 compact。
new IntersectionObserver(([entry]) => {
  $("top-bar").classList.toggle("compact", !entry.isIntersecting);
}).observe($("top-sentinel"));

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
