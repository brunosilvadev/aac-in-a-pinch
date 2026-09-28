const DB_NAME = 'aac-on-a-pinch';
const STORE = 'boards';

let dbPromise = null;

function openDb() {
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id' });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

async function run(mode, action) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const req = action(tx.objectStore(STORE));
    tx.oncomplete = () => resolve(req.result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export async function listBoards() {
  const boards = await run('readonly', store => store.getAll());
  return boards.sort((a, b) => b.updatedAt - a.updatedAt);
}

export const getBoard = id => run('readonly', store => store.get(id));

export const saveBoard = board => {
  board.updatedAt = Date.now();
  return run('readwrite', store => store.put(board));
};

export const deleteBoard = id => run('readwrite', store => store.delete(id));
