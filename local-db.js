/* Gestión del Dinero · base de datos local
   Sustituye a la base de datos de claude.ai: guarda todo en el propio
   dispositivo (IndexedDB) con la misma forma de uso que tenía la app:
   db.doc('fin/config').set / onSnapshot, db.collection('meses').onSnapshot. */
(function () {
  'use strict';
  const DB_NAME = 'gestion-dinero', STORE = 'docs';
  const clone = (o) => (o === undefined ? undefined : JSON.parse(JSON.stringify(o)));
  let dbp = null;
  function open() {
    if (dbp) return dbp;
    dbp = new Promise((res, rej) => {
      const r = indexedDB.open(DB_NAME, 1);
      r.onupgradeneeded = () => r.result.createObjectStore(STORE);
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
    return dbp;
  }
  function tx(mode, fn) {
    return open().then((db) => new Promise((res, rej) => {
      const t = db.transaction(STORE, mode); const st = t.objectStore(STORE);
      const out = fn(st);
      t.oncomplete = () => res(out && 'result' in out ? out.result : undefined);
      t.onerror = () => rej(t.error); t.onabort = () => rej(t.error);
    }));
  }
  const cache = new Map(); let loaded = null;
  function loadAll() {
    if (loaded) return loaded;
    loaded = open().then((db) => new Promise((res, rej) => {
      const st = db.transaction(STORE, 'readonly').objectStore(STORE);
      const req = st.openCursor();
      req.onsuccess = () => { const c = req.result; if (c) { cache.set(c.key, c.value); c.continue(); } else res(); };
      req.onerror = () => rej(req.error);
    }));
    return loaded;
  }
  const docSubs = new Map(), colSubs = new Map();
  const colOf = (path) => path.split('/').slice(0, -1).join('/');
  function docSnap(path) {
    const v = cache.get(path);
    return { id: path.split('/').pop(), exists: v !== undefined, data: () => clone(v) };
  }
  function colSnap(col, limit) {
    const docs = [];
    for (const [k, v] of cache) if (colOf(k) === col) docs.push({ id: k.split('/').pop(), exists: true, data: () => clone(v) });
    docs.sort((a, b) => (a.id < b.id ? -1 : 1));
    return { docs: limit ? docs.slice(0, limit) : docs, size: docs.length };
  }
  function notify(path) {
    (docSubs.get(path) || []).forEach((f) => { try { f(docSnap(path)); } catch (e) { console.error(e); } });
    const col = colOf(path);
    (colSubs.get(col) || []).forEach((s) => { try { s.fn(colSnap(col, s.limit)); } catch (e) { console.error(e); } });
  }
  async function setDoc(path, data) {
    await loadAll();
    const v = clone(data);
    await tx('readwrite', (st) => st.put(v, path));
    cache.set(path, v);
    setTimeout(() => notify(path), 0);
  }
  async function delDoc(path) {
    await loadAll();
    await tx('readwrite', (st) => st.delete(path));
    cache.delete(path);
    setTimeout(() => notify(path), 0);
  }
  const db = {
    doc(path) {
      return {
        set: (d) => setDoc(path, d),
        update: async (d) => setDoc(path, Object.assign({}, cache.get(path) || {}, d)),
        delete: () => delDoc(path),
        onSnapshot(fn, err) {
          if (!docSubs.has(path)) docSubs.set(path, []);
          docSubs.get(path).push(fn);
          loadAll().then(() => fn(docSnap(path))).catch((e) => err && err(e));
          return () => docSubs.set(path, docSubs.get(path).filter((x) => x !== fn));
        },
      };
    },
    collection(col) {
      const q = (limit) => ({
        limit: (n) => q(n),
        onSnapshot(fn, err) {
          const s = { fn, limit };
          if (!colSubs.has(col)) colSubs.set(col, []);
          colSubs.get(col).push(s);
          loadAll().then(() => fn(colSnap(col, limit))).catch((e) => err && err(e));
          return () => colSubs.set(col, colSubs.get(col).filter((x) => x !== s));
        },
        doc: (id) => db.doc(col + '/' + id),
      });
      return q(0);
    },
  };

  /* Copia de seguridad: todo en un único JSON */
  window.LOCAL_DB = {
    async dump() {
      await loadAll();
      const docs = {}; for (const [k, v] of cache) docs[k] = clone(v);
      return { app: 'gestion-del-dinero', version: 1, creado: new Date().toISOString(), docs };
    },
    async restore(backup, { replace = true } = {}) {
      const docs = backup && backup.docs;
      if (!docs || typeof docs !== 'object') throw new Error('formato');
      await loadAll();
      await tx('readwrite', (st) => {
        if (replace) st.clear();
        for (const [k, v] of Object.entries(docs)) st.put(clone(v), k);
      });
      if (replace) cache.clear();
      for (const [k, v] of Object.entries(docs)) cache.set(k, clone(v));
    },
    async count() { await loadAll(); return cache.size; },
  };

  // Pide al sistema que no borre estos datos por falta de espacio
  try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (e) {}

  // Misma puerta de entrada que en claude.ai
  window.claude = { use: async (name) => { if (name !== 'db') return null; try { await open(); return db; } catch (e) { return null; } } };
})();
