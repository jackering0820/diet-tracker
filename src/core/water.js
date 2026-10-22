// 喝水的規則。

// 喝水量必須是大於 0 的數字。
export function validateWaterMl(ml) {
  if (typeof ml !== "number" || !Number.isFinite(ml) || ml <= 0) {
    throw new Error("喝水量必須是大於 0 的數字");
  }
  return ml;
}

const CONSTELLATION_STARS = 8;
const ML_PER_STAR_WITHOUT_GOAL = 250;

// 星座點亮數：有喝水目標時依目標的比例點亮 8 顆星；沒有目標（null）時每 250 ml 一顆。最多 8 顆。
// 目標是 0 時任何喝水量都已達標，全亮。
export function constellationLit(waterMl, goalMl) {
  if (goalMl === 0) return CONSTELLATION_STARS;
  const lit = goalMl === null ? waterMl / ML_PER_STAR_WITHOUT_GOAL : (waterMl / goalMl) * CONSTELLATION_STARS;
  return Math.min(CONSTELLATION_STARS, Math.floor(lit));
}
