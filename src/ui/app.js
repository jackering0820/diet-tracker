// 畫面層（UI Shell）：只處理畫面，所有規則交給日記核心。
import { createDiary } from "../core/diary.js";
import { dayRange } from "../core/day.js";
import { formatNutrient } from "../core/meal.js";
import { createIndexedDbStorage } from "../adapters/indexeddb-storage.js";
import { createMealEditor, renderNutrition } from "./meal-editor.js";

const $ = (id) => document.getElementById(id);

const storage = await createIndexedDbStorage();
const diary = createDiary({ storage, clock: { now: () => new Date() } });

function formatTime(ms) {
  return new Date(ms).toLocaleTimeString("zh-TW", { hour: "2-digit", minute: "2-digit", hour12: false });
}

function showWaterError(message) {
  $("water-error").textContent = message;
  $("water-error").hidden = !message;
}

function waterItem(w) {
  const li = document.createElement("li");
  const time = document.createElement("span");
  time.className = "time";
  time.textContent = formatTime(w.at);
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
  const day = await diary.getDaySummary(diary.todayKey());
  // 標題日期由日記核心的 dayKey 推算，和資料用的是同一個時間來源。
  $("today-date").textContent = new Date(dayRange(day.dayKey).from).toLocaleDateString("zh-TW", {
    year: "numeric", month: "long", day: "numeric", weekday: "long",
  });
  renderNutrition($("nutrition-totals"), day.nutritionTotals);
  $("meals-empty").hidden = day.meals.length > 0;
  $("meal-list").replaceChildren(...day.meals.map(mealRow));
  $("water-total").textContent = day.waterTotalMl.toLocaleString("zh-TW");
  $("water-empty").hidden = day.water.length > 0;
  $("water-list").replaceChildren(...day.water.map(waterItem));
}

async function addWater(ml) {
  try {
    await diary.addWater(ml);
    showWaterError("");
    await render();
    return true;
  } catch (err) {
    showWaterError(err.message);
    return false;
  }
}

const editor = createMealEditor({ diary, onDone: render });
$("add-meal").addEventListener("click", () => editor.openNew());

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

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("sw.js");
}
