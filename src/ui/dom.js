// 畫面層共用的小工具。

export const byId = (id) => document.getElementById(id);

// 在指定的元素顯示訊息；訊息是空字串時隱藏。
export function showMessage(id, message) {
  byId(id).textContent = message;
  byId(id).hidden = !message;
}

// 毫秒時間戳 ↔ <input type="datetime-local"> 的值（當地時間，格式 YYYY-MM-DDTHH:MM）。
export function toLocalInputValue(ms) {
  const d = new Date(ms);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// 空白或無法解讀時回傳 NaN，交給日記核心回報錯誤。
export function fromLocalInputValue(value) {
  return value ? new Date(value).getTime() : NaN;
}
