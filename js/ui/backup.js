/* Open Note — ui/backup.js
   back up and restore a book as .json */

/* ================= backup / restore ================= */
const blobToDataURL = blob => new Promise((res, rej) => {
  const fr = new FileReader(); fr.onload = () => res(fr.result); fr.onerror = rej; fr.readAsDataURL(blob);
});
const dataURLToBlob = async u => (await fetch(u)).blob();

$('#exportBtn').addEventListener('click', async () => {
  const out = { format: 'open-note/4', index, pages: [], media: {} };
  for(let i = 0; i < index.pages.length; i++){
    const p = await loadPage(i);
    out.pages.push(p);
    for(const it of p.items) for(const m of mediaIds(it)){
      if(out.media[m]) continue;
      const b = await mediaGet(m);
      if(b) out.media[m] = await blobToDataURL(b);
    }
  }
  const blob = new Blob([JSON.stringify(out)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  const bName = ((lib.books.find(b => b.id === curBookId) || {}).name || 'open-note')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'open-note';
  a.download = bName + '-' + new Date().toISOString().slice(0, 10) + '.json';
  a.click(); URL.revokeObjectURL(a.href);
});
$('#importBtn').addEventListener('click', () => $('#jsonInput').click());
$('#jsonInput').addEventListener('change', e => {
  const f = e.target.files[0]; if(!f) return;
  const fr = new FileReader();
  fr.onload = async () => {
    try{
      const data = JSON.parse(fr.result);
      if(!data.index || !data.pages) throw new Error('bad file');
      if(!confirm('Restore this backup? It replaces the sketchbook you have open.')) return;
      for(const m of index.pages){
        const p = pages.get(m.id) || await kvGet(kPage(m.id));
        if(p) for(const it of p.items) for(const m of mediaIds(it)) await mediaDel(m);
        await kvDel(kPage(m.id));
      }
      /* fresh ids, so the same backup restored into several books never shares pages or media */
      const pageMap = {}, mediaMap = {};
      index = data.index; index.settings = index.settings || {}; pages = new Map();
      for(const p of data.pages){
        p.id = pageMap[p.id] = uid();
        const fresh = m => mediaMap[m] || (mediaMap[m] = uid());
        (p.items || []).forEach(it => remapMedia(it, fresh));
        pages.set(p.id, p); await kvSet(kPage(p.id), p);
      }
      index.pages = (index.pages || []).map(m => ({ ...m, id: pageMap[m.id] || uid() }));
      index.xlinks = (index.xlinks || []).filter(x => pageMap[x.ap] && pageMap[x.bp])
        .map(x => ({ ...x, ap: pageMap[x.ap], bp: pageMap[x.bp] }));
      index.bookmarks = (index.bookmarks || []).filter(b => pageMap[b.pageId])
        .map(b => ({ ...b, pageId: pageMap[b.pageId] }));
      if(data.media) for(const [id, durl] of Object.entries(data.media)){
        if(!mediaMap[id]) continue;
        const b = await dataURLToBlob(durl);
        await mediaSet(mediaMap[id], b); MEDIA_URL[mediaMap[id]] = URL.createObjectURL(b);
      }
      await kvSet(kBook(curBookId), index);
      const be = lib.books.find(b => b.id === curBookId);
      if(be) be.updated = Date.now();
      await kvSet(K_LIB, lib);
      resetForNewBook();                            // a restore is an open: features drop what they held
      applyTheme(); syncSound(); cur = 0; selected = null; activePageId = null;
      layers(index); curLayerId(); focusLayer = null; setDraw(false); renderLayers();
      $('#spreadBtn').textContent = index.spread ? '▢▢ Spread' : '▢ Single';
      render();
    }catch(err){ alert("That file isn't a sketchbook backup."); }
  };
  fr.readAsText(f); e.target.value = '';
});
