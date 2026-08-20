/* Open Note — core/save.js
   saving — debounced writes back to the store */

/* ================= saving ================= */
let saveTimer = null, dirtyPages = new Set(), dirtyIndex = false, dirtyLib = false;
/* Every change in the app comes through one of these two — that is what the
   undo stack listens to, so no feature has to tell it anything (core/history.js) */
function queueSave(pageId){
  const id = pageId || index.pages[cur].id;
  if(typeof histTouch === 'function') histTouch(id);
  dirtyPages.add(id);
  clearTimeout(saveTimer); saveTimer = setTimeout(flush, 600);
}
function queueIndex(){
  if(typeof histTouchIndex === 'function') histTouchIndex();
  dirtyIndex = true; clearTimeout(saveTimer); saveTimer = setTimeout(flush, 600);
}
function queueLib(){ dirtyLib = true; clearTimeout(saveTimer); saveTimer = setTimeout(flush, 600); }
async function flush(){
  const ids = [...dirtyPages]; dirtyPages.clear();
  let wasIndex = dirtyIndex; dirtyIndex = false;
  const wasLib = dirtyLib; dirtyLib = false;
  if(!ids.length && !wasIndex && !wasLib) return;
  for(const id of ids){
    const p = pages.get(id);
    if(!p) continue;
    /* a feature may keep a digest of the page on the book's index — the atlas
       does, so print and exports can read headings before pages are loaded */
    if(typeof syncPageMeta === 'function' && syncPageMeta(p)) wasIndex = true;
    await kvSet(kPage(id), p);
  }
  if(wasIndex && curBookId){ index.cur = cur; await kvSet(kBook(curBookId), index); }
  if((ids.length || wasIndex) && curBookId){
    const b = lib.books.find(x => x.id === curBookId);
    if(b) b.updated = Date.now();
  }
  await kvSet(K_LIB, lib);
  const d = await db();
  const t = $('#saveTag');
  t.textContent = d ? 'saved' : 'this session only — back up!';
  t.classList.add('show'); setTimeout(() => t.classList.remove('show'), 1400);
}
window.addEventListener('beforeunload', flush);
