// 星星（畫面層）：星盤、歷史、今天的「本週」、圖例都用同一顆星。
// 達標狀態只有文字（核心的達標狀態目錄）；每一種狀態長什麼樣子由這裡決定：
// 達標是亮的、超過上限是紅的、未達標是空心、未設定是「－」。
const SVG_NS = "http://www.w3.org/2000/svg";
export const STAR_PATH = "M12 2.8l2.75 5.6 6.15.9-4.45 4.35 1.05 6.1L12 16.9l-5.5 2.85 1.05-6.1L3.1 9.3l6.15-.9z";

// 一顆表示達標狀態的星星；未設定是「－」。整天無紀錄不畫星星（由卡片自己顯示）。
export function statusStar(status) {
  if (status === "unset") {
    const dash = document.createElement("span");
    dash.className = "st st-unset";
    dash.setAttribute("aria-hidden", "true");
    dash.textContent = "－";
    return dash;
  }
  const icon = document.createElementNS(SVG_NS, "svg");
  icon.setAttribute("class", `st st-${status}`);
  icon.setAttribute("viewBox", "0 0 24 24");
  icon.setAttribute("aria-hidden", "true");
  const path = document.createElementNS(SVG_NS, "path");
  path.setAttribute("d", STAR_PATH);
  icon.append(path);
  return icon;
}
