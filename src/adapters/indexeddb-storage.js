// IndexedDB 版資料儲存：正式使用，介面和記憶體版相同。
const DB_NAME = "diet-tracker";
const DB_VERSION = 3;
const COLLECTIONS = ["water", "meals", "settings"];

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

function waitForTransaction(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

// onOutdated：別的分頁（或新版 App）要升級資料庫時呼叫。
// 這個連線會先關閉，否則對方的升級會一直卡住。
export async function createIndexedDbStorage({ onOutdated } = {}) {
  const db = await openDb();
  db.onversionchange = () => {
    db.close();
    onOutdated?.();
  };

  return {
    async get(name, id) {
      const tx = db.transaction(name, "readonly");
      const req = tx.objectStore(name).get(id);
      await waitForTransaction(tx);
      return req.result;
    },
    async put(name, record) {
      const tx = db.transaction(name, "readwrite");
      tx.objectStore(name).put(record);
      await waitForTransaction(tx);
    },
    async delete(name, id) {
      const tx = db.transaction(name, "readwrite");
      tx.objectStore(name).delete(id);
      await waitForTransaction(tx);
    },
    // 回傳 at 介於 [from, to) 的紀錄（毫秒時間戳），不保證順序。
    async listByTime(name, from, to) {
      const tx = db.transaction(name, "readonly");
      const req = tx.objectStore(name).index("at").getAll(IDBKeyRange.bound(from, to, false, true));
      await waitForTransaction(tx);
      return req.result;
    },
    async count(name) {
      const tx = db.transaction(name, "readonly");
      const req = tx.objectStore(name).count();
      await waitForTransaction(tx);
      return req.result;
    },
    async listAll(name) {
      const tx = db.transaction(name, "readonly");
      const req = tx.objectStore(name).getAll();
      await waitForTransaction(tx);
      return req.result;
    },
    // 一次完成多個寫入：全部成功或全部不生效（同一個 transaction）。
    // ops：[{ type: "clear", name }] 或 [{ type: "put", name, record }]
    async batch(ops) {
      const names = [...new Set(ops.map((op) => op.name))];
      const tx = db.transaction(names, "readwrite");
      try {
        for (const op of ops) {
          if (op.type === "clear") tx.objectStore(op.name).clear();
          else tx.objectStore(op.name).put(op.record);
        }
      } catch (err) {
        // 排程到一半出錯（例如某筆資料無法儲存）：明確取消，前面排好的「清空」也不會生效。
        tx.abort();
        throw err;
      }
      await waitForTransaction(tx);
    },
  };
}
