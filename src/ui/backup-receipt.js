// 匯出備份的結果畫面（全螢幕）：
//   完成：寫在直立卷軸上的收據（匯出時間、備份摘要、檔名、「封存」章），下方「回到今天」「再匯出一次」
//   取消：「已取消」，下方「重新匯出」「回到設定」
// 備份摘要的數字由日記核心從同一份備份檔算出來；這裡只負責顯示。沒有假的進度條。
import { byId as $ } from "./dom.js";
import { saveBackup } from "./backup.js";

function pad(n) {
  return String(n).padStart(2, "0");
}

// 例如「2026.10.23 09:30」
function formatStamp(ms) {
  const d = new Date(ms);
  return `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// onDone(saved)：每次匯出之後呼叫（讓設定頁更新上次匯出）
export function createBackupReceipt({ diary, onDone }) {
  const dialog = $("backup-receipt");

  function show({ saved, name, text }, exportedAt) {
    $("receipt-done").hidden = !saved;
    $("receipt-cancelled").hidden = saved;
    if (saved) {
      const summary = diary.backupSummary(text);
      const stamp = formatStamp(exportedAt);
      $("receipt-time").textContent = stamp;
      $("receipt-stamp-time").textContent = stamp;
      $("receipt-days").textContent = `${summary.days.toLocaleString("zh-TW")} 天`;
      $("receipt-meals").textContent = `${summary.meals.toLocaleString("zh-TW")} 餐`;
      $("receipt-photos").textContent = `${summary.photos.toLocaleString("zh-TW")} 張`;
      $("receipt-water").textContent = `${summary.water.toLocaleString("zh-TW")} 筆`;
      $("receipt-size").textContent = `${Math.max(1, Math.round(summary.bytes / 1024)).toLocaleString("zh-TW")} KB`;
      $("receipt-file").textContent = name;
    }
    if (!dialog.open) dialog.showModal();
    dialog.scrollTop = 0;
    $(saved ? "receipt-home" : "receipt-retry").focus();
  }

  // 匯出：交給手機的分享選單儲存，之後顯示收據或取消畫面。
  async function exportAndShow() {
    const result = await saveBackup(diary);
    await onDone(result.saved);
    show(result, (await diary.getLastExportAt()) ?? Date.now());
  }

  async function exportAgain() {
    try {
      await exportAndShow();
    } catch (err) {
      $("receipt-error").textContent = `匯出失敗：${err.message}`;
      $("receipt-error").hidden = false;
    }
  }

  $("receipt-again").addEventListener("click", exportAgain);
  $("receipt-retry").addEventListener("click", exportAgain);
  $("receipt-home").addEventListener("click", () => {
    dialog.close();
    location.hash = "#today";
  });
  for (const id of ["receipt-back", "receipt-to-settings"]) $(id).addEventListener("click", () => dialog.close());
  dialog.addEventListener("close", () => { $("receipt-error").hidden = true; });

  return { exportAndShow };
}
