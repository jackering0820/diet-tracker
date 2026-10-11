// IndexedDB 版資料儲存：正式使用，介面和記憶體版相同。
const DB_NAME = "diet-tracker";
const DB_VERSION = 1;
const COLLECTIONS = ["water"];

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const name of COLLECTIONS) {
        if (!db.objectStoreNames.contains(name)) {
          db.createObjectStore(name, { keyPath: "id" }).createIndex("at", "at");
        }
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function done(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export async function createIndexedDbStorage() {
  const db = await openDb();

  return {
    async put(name, record) {
      const tx = db.transaction(name, "readwrite");
      tx.objectStore(name).put(record);
      await done(tx);
    },
    async delete(name, id) {
      const tx = db.transaction(name, "readwrite");
      tx.objectStore(name).delete(id);
      await done(tx);
    },
    // 回傳 at 介於 [from, to) 的紀錄（毫秒時間戳），不保證順序。
    async listByTime(name, from, to) {
      const tx = db.transaction(name, "readonly");
      const req = tx.objectStore(name).index("at").getAll(IDBKeyRange.bound(from, to, false, true));
      await done(tx);
      return req.result;
    },
  };
}
