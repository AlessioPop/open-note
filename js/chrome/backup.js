/* Open Note — chrome/backup.js
   back up and restore a note as .json */

/* ================= backup / restore ================= */
const blobToDataURL = blob => new Promise((res, rej) => {
  const fr = new FileReader(); fr.onload = () => res(fr.result); fr.onerror = rej; fr.readAsDataURL(blob);
});
const dataURLToBlob = async u => (await fetch(u)).blob();

const noteName = () => ((lib.books.find(b => b.id === curNoteId) || {}).name || 'open-note')
  .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'open-note';

/* Everything a note is, in one file: the index, its sheet, and every blob on it
   as a data URL. Format 5 is the canvas-only shape — one page, no bookmarks, no
   cross-page links. A format-4 file still restores; what a book carried that a
   note has no use for is dropped on the way in. */
async function backupNote(){
  const out = { format: 'open-note/5', index, pages: [], media: {} };
  const p = await loadSheet();
  if(p){
    out.pages.push(p);
    for(const it of p.items) for(const m of mediaIds(it)){
      if(out.media[m]) continue;
      const b = await mediaGet(m);
      if(b) out.media[m] = await blobToDataURL(b);
    }
  }
  return out;
}

$('#exportBtn').addEventListener('click', async () => {
  const out = await backupNote();
  await plSaveFile(noteName() + '-' + new Date().toISOString().slice(0, 10) + '.json',
                   new Blob([JSON.stringify(out)], { type: 'application/json' }));
});

$('#importBtn').addEventListener('click', () => $('#jsonInput').click());
$('#jsonInput').addEventListener('change', e => {
  const f = e.target.files[0]; if(!f) return;
  const fr = new FileReader();
  fr.onload = async () => {
    try{
      const data = JSON.parse(fr.result);
      if(!data.index || !data.pages || !data.pages.length) throw new Error('bad file');
      if(!confirm('Restore this backup? It replaces the note you have open.')) return;
      for(const m of index.pages){
        const p = pages.get(m.id) || await kvGet(kPage(m.id));
        if(p) for(const it of p.items) for(const mid of mediaIds(it)) await mediaDel(mid);
        await kvDel(kPage(m.id));
      }
      /* fresh ids, so the same backup restored into several notes never shares a
         sheet or a blob */
      const mediaMap = {};
      index = data.index; index.settings = index.settings || {}; pages = new Map();
      /* a book backup restores as its first page — the rest has nowhere to go */
      const p = data.pages[0];
      p.id = uid();
      const fresh = m => mediaMap[m] || (mediaMap[m] = uid());
      (p.items || []).forEach(it => remapMedia(it, fresh));
      pages.set(p.id, p); await kvSet(kPage(p.id), p);
      index.kind = 'canvas'; index.pgmax = index.pgmax || SHEET_MAX;
      index.pages = [{ id: p.id, title: p.title, date: p.date }];
      delete index.xlinks; delete index.bookmarks; delete index.spread; delete index.cur;
      if(data.media) for(const [id, durl] of Object.entries(data.media)){
        if(!mediaMap[id]) continue;
        const b = await dataURLToBlob(durl);
        await mediaSet(mediaMap[id], b); MEDIA_URL[mediaMap[id]] = URL.createObjectURL(b);
      }
      await kvSet(kBook(curNoteId), index);
      const be = lib.books.find(b => b.id === curNoteId);
      if(be) be.updated = Date.now();
      await kvSet(K_LIB, lib);
      resetForNewNote();                            // a restore is an open: features drop what they held
      applyTheme(); syncSound(); select(null);
      layers(index); curLayerId(); focusLayer = null; setDraw(false); renderLayers();
      render();
    }catch(err){ alert("That file isn't an Open Note backup."); }
  };
  fr.readAsText(f); e.target.value = '';
});
