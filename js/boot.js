/* Open Note — boot.js
   start here: open the last book, or the shelf */

/* ================= boot =================
   Every module has loaded and every feature has registered itself by the time
   this runs — which is why it is the last <script> in index.html. */
(async function init(){
  installItemCSS();                               // the features' own styles join the stylesheet
  lib = await kvGet(K_LIB);
  if(!lib){
    lib = { lastOpen: null, books: [] };
    const legacy = await kvGet(K_INDEX);          // migrate a pre-library sketchbook
    if(legacy){
      const id = uid();
      await kvSet(kBook(id), legacy);
      lib.books.push({ id, name: 'My sketchbook', created: Date.now(), updated: Date.now() });
      lib.lastOpen = id;
      await kvDel(K_INDEX);
    }
    await kvSet(K_LIB, lib);
  }
  const d = await db();
  if(!d){ const t = $('#saveTag'); t.textContent = 'no browser storage — use Back up!'; t.classList.add('show'); }
  if(!lib.books.length) await openBook(await createBook('My sketchbook'));
  else await openShelf();
})();
