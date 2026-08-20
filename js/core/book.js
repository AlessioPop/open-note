/* Open Note — core/book.js
   making, opening and reading a sketchbook */

async function createBook(name){
  const doc = { theme: 'graph', cur: 0, spread: false, settings: {}, pages: [] };
  const cover = blankPage(0, doc); cover.items = coverItems();
  const first = blankPage(1, doc);
  doc.pages = [{id:cover.id,title:cover.title,date:cover.date},{id:first.id,title:first.title,date:first.date}];
  await kvSet(kPage(cover.id), cover);
  await kvSet(kPage(first.id), first);
  const id = uid();
  await kvSet(kBook(id), doc);
  lib.books.push({ id, name: name || 'Sketchbook ' + (lib.books.length + 1), created: Date.now(), updated: Date.now() });
  await kvSet(K_LIB, lib);
  return id;
}

async function openBook(id){
  await flush();                                  // park whatever book was open before
  const doc = await kvGet(kBook(id));
  if(!doc){ alert('This sketchbook could not be loaded.'); return; }
  curBookId = id;
  index = doc; index.settings = index.settings || {};
  pages = new Map();
  cur = clamp(index.cur || 0, 0, index.pages.length - 1);
  selected = null; activePageId = null;
  panX = panY = 0; setZoom(1);
  layers(index); curLayerId(); queueIndex();      // stable layer ids from the first open
  focusLayer = null; setDraw(false); setMath(false); renderLayers();
  resetForNewBook();                              // features drop whatever they were holding
  applyTheme(); syncSound();
  $('#spreadBtn').textContent = index.spread ? '▢▢ Spread' : '▢ Single';
  lib.lastOpen = id; queueLib();
  await render();
  $('#sheet').classList.remove('open');
  $('#shelf').classList.remove('open');
  SND.flip();
}

async function loadPage(i){
  const meta = index.pages[i]; if(!meta) return null;
  if(!pages.has(meta.id)){
    const p = await kvGet(kPage(meta.id));
    pages.set(meta.id, p || { id:meta.id, title:meta.title, date:meta.date, paper:'grid', items:[] });
    /* what it says as it comes in is what an undo puts back */
    if(typeof histSeed === 'function') histSeed(pages.get(meta.id));
  }
  return pages.get(meta.id);
}
function viewIdx(){
  if(!index.spread || cur === 0) return [cur];
  return cur + 1 < index.pages.length ? [cur, cur + 1] : [cur];
}
function activePage(){
  if(activePageId && viewIdx().some(i => index.pages[i].id === activePageId))
    return pages.get(activePageId);
  return pages.get(index.pages[cur].id);
}
