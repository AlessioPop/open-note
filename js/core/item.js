/* Open Note — core/item.js
   building one item on the page */

/* ================= item rendering =================
   Generic from top to bottom. What an item looks like, what its toolbar holds,
   what it owns and how it behaves all come from the registry, so nothing in
   here mentions a note, a plot or a deck of cards by name. See
   core/registry.js for the contract, and js/items/* for the features. */
function buildItem(it, page, live, urls, bIdx){
  const idx = bIdx || index;
  const spec = specOf(it);
  const ctx = { live: !!live, urls: urls || MEDIA_URL, page, idx };

  const el = document.createElement('div');
  el.className = 'item'; el.dataset.id = it.id; el.dataset.type = it.type;
  el.dataset.lay = layers(idx)[layIdx(idx, it.lay)].id;
  el.style.left = it.x + '%'; el.style.top = it.y + '%';
  if(!autoWidth(it)) el.style.width = it.w + '%';   // a card is as wide as its numbers
  el.style.transform = 'rotate(' + (it.rot || 0) + 'deg)';
  el.style.zIndex = zOf(idx, it);
  if(it.fs) el.style.setProperty('--fs', it.fs);
  if(it.mk) el.style.setProperty('--mk', it.mk);

  el.innerHTML = '<div class="tools"></div>' + (spec.html ? spec.html(it, ctx) : '') +
                 '<div class="rot"></div><div class="rs"></div>';

  /* Anything may carry writing and a caption, and both are stored as LaTeX and
     shown as typeset maths. A feature gets them simply by putting a .txt or a
     <figcaption> in its markup. */
  const txt = el.querySelector('.txt');
  if(txt){ txt.innerHTML = sanitize(it.html); mathify(txt); }
  const cap = el.querySelector('figcaption');
  if(cap){ cap.textContent = it.cap || ''; mathify(cap); }
  if(spec.mount) spec.mount(el, it, ctx);      // print, thumbnails and exports come through here too

  if(!live){ el.querySelector('.rot').remove(); el.querySelector('.rs').remove(); return el; }

  /* ---- toolbar ---- */
  const tb = el.querySelector('.tools');
  const mk = (label, title, fn, cls) => {
    const b = document.createElement('button');
    if(cls) b.className = cls; else b.textContent = label;
    b.title = title;
    b.addEventListener('pointerdown', e => { e.stopPropagation(); e.preventDefault(); }); // keep text selection alive
    b.addEventListener('click', e => { e.stopPropagation(); fn(b); });
    tb.appendChild(b); return b;
  };
  if(sizeable(it)){
    mk('A−', 'Smaller', () => { it.fs = Math.max(9, (it.fs || 18) - 3); el.style.setProperty('--fs', it.fs); queueSave(page.id); });
    mk('A+', 'Bigger',  () => { it.fs = Math.min(140, (it.fs || 18) + 3); el.style.setProperty('--fs', it.fs); queueSave(page.id); });
  }
  /* selection highlighter dots on any editable text */
  if(txt){
    HL_COLORS.forEach(c => {
      const b = mk('', 'Highlight selection', () => applyHighlight(el, txt, it, page, c), 'hld');
      b.style.background = c;
    });
    mk('⌫H', 'Remove highlight from selection', () => applyHighlight(el, txt, it, page, 'transparent'));
    mk('∑', 'Equation — wraps the selection in $$…$$', () => insertMath(el, txt, it, page));
  }
  if(spec.tools) spec.tools(mk, it, el, page);          // whatever the feature itself offers

  /* ---- the buttons every item has ---- */
  mk('📌', 'Pin & tie a string to another item', () => startLinking(page, it));
  mk('→', 'Draw an arrow to another item', () => startLinking(page, it, 'arr'));
  if(layers(index).length > 1)
    mk('▤' + (layIdx(index, it.lay) + 1), 'Layer ' + (layIdx(index, it.lay) + 1) +
       ' — click to move this to the next layer', b => {
      const ls = layers(index), n = (layIdx(index, it.lay) + 1) % ls.length;
      it.lay = ls[n].id;
      el.dataset.lay = it.lay;
      el.style.zIndex = zOf(index, it);
      b.textContent = '▤' + (n + 1);
      b.title = 'Layer ' + (n + 1) + ' — click to move this to the next layer';
      applyLayerClasses(); renderLayers(); queueSave(page.id); SND.plop();
    });
  mk('⤒', 'Bring to front', () => reorder(page, it, true));
  mk('⤓', 'Send to the back', () => reorder(page, it, false));
  mk('✕', 'Delete', () => {
    if(kidsOf(it).length &&
       !confirm('Delete this folder and the ' + kidsOf(it).length + ' things in it?')) return;
    removeItem(page, it);
  });

  /* ---- rich text editing ---- */
  if(txt){
    el.addEventListener('dblclick', e => { e.stopPropagation(); startEdit(el, txt); });
    txt.addEventListener('blur', () => {
      el.classList.remove('editing'); txt.contentEditable = 'false';
      it.html = sanitize(txt.innerHTML);
      txt.innerHTML = it.html; mathify(txt);          // leaving the box compiles the maths
      queueSave(page.id); });
    txt.addEventListener('input', () => { it.html = sanitize(txt.innerHTML); queueSave(page.id); SND.scratch(); });
    txt.addEventListener('pointerdown', e => { if(el.classList.contains('editing')) e.stopPropagation(); });
  }
  if(cap){
    cap.contentEditable = 'true';
    cap.addEventListener('pointerdown', e => e.stopPropagation());
    cap.addEventListener('focus', () => unmathify(cap));
    cap.addEventListener('input', () => { it.cap = cap.textContent; queueSave(page.id); });
    cap.addEventListener('blur', () => { cap.textContent = it.cap || ''; mathify(cap); });
  }
  if(spec.wire) spec.wire(el, it, page);               // the feature's own behaviour

  el.querySelector('.rot').addEventListener('pointerdown', e => { select(it.id); startRotate(e, it, el, page); });
  el.addEventListener('pointerdown', e => {
    if(el.classList.contains('editing')) return;
    /* while an item is "playing" — a video, a model being turned, a guide being
       posed — the mouse belongs to it rather than to the page */
    if(el.classList.contains('play') && playAreas() && e.target.closest(playAreas())) return;
    select(it.id);
    if(e.target.classList.contains('rs')) startResize(e, it, el, page);
    else if(!e.target.classList.contains('rot')) startDrag(e, it, el, page);
  });
  return el;
}
/* the inner surfaces features have claimed for themselves, as one selector */
let _playAreas = null;
function playAreas(){
  if(_playAreas === null)
    _playAreas = Object.keys(ITEMS).map(t => ITEMS[t].playArea).filter(Boolean).join(',');
  return _playAreas;
}

/* ---- what an item owns in the media store ----
   An item keeps blobs in one of three ways, and any feature may use any of them:
   `it.media` is one blob, `it.texs` is a map of them, and a spec's parts() hands
   back nested records that own their own — a folder's contents, a flip card's
   picture. Everything below is that one convention, walked. */
function mediaRecords(it){
  const out = [it];
  const parts = specOf(it).parts;
  if(parts) for(const k of parts(it) || []) out.push(...mediaRecords(k));
  return out;
}
function mediaIds(it){
  const out = [];
  for(const r of mediaRecords(it)){
    if(r.media) out.push(r.media);
    if(r.texs) for(const k in r.texs) if(r.texs[k]) out.push(r.texs[k]);
  }
  return out;
}
/* fresh blob ids for a restored item, everything nested in it and all */
function remapMedia(it, fresh){
  for(const r of mediaRecords(it)){
    if(r.media) r.media = fresh(r.media);
    if(r.texs) for(const k in r.texs) r.texs[k] = fresh(r.texs[k]);
  }
}
/* gone for good: the blob, and the URL the page was showing it through */
function binMedia(id){
  mediaDel(id);
  if(MEDIA_URL[id]){ URL.revokeObjectURL(MEDIA_URL[id]); delete MEDIA_URL[id]; }
}
/* the page has finished with a blob — but an undo may want it back on the page
   in a moment, so the stack is offered it first (core/history.js) */
function dropMedia(id){
  if(typeof histDrop === 'function' && histDrop(id)) return;
  binMedia(id);
}

const maxZ = p => p.items.reduce((m, i) => Math.max(m, i.z || 1), 1);
/* front / back within the item's own layer — renumbered so z never runs away */
function reorder(page, it, toFront){
  const k = layKey(it);
  const sibs = page.items.filter(x => layKey(x) === k).sort((a, b) => (a.z || 1) - (b.z || 1));
  const rest = sibs.filter(x => x !== it);
  (toFront ? [...rest, it] : [it, ...rest]).forEach((x, i) => { x.z = i + 1; });
  sibs.forEach(x => {
    const el = document.querySelector('#pageHost .item[data-id="' + x.id + '"]');
    if(el) el.style.zIndex = zOf(index, x);
  });
  queueSave(page.id); SND.plop();
}
function removeItem(page, it){
  page.items = page.items.filter(x => x.id !== it.id);
  dropLinks(page, it.id);
  /* a feature may be holding the item in a set of its own — being edited, being
     moved, being posed — and wants to hear that it has gone */
  for(const t in ITEMS) if(ITEMS[t].forget) ITEMS[t].forget(it);
  mediaIds(it).forEach(dropMedia);
  queueSave(page.id); select(null); SND.pluck(); render();
}

/* highlight current selection inside a text item */
function applyHighlight(el, txt, it, page, color){
  const sel = getSelection();
  const inBox = sel.rangeCount && txt.contains(sel.anchorNode) && txt.contains(sel.focusNode);
  if(!el.classList.contains('editing')) startEdit(el, txt);
  if(!inBox || sel.isCollapsed){ return; } // nothing selected: dots just arm the editor
  try{ document.execCommand('styleWithCSS', false, true); }catch(e){}
  document.execCommand('hiliteColor', false, color);
  it.html = sanitize(txt.innerHTML);
  queueSave(page.id); SND.scratch();
}
