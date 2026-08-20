/* Open Note — core/store.js
   storage — IndexedDB, with an in-memory fallback */

/* ================= storage (IndexedDB, with in-memory fallback) ================= */
let _db = undefined;
function db(){
  if(_db !== undefined) return _db;
  _db = new Promise(res => {
    if(!window.indexedDB) return res(null);
    let r;
    try{ r = indexedDB.open('devlog-sketchbook', 1); }catch(e){ return res(null); }
    r.onupgradeneeded = () => { const d = r.result;
      if(!d.objectStoreNames.contains('kv')) d.createObjectStore('kv');
      if(!d.objectStoreNames.contains('media')) d.createObjectStore('media'); };
    r.onsuccess = () => res(r.result);
    r.onerror = () => res(null);
    r.onblocked = () => res(null);
  });
  return _db;
}
const MEMKV = new Map(), MEMMEDIA = new Map();
async function kvGet(k){
  const d = await db(); if(!d) return MEMKV.has(k) ? MEMKV.get(k) : null;
  return new Promise(res => { try{
    const t = d.transaction('kv').objectStore('kv').get(k);
    t.onsuccess = () => res(t.result === undefined ? null : t.result);
    t.onerror = () => res(null);
  }catch(e){ res(null); } });
}
async function kvSet(k, v){
  const d = await db(); if(!d){ MEMKV.set(k, v); return true; }
  return new Promise(res => { try{
    const t = d.transaction('kv', 'readwrite');
    t.objectStore('kv').put(v, k);
    t.oncomplete = () => res(true); t.onerror = () => res(false);
  }catch(e){ res(false); } });
}
async function kvDel(k){
  const d = await db(); if(!d){ MEMKV.delete(k); return; }
  return new Promise(res => { try{
    const t = d.transaction('kv', 'readwrite');
    t.objectStore('kv').delete(k);
    t.oncomplete = () => res(); t.onerror = () => res();
  }catch(e){ res(); } });
}
async function mediaSet(id, blob){
  const d = await db(); if(!d){ MEMMEDIA.set(id, blob); return true; }
  return new Promise(res => { try{
    const t = d.transaction('media', 'readwrite');
    t.objectStore('media').put(blob, id);
    t.oncomplete = () => res(true); t.onerror = () => res(false);
  }catch(e){ res(false); } });
}
async function mediaGet(id){
  const d = await db(); if(!d) return MEMMEDIA.get(id) || null;
  return new Promise(res => { try{
    const t = d.transaction('media').objectStore('media').get(id);
    t.onsuccess = () => res(t.result || null); t.onerror = () => res(null);
  }catch(e){ res(null); } });
}
async function mediaDel(id){
  const d = await db(); if(!d){ MEMMEDIA.delete(id); return; }
  return new Promise(res => { try{
    const t = d.transaction('media', 'readwrite');
    t.objectStore('media').delete(id);
    t.oncomplete = () => res(); t.onerror = () => res();
  }catch(e){ res(); } });
}
