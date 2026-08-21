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
              name: file.name || 'picture.jpg', cap: '', frame: 'tape' });
      };
      im.src = fr.result;
    };
    fr.readAsDataURL(file);
  });
}
async function fileToImage(file, at){
  const r = await imageRecord(file);
  if(!r) return;
  const page = sheet();
  const pos = at || { x: 18 + Math.random() * 14, y: 18 + Math.random() * 26 };
  page.items.push({ ...r, x: clamp(pos.x, 2, 66), y: clamp(pos.y, 4, 78), w: 42,
    rot: 0, z: maxZ(page) + 1, lay: curLayerId() });
  queueSave(page.id); SND.plop(); render();
}
$('#imgInput').addEventListener('change', e => { const f = e.target.files[0]; if(f) fileToImage(f, takePendingAt()); e.target.value = ''; });
window.addEventListener('paste', e => {
  const items = e.clipboardData && e.clipboardData.items; if(!items) return;
  for(const i of items) if(i.type.startsWith('image/')){ fileToImage(i.getAsFile()); e.preventDefault(); return; }
});

defineItem('image', {
  /* a picture needs one off the disk first, so the menu opens the file dialog
     and fileToImage() puts the item on the page when it comes back */
  add: { image: { pick: at => { pendingAt = at || null; $('#imgInput').click(); } } },
  takes(fs, at){ if(!fs[0] || !fs[0].type.startsWith('image/')) return false; fileToImage(fs[0], at); return true; },
  html: it => '<figure class="body' + (it.frame === 'plain' ? '' : ' tape') +
    '"><img alt=""><figcaption></figcaption></figure>',
  mount(el, it){ el.querySelector('img').src = it.src || ''; },
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
