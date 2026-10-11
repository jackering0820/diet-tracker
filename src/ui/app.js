// 畫面層（UI Shell）：只處理畫面，所有規則交給日記核心。
import { createDiary } from "../core/diary.js";
import { createIndexedDbStorage } from "../adapters/indexeddb-storage.js";

const $ = (id) => document.getElementById(id);

const storage = await createIndexedDbStorage();
const diary = createDiary({ storage, clock: { now: () => new Date() } });

function formatTime(ms) {
  return new Date(ms).toLocaleTimeString("zh-TW", { hour: "2-digit", minute: "2-digit", hour12: false });
}

function showError(message) {
  $("error").textContent = message;
  $("error").hidden = !message;
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

async function render() {
  const day = await diary.getDaySummary(diary.todayKey());
  $("today-date").textContent = new Date().toLocaleDateString("zh-TW", {
    year: "numeric", month: "long", day: "numeric", weekday: "long",
  });
  $("water-total").textContent = day.waterTotalMl.toLocaleString("zh-TW");
  $("water-empty").hidden = day.water.length > 0;
  $("water-list").replaceChildren(...day.water.map(waterItem));
}

async function addWater(ml) {
  try {
    await diary.addWater(ml);
    showError("");
    await render();
    return true;
  } catch (err) {
    showError(err.message);
    return false;
  }
}

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
