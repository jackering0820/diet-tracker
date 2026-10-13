// 記憶體版資料儲存：測試使用，介面和 IndexedDB 版相同。
export function createMemoryStorage() {
  const collections = new Map();

  function collection(name) {
    if (!collections.has(name)) collections.set(name, new Map());
    return collections.get(name);
  }

  return {
    async get(name, id) {
      const record = collection(name).get(id);
      return record ? structuredClone(record) : undefined;
    },
    async put(name, record) {
      collection(name).set(record.id, structuredClone(record));
    },
    async delete(name, id) {
      collection(name).delete(id);
    },
    async count(name) {
      return collection(name).size;
    },
    async listAll(name) {
      return [...collection(name).values()].map((r) => structuredClone(r));
    },
    // 一次完成多個寫入：全部成功或全部不生效（先在複本上做，成功才換上）。
    // ops：[{ type: "clear", name }] 或 [{ type: "put", name, record }]
    async batch(ops) {
      const staged = new Map([...collections].map(([name, records]) => [name, new Map(records)]));
      for (const op of ops) {
        if (!staged.has(op.name)) staged.set(op.name, new Map());
        if (op.type === "clear") staged.get(op.name).clear();
        else staged.get(op.name).set(op.record.id, structuredClone(op.record));
      }
      collections.clear();
      for (const [name, records] of staged) collections.set(name, records);
    },
    // 回傳 at 介於 [from, to) 的紀錄（毫秒時間戳），不保證順序。
    async listByTime(name, from, to) {
      return [...collection(name).values()]
        .filter((r) => r.at >= from && r.at < to)
        .map((r) => structuredClone(r));
    },
  };
}
