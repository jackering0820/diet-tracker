// 備份檔的下載和讀取（畫面層）。備份的內容和檢查都由日記核心負責。

function pad(n) {
  return String(n).padStart(2, "0");
}

// 匯出備份並下載成 JSON 檔（iPhone 會讓使用者選擇存到「檔案」）。
export async function downloadBackup(diary) {
  const text = await diary.exportBackup();
  const now = new Date();
  const name = `飲食紀錄備份-${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}.json`;
  const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  // 等瀏覽器開始下載後再釋放
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return name;
}

export function formatLastExport(ms) {
  if (ms === null) return "還沒匯出過";
  return new Date(ms).toLocaleString("zh-TW", { month: "long", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });
}
