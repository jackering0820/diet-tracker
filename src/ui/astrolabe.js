// 今天畫面的星盤卡、頂端的星座、喝水面板的八顆小星星（畫面層）。
// 數值、目標、達標狀態、星座點亮數都來自日記核心；這裡只負責畫出來。
// 圖形只建立一次，之後只改屬性和 class：資料有變化時才會播放 CSS 的過場動畫。
import { GOAL_MEASURES, formatMeasure } from "../core/measures.js";
import { GOAL_STATUSES } from "../core/goals.js";

const SVG_NS = "http://www.w3.org/2000/svg";
const STAR_PATH = "M12 2.8l2.75 5.6 6.15.9-4.45 4.35 1.05 6.1L12 16.9l-5.5 2.85 1.05-6.1L3.1 9.3l6.15-.9z";
const STARS = 8;

// 星盤：每圈畫四分之三圈（270 度），終點就是目標的刻度；熱量超過上限的紅色段最長 70 度。
const CENTER = 66;
const RADII = [60, 50, 40, 30]; // 由外到內，依 GOAL_MEASURES 的順序：熱量、蛋白質、蔬菜、喝水
const RING_WIDTH = 7;
const ARC = 270;
const MAX_OVER = 70;

// 頂端星座八顆星的位置（畫布 K 列的座標，viewBox 390×150）；WebGL 夜空（sky.js）也用同一組
export const CONSTELLATION = [[196, 92], [222, 78], [250, 98], [278, 84], [304, 104], [330, 86], [356, 110], [330, 132]];

function svg(tag, attrs = {}) {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [name, value] of Object.entries(attrs)) el.setAttribute(name, value);
  return el;
}

function star(attrs) {
  return svg("path", { d: STAR_PATH, ...attrs });
}

// 數值占目標的比例。目標是 0 時無法算比例：有判斷結果就畫滿，未設定或無紀錄就留空。
function ratio({ value, goal, status }) {
  if (goal > 0) return value / goal;
  return status === "unset" || status === "noRecords" ? 0 : 1;
}

// 星盤卡：chart 是星盤的 <svg>，centerBig、centerSmall 是中間的「N/4」和「項達標」，list 是旁邊四項指標的 <ul>。
export function createAstrolabe({ chart, centerBig, centerSmall, list }) {
  const rings = svg("g", { transform: `rotate(135 ${CENTER} ${CENTER})` });
  const parts = GOAL_MEASURES.map((measure, i) => {
    const r = RADII[i];
    const circle = (cls) => svg("circle", { class: cls, cx: CENTER, cy: CENTER, r, "stroke-width": RING_WIDTH, pathLength: 360 });
    const track = circle("ring-track");
    const arc = circle(`ring-arc ring-${measure.key}`);
    rings.append(track, arc);
    let over = null;
    if (measure.goal.limit === "ceiling") {
      over = circle("ring-over");
      rings.append(over);
    }
    rings.append(svg("line", { class: "ring-tick", x1: CENTER, y1: CENTER - r - 5, x2: CENTER, y2: CENTER - r + 5 }));
    const q = (CENTER + r * Math.SQRT1_2).toFixed(1);
    const goalStar = star({ class: "ring-star", transform: `translate(${q} ${q}) scale(.45) translate(-12 -12)` });

    const row = document.createElement("li");
    row.className = "mrow";
    const head = document.createElement("span");
    head.className = "l1";
    const dot = document.createElement("span");
    dot.className = `dot ring-${measure.key}`;
    dot.setAttribute("aria-hidden", "true");
    const status = document.createElement("span");
    status.className = "s";
    head.append(dot, measure.name, status);
    const numbers = document.createElement("span");
    numbers.className = "l2 n";
    row.append(head, numbers);

    return { measure, arc, over, goalStar, row, status, numbers };
  });
  chart.append(rings, ...parts.map((p) => p.goalStar));
  list.replaceChildren(...parts.map((p) => p.row));

  return {
    update(progress, hasRecords) {
      let met = 0;
      const labels = [];
      for (const { measure, arc, over, goalStar, status, numbers } of parts) {
        const p = progress[measure.key];
        const f = ratio(p);
        const deg = Math.min(1, f) * ARC;
        arc.style.strokeDasharray = `${deg.toFixed(1)} 360`;
        arc.style.strokeLinecap = deg > 0 ? "round" : "butt"; // 長度 0 時圓頭會留下一個點
        // 超過上限的紅色段；目標是 0 時算不出比例，超過就畫滿
        const overDeg = p.status !== "over" ? 0 : p.goal > 0 ? Math.min(MAX_OVER, (f - 1) * ARC) : MAX_OVER;
        if (over) over.style.strokeDasharray = `${overDeg.toFixed(1)} 360`;
        goalStar.classList.toggle("lit", p.status === "achieved");
        if (p.status === "achieved") met += 1;

        const word = GOAL_STATUSES[p.status].text;
        status.className = `s ${p.status}`;
        status.textContent = word;
        const value = document.createElement("b");
        value.textContent = formatMeasure(measure.key, p.value);
        const goal = p.goal === null ? ` ${measure.unit}` : ` / ${formatMeasure(measure.key, p.goal)} ${measure.unit}`;
        numbers.replaceChildren(value, goal);
        labels.push(`${measure.name} ${value.textContent}${goal} ${word}`);
      }
      centerBig.textContent = hasRecords ? `${met}/${GOAL_MEASURES.length}` : "—";
      centerSmall.textContent = hasRecords ? "項達標" : "無紀錄";
      chart.setAttribute("aria-label", hasRecords
        ? `今日星盤：${GOAL_MEASURES.length} 項目標達標 ${met} 項。${labels.join("；")}`
        : "今日星盤：還沒有任何紀錄");
    },
  };
}

// 頂端星座：點亮的星星之間連線。
export function createConstellation(chart) {
  const lines = CONSTELLATION.slice(1).map(([x2, y2], i) => {
    const [x1, y1] = CONSTELLATION[i];
    return svg("line", { class: "c-line", x1, y1, x2, y2 });
  });
  const stars = CONSTELLATION.map(([cx, cy]) => {
    const g = svg("g", { class: "c-star" });
    g.append(svg("circle", { class: "c-glow", cx, cy, r: 5 }), svg("circle", { class: "c-dot", cx, cy, r: 1.9 }));
    return g;
  });
  chart.append(...lines, ...stars);
  return {
    update(lit) {
      stars.forEach((s, i) => s.classList.toggle("lit", i < lit));
      lines.forEach((l, i) => l.classList.toggle("lit", i + 1 < lit));
    },
  };
}

// 喝水面板旁的小星座：和頂端星座一樣依星座點亮數點亮的八顆小星星
export function createMiniConstellation(container) {
  const stars = Array.from({ length: STARS }, () => {
    const icon = svg("svg", { width: 14, height: 14, viewBox: "0 0 24 24" });
    icon.append(star({ class: "mini-star" }));
    return icon;
  });
  container.replaceChildren(...stars);
  return {
    update(lit) {
      stars.forEach((s, i) => s.classList.toggle("lit", i < lit));
    },
  };
}
