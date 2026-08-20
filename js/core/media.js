/* Open Note — core/media.js
   handing stored blobs to the page as object URLs */

/* Anything on the page may own stored blobs, and some of them are nested — a
   folder's contents, the picture on a flip card. mediaRecords() walks that for
   us (see core/item.js), so this never has to know what a deck is. A feature
   that reads its file some other way says so with `stream: false`. */
async function ensureMedia(page){
  for(const it of page.items){
    for(const rec of mediaRecords(it)){
      if(specOf(rec).stream === false) continue;    // e.g. an .obj, which is read as text
      if(rec.media && !MEDIA_URL[rec.media]){
        const b = await mediaGet(rec.media);
        if(b){
          MEDIA_URL[rec.media] = URL.createObjectURL(b);
          document.querySelectorAll('video[data-media="' + rec.media + '"]').forEach(v => { v.src = MEDIA_URL[rec.media]; });
        }
      }
    }
  }
}
