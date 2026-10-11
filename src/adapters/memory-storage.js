// 記憶體版資料儲存：測試使用，介面和 IndexedDB 版相同。
export function createMemoryStorage() {
  const collections = new Map();

  function collection(name) {
    if (!collections.has(name)) collections.set(name, new Map());
    return collections.get(name);
  }

  return {
    async put(name, record) {
      collection(name).set(record.id, structuredClone(record));
    },
    async delete(name, id) {
      collection(name).delete(id);
    },
    // 回傳 at 介於 [from, to) 的紀錄（毫秒時間戳），不保證順序。
    async listByTime(name, from, to) {
      return [...collection(name).values()]
        .filter((r) => r.at >= from && r.at < to)
        .map((r) => structuredClone(r));
    },
  };
}
