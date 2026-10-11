// 日期工具：一天依手機當地時間，從 0:00 算到隔天 0:00。

function pad(n) {
  return String(n).padStart(2, "0");
}

// Date → "YYYY-MM-DD"（當地時間）
export function dayKeyOf(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

// "YYYY-MM-DD" → 當天 0:00 與隔天 0:00 的毫秒時間戳
export function dayRange(dayKey) {
  const [y, m, d] = dayKey.split("-").map(Number);
  return {
    from: new Date(y, m - 1, d).getTime(),
    to: new Date(y, m - 1, d + 1).getTime(),
  };
}
