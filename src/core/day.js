// 日期工具：一天依手機當地時間，從 0:00 算到隔天 0:00。

function pad(n) {
  return String(n).padStart(2, "0");
}

// Date → "YYYY-MM-DD"（當地時間）
export function dayKeyOf(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

// 是不是日曆上真的存在的 "YYYY-MM-DD"（2026-02-30 這種換算後會變成別天的不算）
export function isDayKey(text) {
  if (typeof text !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(text)) return false;
  const [y, m, d] = text.split("-").map(Number);
  return dayKeyOf(new Date(y, m - 1, d)) === text;
}

// 紀錄的時間（毫秒時間戳）必須是有效的數字。
export function validateAt(at) {
  if (typeof at !== "number" || !Number.isFinite(at)) throw new Error("請選擇有效的日期時間");
  return at;
}

// 某一天的指定時刻（取 time 的時和分），回傳毫秒時間戳。
export function atTimeOnDay(dayKey, time) {
  const [y, m, d] = dayKey.split("-").map(Number);
  return new Date(y, m - 1, d, time.getHours(), time.getMinutes()).getTime();
}

// 兩個 "YYYY-MM-DD" 相差幾天（照日曆，不受日光節約時間影響）
export function daysBetween(fromKey, toKey) {
  const utc = (key) => { const [y, m, d] = key.split("-").map(Number); return Date.UTC(y, m - 1, d); };
  return Math.round((utc(toKey) - utc(fromKey)) / 86_400_000);
}

// "YYYY-MM-DD" 加減天數（n 可以是負數），依當地日曆計算。
export function addDays(dayKey, n) {
  const [y, m, d] = dayKey.split("-").map(Number);
  return dayKeyOf(new Date(y, m - 1, d + n));
}

// "YYYY-MM-DD" → 當天 0:00 與隔天 0:00 的毫秒時間戳
export function dayRange(dayKey) {
  const [y, m, d] = dayKey.split("-").map(Number);
  return {
    from: new Date(y, m - 1, d).getTime(),
    to: new Date(y, m - 1, d + 1).getTime(),
  };
}
