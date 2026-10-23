// 匯出備份的結果畫面（全螢幕）：
//   完成：寫在直立卷軸上的收據（匯出時間、備份摘要、檔名、「封存」章），下方「回到今天」「再匯出一次」
//   取消：「已取消」，下方「重新匯出」「回到設定」
// 備份摘要的數字由日記核心從同一份備份檔算出來；這裡只負責顯示。沒有假的進度條。
import { byId as $ } from "./dom.js";
import { formatKilobytes, saveBackup } from "./backup.js";

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
      $("receipt-size").textContent = formatKilobytes(summary.bytes);
      $("receipt-file").textContent = name;
    }
    if (!dialog.open) dialog.showModal();
    dialog.scrollTop = 0;
  }

  // 匯出進行中時，所有匯出按鍵都停用：連按兩下會叫出第二個分享選單而失敗，改用下載，多存一份
  const exportKeys = ["export-backup", "receipt-again", "receipt-retry"];
  let exporting = false;
  function setExporting(on) {
    exporting = on;
    for (const id of exportKeys) $(id).disabled = on;
  }

  function showError(message) {
    $("receipt-error").textContent = message;
    $("receipt-error").hidden = !message;
  }

  // 匯出：交給手機的分享選單儲存，之後顯示收據或取消畫面。
  // 匯出本身失敗時丟出錯誤；存好之後的更新（上次匯出）出問題時，備份已經存在，不算匯出失敗。
  async function exportAndShow() {
    if (exporting) return;
    setExporting(true);
    let result;
    try {
      showError("");
      result = await saveBackup(diary);
      try {
        await onDone(result.saved);
      } catch {
        // 只影響設定頁的「上次匯出」，下次打開設定頁會重新讀
      }
      show(result, await diary.getLastExportAt()); // 存好時日記核心已經記下匯出時間
    } finally {
      setExporting(false);
    }
    $(result.saved ? "receipt-home" : "receipt-retry").focus(); // 按鍵解除停用之後才拿得到焦點
  }

  async function exportAgain() {
    try {
      await exportAndShow();
    } catch (err) {
      showError(`匯出失敗：${err.message}`);
      $("receipt-error").focus();
    }
  }

  $("receipt-again").addEventListener("click", exportAgain);
  $("receipt-retry").addEventListener("click", exportAgain);
  $("receipt-home").addEventListener("click", () => {
    dialog.close();
    location.hash = "#today";
  });
  for (const id of ["receipt-back", "receipt-to-settings"]) $(id).addEventListener("click", () => dialog.close());
  dialog.addEventListener("close", () => showError(""));

  return { exportAndShow };
}
