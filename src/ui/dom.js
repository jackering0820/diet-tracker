// 畫面層共用的小工具。

export const byId = (id) => document.getElementById(id);

// 在指定的元素顯示訊息；訊息是空字串時隱藏。
export function showMessage(id, message) {
  byId(id).textContent = message;
  byId(id).hidden = !message;
}
