/* Open Note — core/item.js
   building one item on the page */

/* A `.txt` and a <figcaption> are the two writing surfaces core itself puts on
   an item, and both compile $$…$$ — so both take the maths editor. */
defineMathBox('.txt');
defineMathBox('figcaption');

/* ================= item rendering =================
   Generic from top to bottom. What an item looks like, what its toolbar holds,
   what it owns and how it behaves all come from the registry, so nothing in
   here mentions a note, a plot or a deck of cards by name. See
   core/registry.js for the contract, and js/items/* for the features. */
/* ---- how wide the box is ----
   The one place that knows whether `w` is a width or a ceiling. A card that
   always sizes itself is left alone; one the reader may pin is given `w` as a
   max-width, so it is as wide as its writing and wraps at the ceiling rather
   than sitting in an acre of empty box that swallows clicks meant for the paper;
   anything else is simply `w` wide. See canPin() in core/registry.js. */
/* the width it has grown to, as a percentage of the sheet. offsetWidth on both
   sides on purpose: the sheet carries a transform scale while a zoom gesture is
   in flight, and a measured rectangle would take that in with it. */
const elWidthPct = el => el.offsetWidth / el.parentElement.offsetWidth * 100;

function applyWidth(el, it){
  el.style.width = ''; el.style.maxWidth = '';
  el.classList.toggle('hug', autoWidth(it) && canPin(it));
  if(typeof it.w !== 'number') return;
  if(!autoWidth(it)) el.style.width = it.w + '%';
  else if(canPin(it)) el.style.maxWidth = it.w + '%';
}

function buildItem(it, page, live, urls, bIdx){
  const idx = bIdx || index;
  const spec = specOf(it);
  const ctx = { live: !!live, urls: urls || MEDIA_URL, page, idx };

  const el = document.createElement('div');
  el.className = 'item'; el.dataset.id = it.id; el.dataset.type = it.type;
  el.dataset.lay = layers(idx)[layIdx(idx, it.lay)].id;
  el.style.left = it.x + '%'; el.style.top = it.y + '%';
  applyWidth(el, it);
  el.style.transform = 'rotate(' + (it.rot || 0) + 'deg)';
  el.style.zIndex = zOf(idx, it);
  if(it.fs) el.style.setProperty('--fs', it.fs);
  if(it.mk) el.style.setProperty('--mk', it.mk);

  el.innerHTML = '<div class="tools"></div>' + (spec.html ? spec.html(it, ctx) : '') +
                 '<div class="rot"></div><div class="rs"></div>';

  /* Anything may carry writing and a caption, and both are stored as what was
     typed — LaTeX, backticks and all — and shown compiled: typeset maths and
     code set in the typewriter face. A feature gets them simply by putting a
     .txt or a <figcaption> in its markup. */
  const txt = el.querySelector('.txt');
  if(txt){ txt.innerHTML = sanitize(it.html); richify(txt, ctx.live); }
  const cap = el.querySelector('figcaption');
  if(cap){ cap.textContent = it.cap || ''; richify(cap, ctx.live); }
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
  /* hugging its writing, or pinned at a width — the resize handle pins it too */
  if(canPin(it)){
    const say = b => {
      b.textContent = autoWidth(it) ? '↔' : '▭';
      b.title = autoWidth(it) ? 'As wide as the writing — click to pin it at this width'
                              : 'Pinned width — click to let it follow the writing again';
    };
    say(mk('', '', b => {
      if(autoWidth(it)) pinWidth(it, elWidthPct(el));
      else it.aw = true;
      applyWidth(el, it); say(b); queueSave(page.id); SND.plop();
    }));
  }
  /* One highlighter on any editable text: the swatches, an RGB wheel for
     anything else and ⌫ to take a highlight off all live behind it, because six
     buttons of highlighting on the front of every toolbar was five too many. */
  if(txt){
    const hb = mk('', 'Highlight the selection — swatches, a colour wheel, and ⌫',
      () => openHighlight(hb, el, txt, it, page), 'hld');
    hb.style.background = HL_LAST;
  }
  if(spec.tools) spec.tools(mk, it, el, page);          // whatever the feature itself offers

  /* ---- the buttons every item has ----
     Pins, strings and arrows are not here: they are two clicks rather than one
     item's property, so they are tiles on the Decor shelf (js/paper/strings.js). */
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
      txt.innerHTML = it.html; richify(txt);          // leaving the box compiles the maths and the code
      queueSave(page.id);
      dropIfBlank(page, it, el); });
    txt.addEventListener('input', () => { it.html = sanitize(txt.innerHTML); queueSave(page.id); SND.scratch(); });
    txt.addEventListener('pointerdown', e => { if(el.classList.contains('editing')) e.stopPropagation(); });
  }
  if(cap){
    cap.contentEditable = 'true';
    cap.addEventListener('pointerdown', e => e.stopPropagation());
    cap.addEventListener('focus', () => plainify(cap));
    cap.addEventListener('input', () => { it.cap = cap.textContent; queueSave(page.id); });
    cap.addEventListener('blur', () => { cap.textContent = it.cap || ''; richify(cap); });
  }
  if(spec.wire) spec.wire(el, it, page);               // the feature's own behaviour

  el.querySelector('.rot').addEventListener('pointerdown', e => { select(it.id); startRotate(e, it, el, page); });
  el.addEventListener('pointerdown', e => {
    if(el.classList.contains('editing')) return;
    /* while an item is "playing" — a video, a model being turned, a guide being
       posed — the mouse belongs to it rather than to the page */
    if(el.classList.contains('play') && playAreas() && e.target.closest(playAreas())) return;
    if(!selectionHas(it.id)) select(it.id);
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
function removeItems(page, items){
  const gone = new Set((items || []).map(it => it.id));
  if(!gone.size) return;
  page.items = page.items.filter(x => !gone.has(x.id));
  for(const id of gone) dropLinks(page, id);
  /* a feature may be holding the item in a set of its own — being edited, being
     moved, being posed — and wants to hear that it has gone */
  for(const it of items){
    for(const t in ITEMS) if(ITEMS[t].forget) ITEMS[t].forget(it);
    mediaIds(it).forEach(dropMedia);
  }
  queueSave(page.id); select(null); SND.pluck(); render();
}
function removeItem(page, it){ removeItems(page, [it]); }

/* ---- an empty box is nothing ----
   Whitespace and markup only, however it got that way. A double-click on bare
   paper makes a text box, so the commonest empty one on a page was never asked
   for at all; rather than leave an invisible thing there to catch clicks, an
   item that is nothing but its writing takes itself off when it is left with
   none. Features opt in with `dropWhenBlank` — see core/registry.js.

   A tick late, on purpose: the rest of the blur has work to finish, and the
   blur may only be the colour wheel taking the focus for a moment. */
const blankText = h => !String(h == null ? '' : h)
  .replace(/<[^>]*>/g, ' ').replace(/&nbsp;/gi, ' ').trim();

function dropIfBlank(page, it, el){
  if(!specOf(it).dropWhenBlank || !blankText(it.html)) return;
  setTimeout(() => {
    if(!el.isConnected || !blankText(it.html) || !page.items.includes(it)) return;
    if(PROPS_ANCHOR && el.contains(PROPS_ANCHOR)) return;   // a panel of its own is open
    const a = document.activeElement;
    if(a && a.closest && a.closest('#props,.item[data-id="' + it.id + '"]')) return;
    removeItem(page, it);
  }, 0);
}

/* ---- the highlighter ----
   One button on the toolbar, wearing the last colour used, opening a panel with
   the four swatches, a colour wheel for anything else and ⌫ to take a highlight
   off again. Clicking inside a glass panel is a click outside the writing, so
   the selection is remembered as the panel opens and put back to apply. */
let HL_LAST = HL_COLORS[0];
function openHighlight(anchor, el, txt, it, page){
  if(!el.classList.contains('editing')) startEdit(el, txt);   // nothing picked yet: arm the editor
  const sel = getSelection();
  const live = sel.rangeCount && !sel.isCollapsed &&
               txt.contains(sel.anchorNode) && txt.contains(sel.focusNode);
  let held = live ? sel.getRangeAt(0).cloneRange() : null;
  const paint = c => {
    if(c !== 'transparent'){ HL_LAST = c; anchor.style.background = c; }
    /* the command rewrites the very nodes the range stood on, so the words that
       were picked are taken up again from where they ended up */
    held = applyHighlight(el, txt, it, page, c, held);
  };
  openProps(anchor, {
    title: 'Highlight',
    rows: [{ t: 'swatch', label: 'Colour', colors: HL_COLORS, wheel: true, none: true,
             get: () => HL_LAST, pick: paint }]
  });
}
/* Highlight the selection inside a text item. `held` is the range the panel was
   opened on, since opening it took the caret out of the box; the range that is
   live afterwards comes back, to paint over the same words again. */
function applyHighlight(el, txt, it, page, color, held){
  if(!el.classList.contains('editing')) startEdit(el, txt);
  const sel = getSelection();
  if(held && txt.contains(held.startContainer) && txt.contains(held.endContainer)){
    txt.focus(); sel.removeAllRanges(); sel.addRange(held);
  }
  const inBox = sel.rangeCount && txt.contains(sel.anchorNode) && txt.contains(sel.focusNode);
  if(!inBox || sel.isCollapsed) return null;      // nothing picked: the panel just armed the editor
  try{ document.execCommand('styleWithCSS', false, true); }catch(e){}
  document.execCommand('hiliteColor', false, color);
  it.html = sanitize(txt.innerHTML);
  queueSave(page.id); SND.scratch();
  return sel.rangeCount ? sel.getRangeAt(0).cloneRange() : null;
}
