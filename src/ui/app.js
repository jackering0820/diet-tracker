// 畫面層（UI Shell）：只處理畫面，所有規則交給日記核心。
import { createDiary } from "../core/diary.js";
import { dayRange } from "../core/day.js";
import { WATER_MEASURE, formatWithUnit } from "../core/measures.js";
import { createIndexedDbStorage } from "../adapters/indexeddb-storage.js";
import { createClaudeAnalyzer } from "../adapters/claude-analyzer.js";
import { resizePhotos } from "./photos.js";
import { createMealEditor, renderNutrition } from "./meal-editor.js";
import { byId as $, fromLocalInputValue, showMessage, toLocalInputValue } from "./dom.js";
import { createAstrolabe, createConstellation, createMiniConstellation } from "./astrolabe.js";
import { createSettings } from "./settings-view.js";
import { saveBackup } from "./backup.js";
import { createHistory, dayTile, formatDayTitle } from "./history-view.js";
import { startSky } from "./sky.js";
import { installKeyRipple } from "./keys.js";

// 夜空：畫得出來時，星座也在夜空裡（3D），SVG 星座只在畫不出來時使用
const sky = startSky($("sky"), { onLost: () => { $("constellation").hidden = false; } });
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

// 喝水紀錄是一排小標籤，點一筆打開「修改喝水時間」面板（也可以在面板裡刪除）。
// isNew：剛加入的那一筆，滑進來。
function waterItem(w, isNew) {
  const chip = document.createElement("button");
  chip.type = "button";
  chip.className = isNew ? "log n fresh" : "log n";
  chip.textContent = `${formatTime(w.at)}・${w.ml} ml`;
  chip.setAttribute("aria-label", `${formatTime(w.at)} 喝了 ${w.ml} ml，點一下修改時間`);
  chip.addEventListener("click", () => openWaterTime(w));
  return chip;
}

// 星盤卡、頂端星座、喝水面板旁的小星座：只建立一次，之後每次重新整理只更新數值。
const astrolabe = createAstrolabe({ chart: $("astrolabe"), centerBig: $("astro-big"), centerSmall: $("astro-small"), list: $("goal-progress") });
const constellation = createConstellation($("constellation"));
$("constellation").hidden = Boolean(sky);
const miniConstellation = createMiniConstellation($("mini-constellation"));

// 重新播放一次 CSS 動畫（例如數字變了時的跳一下）
function replay(el, cls) {
  el.classList.remove(cls);
  void el.offsetWidth;
  el.classList.add(cls);
}

// 「吃了什麼」貨架上的一張卡片：有照片用照片當封面，沒有照片是有橫線的羊皮紙卡片（手寫的一餐）。
// 下方是時間・餐別、標題（日記核心串好的食物名稱）、熱量；點一下修改這一餐。
// isNew：剛加入的那一餐（例如再記一次），滑進來。
// 卡片的封面：有照片用照片；沒有照片是有橫線的羊皮紙，寫上標題（before／after：標題前後要加的元素）
function mealCover(photo, title, { before, after } = {}) {
  const cover = document.createElement("span");
  if (photo) {
    cover.className = "cover";
    const img = document.createElement("img");
    img.src = photo;
    img.alt = "";
    cover.append(img);
    return cover;
  }
  cover.className = "cover note";
  const name = document.createElement("b");
  name.textContent = title;
  cover.append(...[before, name, after].filter(Boolean));
  return cover;
}

function mealCard(meal, isNew) {
  const card = document.createElement("button");
  card.type = "button";
  card.className = isNew ? "meal fresh" : "meal";
  const type = document.createElement("span");
  type.className = "k";
  type.textContent = meal.mealType;
  const tag = document.createElement("i");
  tag.textContent = "手寫";
  const cover = mealCover(meal.photos?.[0], meal.title, { before: type, after: tag });
  const cap = document.createElement("span");
  cap.className = "cap";
  const when = document.createElement("span");
  when.className = "t n";
  when.textContent = `${formatTime(meal.at)}・${meal.mealType}`;
  const title = document.createElement("b");
  title.textContent = meal.title;
  const kcal = document.createElement("span");
  kcal.className = "k n";
  kcal.textContent = formatWithUnit("kcal", meal.totals.kcal);
  cap.append(when, title, kcal);
  card.append(cover, cap);
  card.setAttribute("aria-label", `${when.textContent}：${meal.title}，${kcal.textContent}，點一下修改`);
  card.addEventListener("click", () => editor.openExisting(meal.id));
  return card;
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
  // 從設定回到原本那一天時，打開剛才收起的那一餐；去了別天就不打開，免得草稿出現在不相關的日子
  if (editorLeftFrom && view.name === "day" && view.pastDay === editorLeftFrom.pastDay) {
    editorLeftFrom = null;
    editor.resume();
  }
}

// 上一次畫出來的那一天：判斷是不是「同一天的資料變了」
let lastShown = null;

async function renderDay() {
  const shown = view;
  // 同時讀取；最近吃過和本週只在今天顯示
  const [reminderDue, day, recent, week] = await Promise.all([
    diary.backupReminderDue(),
    diary.getDaySummary(currentDayKey()),
    view.pastDay ? [] : diary.recentMeals(),
    view.pastDay ? [] : diary.getHistory({ days: 7 }),
  ]);
  // 等資料時已經切到別的畫面，就不要用舊的結果蓋掉新畫面的標題
  if (view !== shown) return;
  // 換到另一天不算資料變化：加上 instant 直接畫出來，不播放動畫
  const sameDay = day.dayKey === lastShown?.dayKey;
  if (!sameDay) $("day-view").classList.add("instant");
  $("backup-reminder").hidden = !reminderDue;
  const isToday = day.dayKey === diary.todayKey();
  $("page-title").textContent = isToday ? "今天" : formatDayTitle(day.dayKey);
  // 標題日期由日記核心的 dayKey 推算，和資料用的是同一個時間來源。
  $("today-date").textContent = new Date(dayRange(day.dayKey).from).toLocaleDateString("zh-TW", {
    year: "numeric", month: "long", day: "numeric", weekday: "long",
  });
  astrolabe.update(day.progress, day.hasRecords);
  constellation.update(day.constellationLit);
  // 同一天裡剛加入的喝水和餐點（換到另一天不算）
  const isNewWater = (w) => sameDay && !lastShown.waterIds.includes(w.id);
  const isNewMeal = (m) => sameDay && !lastShown.mealIds.includes(m.id);
  // 夜空：加了水或記了一餐時轉動一下；換到另一天直接畫（打開 App 的飛入由夜空自己處理）
  sky?.update(day.constellationLit, day.water.some(isNewWater) || day.meals.some(isNewMeal));
  miniConstellation.update(day.constellationLit);
  renderNutrition($("nutrition-totals"), day.nutritionTotals);
  renderMealShelf(day, isToday, isNewMeal);
  renderRecent(recent);
  renderWeek(week);

  const waterGoal = day.progress[WATER_MEASURE.key].goal;
  $("water-total").textContent = day.waterTotalMl.toLocaleString("zh-TW");
  $("water-goal").textContent = waterGoal === null ? " ml" : ` / ${waterGoal.toLocaleString("zh-TW")} ml`;
  $("water-empty").hidden = day.water.length > 0;
  $("water-list").replaceChildren(...day.water.map((w) => waterItem(w, isNewWater(w))));

  if (sameDay) {
    if (day.waterTotalMl !== lastShown.waterTotalMl) replay($("water-total"), "bump");
  } else {
    // 先讀一次版面，讓瀏覽器在沒有動畫的狀態下套用新數值，再拿掉 instant
    void $("day-view").offsetWidth;
    $("day-view").classList.remove("instant");
  }
  lastShown = {
    dayKey: day.dayKey,
    waterTotalMl: day.waterTotalMl,
    waterIds: day.water.map((w) => w.id),
    mealIds: day.meals.map((m) => m.id),
  };
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

// 編輯一餐按「前往設定」時所在的那一天的畫面（回到這一天才重新打開草稿）
let editorLeftFrom = null;
const editor = createMealEditor({
  diary,
  onDone: render,
  onOpenSettings: () => {
    editorLeftFrom = view;
    location.hash = "#settings";
  },
});
// 「吃了什麼」：標題旁的「N 餐・X 大卡」、每一餐的卡片；今天最後一格是「下一餐」。
// 「下一餐」和「拍照記〇〇」的餐別是新的一餐會用的預設餐別（依現在時間，由日記核心決定）。
// 「下一餐」卡片在過去某一天會被移出畫面，所以先留住它
const nextMealCard = $("next-meal");
// 本週：最近七天的小卡（最新的在左邊）；整週都沒有紀錄時不顯示
function renderWeek(week) {
  $("week-section").hidden = !week.some((d) => d.hasRecords);
  const todayKey = diary.todayKey();
  $("week-list").replaceChildren(...week.map((d) => dayTile(d, { isToday: d.dayKey === todayKey, onSelect: showDay })));
}

// isNew(meal)：這一餐是不是剛加入的
function renderMealShelf(day, isToday, isNew) {
  const { meals, nutritionTotals } = day;
  $("meal-hint").textContent = meals.length ? `${meals.length} 餐・${formatWithUnit("kcal", nutritionTotals.kcal)}` : "還沒有紀錄";
  const nextType = diary.newMealDraft({ at: timeForNewRecord() }).mealType;
  nextMealCard.querySelector(".t").textContent = nextType;
  nextMealCard.querySelector(".ghost span").textContent = nextType.charAt(0);
  nextMealCard.setAttribute("aria-label", `記下一餐：${nextType}，拍照`);
  $("meal-list").replaceChildren(...meals.map((m) => mealCard(m, isNew(m))), ...(isToday ? [nextMealCard] : []));
  $("snap-meal-label").textContent = isToday ? `📷 拍照記${nextType}` : "📷 拍照補記一餐";
}

// 「最近吃過」：每一張卡片點一下就把那一餐再記一次（日記核心決定時間、餐別和要複製什麼）。
function recentCard(recent) {
  const card = document.createElement("button");
  card.type = "button";
  card.className = "rc";
  const cover = mealCover(recent.photo, recent.title);
  const row = document.createElement("span");
  row.className = "row";
  const text = document.createElement("span");
  const title = document.createElement("b");
  title.textContent = recent.title;
  const kcal = document.createElement("small");
  kcal.className = "n";
  kcal.textContent = formatWithUnit("kcal", recent.kcal);
  text.append(title, kcal);
  const plus = document.createElement("span");
  plus.className = "add";
  plus.setAttribute("aria-hidden", "true");
  plus.textContent = "+";
  row.append(text, plus);
  card.append(cover, row);
  card.setAttribute("aria-label", `再記一次：${recent.title}，${kcal.textContent}`);
  card.addEventListener("click", async () => {
    card.disabled = true; // 連按兩下不會記兩次
    try {
      await diary.logAgain(recent.mealId);
      await render();
    } catch (err) {
      card.disabled = false;
      alert(`再記一次失敗：${err.message}`);
    }
  });
  return card;
}

function renderRecent(recent) {
  $("recent-section").hidden = recent.length === 0;
  $("recent-list").replaceChildren(...recent.map(recentCard));
}

$("add-meal").addEventListener("click", () => editor.openNew(timeForNewRecord()));

// 拍照記一餐（底部按鍵和「下一餐」卡片）：縮圖 → 建立帶照片的草稿 → 打開編輯視窗並開始 AI 分析。
for (const input of document.querySelectorAll("[data-meal-photos]")) {
  input.addEventListener("change", async (event) => {
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
}

// 修改喝水時間的面板（從下方滑出）：改時間或刪除這一筆
let movingWater = null;
function openWaterTime(w) {
  movingWater = w;
  $("water-time-ml").textContent = `${w.ml} ml`;
  $("water-time-was").textContent = `原本 ${formatTime(w.at)}`;
  $("water-time-form").elements.at.value = toLocalInputValue(w.at);
  showMessage("water-time-error", "");
  askDeleteWater(false);
  $("water-time").showModal();
}
// 刪除要按兩下：第一下把按鍵換成確認文字，第二下才刪除（畫面內確認，不用瀏覽器的確認視窗）
function askDeleteWater(asking) {
  $("delete-water").dataset.asking = String(asking);
  $("delete-water").textContent = asking ? "再按一次確定刪除" : "刪除這一筆";
}
$("delete-water").addEventListener("click", async () => {
  if ($("delete-water").dataset.asking !== "true") return askDeleteWater(true);
  try {
    await diary.deleteWater(movingWater.id);
    $("water-time").close();
    await render();
  } catch (err) {
    showMessage("water-time-error", `刪除失敗：${err.message}`);
  }
});
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

// 「自訂」展開或收起輸入欄
function showCustomWater(open) {
  $("custom-water").hidden = !open;
  $("toggle-custom").setAttribute("aria-expanded", String(open));
}
$("toggle-custom").addEventListener("click", () => {
  const open = $("custom-water").hidden;
  showCustomWater(open);
  if (open) $("custom-ml").focus();
});

$("custom-water").addEventListener("submit", async (event) => {
  event.preventDefault();
  const input = $("custom-ml");
  const raw = input.value.trim();
  if (await addWater(raw === "" ? NaN : Number(raw))) {
    input.value = "";
    showCustomWater(false);
  }
});

// 從背景回到前景時重新整理，跨過午夜也會換成新的一天。
// 設定分頁不重新整理，避免正在輸入的目標被換掉。
// 回到前景就是又打開一次 App：夜空從遠處飛進來。
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState !== "visible") return;
  sky?.open();
  if (view.name !== "settings") render();
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
