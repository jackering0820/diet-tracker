// 數字的顯示規則：熱量和喝水量取整數，其他取到小數點後一位。

function displayDecimals(key) {
  return key === "kcal" || key === "waterMl" ? 0 : 1;
}

export function formatNutrient(key, value) {
  return value.toFixed(displayDecimals(key));
}

// 依顯示規則四捨五入後的數值，讓判斷結果和畫面上看到的一致。
export function roundForDisplay(key, value) {
  return Number(formatNutrient(key, value));
}
