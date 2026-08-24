/* Open Note — items/image.js
   pictures — imported, dropped or pasted */

function imageRecord(file){
  return new Promise(res => {
    const fr = new FileReader();
    fr.onerror = () => res(null);
    fr.onload = () => {
      const im = new Image();
      im.onerror = () => res(null);
      im.onload = () => {
        const max = 2000, s = Math.min(1, max / Math.max(im.width, im.height));
        const c = document.createElement('canvas');
        c.width = Math.round(im.width * s); c.height = Math.round(im.height * s);
        c.getContext('2d').drawImage(im, 0, 0, c.width, c.height);
        res({ id: uid(), type:'image', src: c.toDataURL('image/jpeg', 0.86),
              name: file.name || 'picture.jpg', cap: '', frame: 'tape',
              ar: im.width / im.height });
      };
      im.src = fr.result;
    };
    fr.readAsDataURL(file);
  });
}
/* The old 42% default was drawn for one 660-unit page. On an endless sheet it
   must remain that physical size, not grow to 42% of the whole canvas. A tall
   screenshot uses the same budget for its height, so neither orientation can
   arrive as a wall of pixels. */
function imageDefaultW(ar){
  const side = PG_BASE * .42;
  const ratio = Number.isFinite(ar) && ar > 0 ? ar : 1;
  return clamp(pctW(side * Math.min(1, ratio)), pctW(12), 100);
}
async function fileToImage(file, at){
  const r = await imageRecord(file);
  if(!r) return;
  const page = sheet();
  if(!page) return;
  const pos = at || viewCentre(page), w = imageDefaultW(r.ar);
  const h = w * pgW() / pgH() / r.ar;
  page.items.push({ ...r, x: clamp(pos.x, 2, Math.max(2, 100 - w)),
    y: clamp(pos.y, 4, Math.max(4, 100 - h)), w,
    rot: 0, z: maxZ(page) + 1, lay: curLayerId() });
  queueSave(page.id); SND.plop(); render();
}
$('#imgInput').addEventListener('change', e => { const f = e.target.files[0]; if(f) fileToImage(f, takePendingAt()); e.target.value = ''; });
window.addEventListener('paste', e => {
  const items = e.clipboardData && e.clipboardData.items; if(!items) return;
  for(const i of items) if(i.type.startsWith('image/')){
    /* Take the position now: decoding the clipboard image is asynchronous, and
       a pan while it loads must not move the place the paste was aimed at. */
    fileToImage(i.getAsFile(), viewCentre(sheet())); e.preventDefault(); return;
  }
});

defineItem('image', {
  /* a picture needs one off the disk first, so the menu opens the file dialog
     and fileToImage() puts the item on the page when it comes back */
  add: { image: { pick: at => { pendingAt = at || null; $('#imgInput').click(); } } },
  takes(fs, at){ if(!fs[0] || !fs[0].type.startsWith('image/')) return false; fileToImage(fs[0], at); return true; },
  html: it => '<figure class="body' + (it.frame === 'plain' ? '' : ' tape') +
    '"><img draggable="false" alt=""><figcaption></figcaption></figure>',
  mount(el, it){ const img = el.querySelector('img'); img.src = it.src || ''; img.draggable = false; },
  wire(el){
    /* Chromium otherwise starts its translucent native-image drag on the left
       button before the canvas can keep the picture under the pointer. */
    el.querySelector('img').addEventListener('dragstart', e => e.preventDefault());
  },
  tools(mk, it, el, page){
    mk('▣', 'Toggle tape', () => {
      it.frame = it.frame === 'plain' ? 'tape' : 'plain';
      el.querySelector('figure').className = 'body' + (it.frame === 'plain' ? '' : ' tape');
      queueSave(page.id); });
  }
});
/* its tile in the palette */
defineTool({ kind:'image', cat:'media', label:'Picture', icon:'image', order:10,
  hint:'Taped-in photos — or just paste a screenshot (Ctrl+V)' });
