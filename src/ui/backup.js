// 備份檔的儲存和讀取（畫面層）。備份的內容和檢查都由日記核心負責。

function pad(n) {
  return String(n).padStart(2, "0");
}

function backupFileName() {
  const now = new Date();
  return `飲食紀錄備份-${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}.json`;
}

// 手機上用「分享」選單儲存（iPhone 可以選「儲存到檔案」），在主畫面 App 裡也可靠；
// 電腦上沒有觸控螢幕，用一般的下載。
function canShareFile(file) {
  return matchMedia("(pointer: coarse)").matches && navigator.canShare?.({ files: [file] });
}

function download(file) {
  const url = URL.createObjectURL(file);
  const link = document.createElement("a");
  link.href = url;
  link.download = file.name;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000); // 等瀏覽器開始下載後再釋放
}

// 匯出並交給手機儲存。回傳 { saved, name }；使用者在分享選單按取消時 saved 是 false，
// 這時不標記為已備份，提醒會繼續出現。
export async function saveBackup(diary) {
  const file = new File([await diary.exportBackup()], backupFileName(), { type: "application/json" });
  if (canShareFile(file)) {
    try {
      await navigator.share({ files: [file], title: file.name });
    } catch (err) {
      if (err.name === "AbortError") return { saved: false, name: file.name };
      download(file); // 分享失敗（不是使用者取消）時改用下載
    }
  } else {
    download(file);
  }
  // 一般下載無法知道使用者有沒有真的存好，只能當作已儲存。
  await diary.markExported();
  return { saved: true, name: file.name };
}

export function formatLastExport(ms) {
  if (ms === null) return "還沒匯出過";
  return new Date(ms).toLocaleString("zh-TW", { month: "long", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });
}
