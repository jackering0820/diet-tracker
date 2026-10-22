// 按鍵的漣漪（畫面層）：從手指實際點到的位置擴散一圈。
// 外觀和動畫都在 styles.css；這裡只把點擊位置交給 CSS 變數，再重新播放一次動畫，不產生任何元素。

const KEYS = "button, .button-like";

export function installKeyRipple() {
  document.addEventListener(
    "pointerdown",
    (event) => {
      const key = event.target.closest?.(KEYS);
      if (!key || key.disabled) return;
      const box = key.getBoundingClientRect();
      // 漣漪從邊框內側開始定位，所以扣掉邊框寬度
      key.style.setProperty("--rx", `${event.clientX - box.left - key.clientLeft}px`);
      key.style.setProperty("--ry", `${event.clientY - box.top - key.clientTop}px`);
      key.classList.remove("rip");
      void key.offsetWidth; // 讓瀏覽器重新開始動畫
      key.classList.add("rip");
    },
    true,
  );
  // iPhone 的 Safari 要有 touchstart 監聽，按鍵的 :active（下沉）才會出現
  document.addEventListener("touchstart", () => {}, { passive: true });
  document.addEventListener("animationend", (event) => {
    if (event.animationName === "key-ripple") event.target.classList.remove("rip");
  });
}
