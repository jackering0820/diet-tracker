// 喝水的規則。

// 喝水量必須是大於 0 的數字。
export function validateWaterMl(ml) {
  if (typeof ml !== "number" || !Number.isFinite(ml) || ml <= 0) {
    throw new Error("喝水量必須是大於 0 的數字");
  }
  return ml;
}
