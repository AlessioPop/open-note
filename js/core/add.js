/* Open Note — core/add.js
   adding items to a page */

/* ================= adding items =================
   Every entry in the add menu is a `kind` some feature registered. Core does
   not know what any of them are: it asks the registry to make one, drops it on
   the page, and lets the feature say what should happen next — a text box opens
   for typing, or a matrix puts the caret in its first cell. See core/registry.js. */
function addItem(kind, at, page){
  page = page || sheet();
  const entry = ADD_KINDS[kind];
  if(!entry) return;
  /* some things can't be made on the spot — they need a file off the disk, or a
     link typed into a box — so the feature takes over and comes back later */
  if(entry.pick) return entry.pick(at, page);

  /* the room kept clear so a new thing lands whole on the paper is measured in
     page units: a bigger sheet is more room, not a proportionally wider margin */
  const pos = at || viewCentre(page);
  const base = { id: uid(), x: clamp(pos.x, 2, 100 - pctW(200)), y: clamp(pos.y, 4, 100 - pctH(200)),
    rot: 0, z: maxZ(page) + 1, lay: curLayerId() };   // straight in — the rotate handle is there for anyone who wants a tilt
  const it = entry.make(base, kind);
  if(!it) return;
  it.type = it.type || entry.type;
  /* a feature's width is a slice of the paper, written for a normal page — on a
     bigger sheet the same slice would come out bigger, so it is rescaled back */
  if(typeof it.w === 'number') it.w = clamp(it.w * pgK(), minItemW(), 100);
  SND[entry.spec.sound || 'plop']();

  page.items.push(it); queueSave(page.id); render().then(() => {
    select(it.id);
    const el = document.querySelector('.item[data-id="' + it.id + '"]');
    if(entry.spec.after) return entry.spec.after(it, el, page);
    const t = el && el.querySelector('.txt');       // by default, a new item is ready to type in
    if(t) startEdit(el, t);
  });
}
/* nobody said where — the + button rather than the pointer. The middle of what
   is on screen, which on a sheet bigger than the desk is not the middle of it. */
function viewCentre(page){
  const surf = document.querySelector('#pageHost .surface');
  if(!surf) return { x: 16, y: 20 };
  const r = surf.getBoundingClientRect(), st = $('#stage').getBoundingClientRect();
  return pctFrom({ clientX: clamp((st.left + st.right) / 2, r.left, r.right),
                   clientY: clamp((st.top + st.bottom) / 2, r.top, r.bottom) }, surf);
}
/* Anything on the screen carrying data-add is an add button — the palette
   builds its tiles out of the registry long after this file has loaded, so the
   listening is done once, here, on the document. Capture phase: the palette
   closes itself (and forgets where it was opened) on the way UP, and the where
   has to be read before that. */
document.addEventListener('click', e => {
  const b = e.target.closest('[data-add]');
  if(!b) return;
  const at = qCtx && qCtx.at, pg = qCtx && qCtx.page;   // the palette remembers where it was opened
  /* a feature may have opened the palette for itself — a card taking a widget
     onto its face — and gets the pick first; the sheet only if it declines */
  if(qCtx && qCtx.take && qCtx.take(b.dataset.add)) return;
  addItem(b.dataset.add, at || undefined, pg || undefined);
}, true);
