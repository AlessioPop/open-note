/* Open Note — items/deck.js
   flip cards — a deck of index cards */

/* ================= flip cards =================
   A deck is one item on the page holding a stack of cards. A card has two sides —
   the question and the answer — and each side is a little board you lay things out
   on: text (LaTeX included), a picture, a video, a model out of Blender, a file, a
   row of multiple choice options. Everything on a card can be dragged and sized,
   and snaps to the card's own centre lines and to whatever else is already on it.
   What you got right and wrong is kept per card, so a deck can be replayed — all of
   it, or only the ones you missed. ⌖ gives the card the whole screen.

   Everything on a card is measured in the card itself — positions in per cent of it,
   type in cqh, hundredths of its height — so one card reads the same taped to the
   page, zoomed in, filling the screen, and printed. */

/* both faces of a card take LaTeX, so both take the maths editor */
defineMathBox('.dtxt');
defineMathBox('.dot');

const DECK_EDIT = new Set();                       // decks being written rather than studied
let SELB = null;                                   // the thing on the card being worked on
const MC_KEYS = 'ABCDEFGHI';
const SNAP = 1.3;                                  // how near a guide has to be to grab, in % of the card
const BLK_MIN = 6;

const newBlk = (k, o) => Object.assign({ id: uid(), k, x:50, y:50, w:84 }, o);
const newCard = () => ({ id: uid(),
  qb: [newBlk('text', { fs:8.6, al:'center', html:'' })],
  ab: [newBlk('text', { fs:7.6, al:'center', html:'' })],
  pick: [], res: null, right: 0, wrong: 0 });

/* one thing on a card, spread down it so nothing lands on top of anything else */
function relayout(arr){
  const n = arr.length || 1;
  arr.forEach((b, i) => { b.y = Math.round((14 + (i + 0.5) / n * 72) * 10) / 10; });
}
/* a card written before the sides were boards keeps everything it had — its text,
   its pictures and its options are simply laid out on one */
function upgradeCard(c){
  if(c.qb && c.ab) return c;
  const lay = (html, media, mc, fs) => {
    const out = [];
    if(html || (!media.length && !(mc && mc.length)))
      out.push(newBlk('text', { fs, al:'center', html: html || '' }));
    media.forEach(rec => out.push(newBlk('media', { w: rec.type === 'file' ? 34 : 56, rec })));
    if(mc && mc.length) out.push(newBlk('mc', { fs:5.4, w:88, opts: mc }));
    relayout(out);
    return out;
  };
  if(!c.qb) c.qb = lay(c.q, c.qm || [], c.mc, 8.6);
  if(!c.ab) c.ab = lay(c.a, c.am || [], null, 7.6);
  delete c.q; delete c.a; delete c.qm; delete c.am; delete c.mc;
  return c;
}
const cardsOf = it => {
  const cs = it.cards || (it.cards = []);
  for(const c of cs) upgradeCard(c);
  return cs;
};
const blocksOf = (c, side) => side ? (c.ab || (c.ab = [])) : (c.qb || (c.qb = []));
const allBlocks = c => [].concat(c.qb || [], c.ab || []);
const blkOf = (c, id) => allBlocks(c).find(b => b.id === id) || null;
const blkSide = (c, b) => (c.ab || []).indexOf(b) >= 0 ? 1 : 0;
const cardMedia = c => allBlocks(c).filter(b => b.k === 'media' && b.rec).map(b => b.rec);
const deckMedia = it => cardsOf(it).reduce((a, c) => a.concat(cardMedia(c)), []);
const mcOf = c => allBlocks(c).find(b => b.k === 'mc') || null;
const mcMulti = b => !!b && (b.opts || []).filter(o => o.ok).length > 1;
const plain = h => String(h == null ? '' : h).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
const cardText = c => plain((c.qb || []).filter(b => b.k === 'text').map(b => b.html).join(' ')) ||
  plain(((mcOf(c) || { opts:[] }).opts[0] || {}).t);
const sideHas = (c, side) => blocksOf(c, side).some(b => b.k !== 'text' || plain(b.html));

/* the cards this run goes through — the whole deck, or what a replay picked out */
function deckRun(it){
  const q = (it.queue || []).map(id => cardsOf(it).find(c => c.id === id)).filter(Boolean);
  return q.length ? q : cardsOf(it);
}
function deckAt(it){
  const run = deckRun(it);
  if(!run.length) return null;
  it.i = clamp(it.i || 0, 0, run.length - 1);
  return run[it.i];
}
function deckRec(it, id){
  for(const c of cardsOf(it)) for(const r of cardMedia(c)) if(r.id === id) return r;
  return null;
}
function cardOfEl(it, el){
  const slot = el && el.closest ? el.closest('[data-card]') : null;
  return slot ? cardsOf(it).find(c => c.id === slot.dataset.card) || deckAt(it) : deckAt(it);
}
/* the score, over this run only: a wrong-only replay is marked against itself */
function deckStats(it){
  const run = deckRun(it);
  const right = run.filter(c => c.res === 'right').length;
  const wrong = run.filter(c => c.res === 'wrong').length;
  const done = right + wrong;
  return { n: run.length, right, wrong, done, left: run.length - done,
           pct: done ? Math.round(right / done * 100) : 0 };
}

/* ---- the markup: one shell serves the page, the scope and the printed page ---- */
function deckShell(mode){
  const btns = mode === 'scope'
    ? '<button data-a="stats" title="The score so far">Σ</button>' +
      '<button data-a="replay" title="Replay the whole deck">↻</button>' +
      '<button data-a="replaywrong" title="Replay only the ones you got wrong">↻✗</button>' +
      '<button data-a="close" title="Close (Esc)">✕</button>'
    : mode === 'page'
    ? '<button data-a="scope" title="Study — the card takes the whole screen">⌖</button>'
    : '';
  return '<figure class="body deck' + (mode === 'scope' ? ' scoped' : mode === 'static' ? ' static' : '') + '">' +
    '<div class="dbar">' + (mode === 'page' ? btns : '') +
    /* the deck's name is the item's caption — print and exports fill it the same way */
    (mode === 'scope' ? '<span class="dnm"></span>' : '<figcaption class="dnm"></figcaption>') +
    '<span class="dpos"></span>' + (mode === 'scope' ? btns : '') + '</div>' +
    '<div class="dprog"><i></i></div>' +
    '<div class="dstage"></div><div class="dfoot"></div></figure>';
}
/* a picture, a video, a Blender model or a file, sitting on a card */
function mediaHTML(rec, live, urls){
  if(rec.type === 'image')
    return '<img class="dmi" alt="" src="' + esc(rec.src || '') + '">';
  if(rec.type === 'video')
    return '<div class="dvid">' + (
      rec.vkind === 'yt'
        ? '<iframe src="https://www.youtube-nocookie.com/embed/' + esc(rec.vid) + '?rel=0" title="video" allow="autoplay; fullscreen; encrypted-media; picture-in-picture" allowfullscreen referrerpolicy="strict-origin-when-cross-origin" loading="lazy"></iframe>'
        : rec.vkind === 'vimeo'
        ? '<iframe src="https://player.vimeo.com/video/' + esc(rec.vid) + '" title="video" allow="autoplay; fullscreen; picture-in-picture" allowfullscreen loading="lazy"></iframe>'
        : '<video controls preload="metadata"' + (rec.media ? ' data-media="' + esc(rec.media) +
          '" src="' + esc((urls || {})[rec.media] || '') + '"' : '') + '></video>') + '</div>';
  if(rec.type === 'model')
    return '<div class="dm dm-model" data-rec="' + esc(rec.id) + '">' +
      '<div class="mwrap">' + (live
        ? '<canvas class="mv"></canvas>'
        : rec.poster ? '<img class="mv" alt="" src="' + esc(rec.poster) + '">'
        : '<div class="mph">' + esc(rec.name || '3D model') + '</div>') + '</div>' +
      '<div class="dmname"><b>' + esc(entryName(rec)) + '</b><i></i></div></div>';
  return '<div class="dfile" data-rec="' + esc(rec.id) + '"><span class="ficon">' + itemGlyph(rec) + '</span>' +
    '<span class="dfn">' + esc(entryName(rec)) + '<i>' + esc(entryMeta(rec) || 'file') + '</i></span></div>';
}
/* the options, when the card asks a multiple choice question */
function mcHTML(b, c, live, edit){
  const opts = b.opts || [];
  const answered = live && !edit && (c.pick || []).length && c.res;
  const rows = opts.map((o, i) => {
    const picked = (c.pick || []).indexOf(i) >= 0;
    const cls = edit ? (o.ok ? ' isok' : '')
      : answered ? (o.ok ? ' ok' : picked ? ' no' : '')
      : picked ? ' picked' : '';
    return '<li class="dopt' + cls + '" data-o="' + i + '">' +
      '<span class="dkey"' + (edit ? ' data-a="ok" title="Mark this one correct"' : '') + '>' +
      (edit && o.ok ? '✓' : MC_KEYS[i] || '·') + '</span>' +
      '<span class="dot"' + (edit ? ' contenteditable="true" data-ph="an option"' : '') + '>' +
      sanitize(o.t) + '</span>' +
      (edit ? '<button class="dsm" data-a="rmopt" title="Remove this option">✕</button>' : '') + '</li>';
  }).join('');
  const foot = edit
    ? '<button class="dmini" data-a="mc">+ option</button>' +
      '<span class="dhintline">tick the ones that are right</span>'
    : mcMulti(b) && !answered
    ? '<button class="dmini" data-a="check">Check my answer</button>' +
      '<span class="dhintline">more than one is right</span>'
    : '';
  return '<ul class="dmc">' + rows + '</ul>' + (foot ? '<div class="dmcadd">' + foot + '</div>' : '');
}
function blockHTML(b, c, live, urls, edit, side, n){
  const st = 'left:' + b.x + '%;top:' + b.y + '%;width:' + b.w + '%' +
    (b.fs ? ';--bfs:' + b.fs : '') + (b.al ? ';text-align:' + b.al : '');
  let inner;
  if(b.k === 'text')
    inner = '<div class="dtxt" data-ph="' + (n ? 'more' : side ? 'the answer' : 'the question') + '"' +
      (edit ? ' contenteditable="true"' : '') + '>' + sanitize(b.html) + '</div>';
  else if(b.k === 'media') inner = b.rec ? mediaHTML(b.rec, live, urls) : '';
  else inner = mcHTML(b, c, live, edit);
  return '<div class="dblk k-' + b.k + (edit && SELB === b.id ? ' sel' : '') +
    '" data-b="' + esc(b.id) + '" style="' + st + '">' + inner +
    (edit ? '<i class="dbh" title="Drag to size it"></i>' : '') + '</div>';
}
/* one side of a card */
function faceHTML(c, side, live, urls, edit){
  let n = 0;
  return '<div class="dface ' + (side ? 'dback' : 'dfront') + '">' +
    '<div class="dhead"><span class="dlab">' + (side ? 'answer' : 'question') + '</span>' +
    (c.res ? '<span class="dmark ' + c.res + '">' + (c.res === 'right' ? '✓ right' : '✗ wrong') + '</span>' : '') +
    '</div><div class="dbody">' +
    blocksOf(c, side).map(b => blockHTML(b, c, live, urls, edit, side, b.k === 'text' ? n++ : 0)).join('') +
    (edit ? '<i class="dg dgv"></i><i class="dg dgh"></i>' : '') +
    '</div></div>';
}
function cardHTML(c, live, urls, edit, flipped){
  return '<div class="dcard' + (flipped ? ' flipped' : '') + '" data-card="' + esc(c.id) + '">' +
    faceHTML(c, 0, live, urls, edit) + faceHTML(c, 1, live, urls, edit) + '</div>';
}
/* the row under the card: flipping and marking, or the tools to write cards with */
function footHTML(it, edit, big){
  const c = deckAt(it), s = deckStats(it);
  const nav = '<button data-a="prev" title="The card before this one">‹</button>' +
    '<button data-a="flip" class="dflip" title="' + (edit ? 'Write the other side' : 'Turn the card over') + '">' +
    (it.side ? '↺ question' : '↺ answer') + '</button>' +
    '<button data-a="next" title="The next card">›</button>';
  if(!edit) return '<div class="drow">' + nav +
    '<span class="dgap"></span>' +
    '<button data-a="wrong" class="dno' + (c && c.res === 'wrong' ? ' on' : '') + '" title="I got this one wrong (w)">✗' + (big ? ' wrong' : '') + '</button>' +
    '<button data-a="right" class="dok' + (c && c.res === 'right' ? ' on' : '') + '" title="I got this one right (r)">✓' + (big ? ' right' : '') + '</button>' +
    '<button class="dtally" data-a="stats" title="The score so far">' + s.right + '✓ ' + s.wrong + '✗</button>' +
    '</div>';
  const b = c && SELB ? blkOf(c, SELB) : null;
  return '<div class="drow">' + nav + '<span class="dsep"></span>' +
    '<button data-a="text" title="Another line of text on this side">＋ Text</button>' +
    '<button data-a="pic">Picture</button><button data-a="vid">Video</button>' +
    '<button data-a="mdl" title="A .obj out of Blender — take its .mtl and textures too">Model</button>' +
    '<button data-a="file" title="A PDF, or any file">File</button>' +
    '<button data-a="mc" title="Ask it as a multiple choice question">A/B</button>' +
    '<span class="dgap"></span>' +
    '<button data-a="add" title="A new card after this one">＋ card</button>' +
    '<button data-a="delcard" title="Delete this card">✕ card</button>' +
    '<button data-a="edit" class="on" title="Back to studying">Done</button></div>' +
    (b ? '<div class="drow drow2">' +
      '<span class="dlab2">' + (b.k === 'text' ? 'text' : b.k === 'mc' ? 'options' : entryName(b.rec || {})) + '</span>' +
      (b.fs ? '<button data-a="bsm" title="Smaller">A−</button><button data-a="bbg" title="Bigger">A+</button>' : '') +
      (b.k !== 'media' ? '<button data-a="alL" class="dal' + (b.al === 'left' ? ' on' : '') + '" title="Line it up left">L</button>' +
        '<button data-a="alC" class="dal' + (b.al === 'center' ? ' on' : '') + '" title="Centre the writing">C</button>' +
        '<button data-a="alR" class="dal' + (b.al === 'right' ? ' on' : '') + '" title="Line it up right">R</button>' : '') +
      '<button data-a="bnar" title="Narrower">◧−</button><button data-a="bwid" title="Wider">◧+</button>' +
      '<button data-a="bmid" title="Put it in the middle of the card">⌖ middle</button>' +
      (b.k === 'text' ? '<button data-a="math" title="Equation — wraps the selection in $$…$$">∑</button>' : '') +
      '<span class="dgap"></span>' +
      '<button data-a="brm" title="Take it off the card">✕</button></div>' : '');
}
/* the scoreboard — how the run went, and how to run it again */
function statsHTML(it){
  const s = deckStats(it), run = deckRun(it);
  const list = run.map((c, i) => {
    const t = cardText(c);
    return '<li class="dsc ' + (c.res || 'none') + '" data-go="' + i + '">' +
      '<span class="dscn">' + (i + 1) + '</span><span class="dsct">' +
      esc(t ? (t.length > 64 ? t.slice(0, 63) + '…' : t) : 'card ' + (i + 1)) + '</span>' +
      '<span class="dscm">' + (c.res === 'right' ? '✓' : c.res === 'wrong' ? '✗' : '–') + '</span></li>';
  }).join('');
  return '<div class="dstats"><div class="dstitle">score</div>' +
    '<div class="dsnum">' + s.right + ' <em>/ ' + (s.done || s.n) + '</em></div>' +
    '<div class="dslab">' + (s.done ? s.pct + '% right' + (s.left ? ' so far — ' + s.left + ' still to go' : '')
                                    : 'nothing marked yet') + '</div>' +
    '<div class="dsbar"><i style="width:' + (s.n ? s.right / s.n * 100 : 0) + '%"></i>' +
    '<u style="width:' + (s.n ? s.wrong / s.n * 100 : 0) + '%"></u></div>' +
    '<div class="dsrow"><span class="gd">✓ ' + s.right + ' right</span>' +
    '<span class="bd">✗ ' + s.wrong + ' wrong</span><span>' + s.left + ' unmarked</span></div>' +
    '<ul class="dsclist">' + list + '</ul>' +
    '<div class="dsacts"><button data-a="replay">↻ Replay all ' + s.n + '</button>' +
    '<button data-a="replaywrong"' + (s.wrong ? '' : ' disabled') + '>↻✗ Replay the ' + s.wrong + ' missed</button>' +
    '<button data-a="hidestats">Back to the cards</button></div></div>';
}
/* every live view of one deck: it can be on the page and in the scope at once */
function deckViews(it){
  const out = [];
  document.querySelectorAll('#pageHost .item[data-id="' + it.id + '"] .deck').forEach(f => out.push(f));
  if(SCOPE && SCOPE.it === it){
    const f = document.querySelector('#scope .deck');
    if(f) out.push(f);
  }
  return out;
}
const deckAll = (it, page) => deckViews(it).forEach(f => renderDeck(f, it, page));
const deckOthers = (it, page, mine) => deckViews(it).forEach(f => { if(f !== mine) renderDeck(f, it, page); });

/* ---- drawing one ---- */
function renderDeck(fig, it, page){
  const scoped = fig.classList.contains('scoped');
  const edit = DECK_EDIT.has(it.id);
  const run = deckRun(it), c = deckAt(it);
  fig.classList.toggle('dedit', edit);
  const stage = fig.querySelector('.dstage');
  if(scoped && SCOPE && SCOPE.stats) stage.innerHTML = statsHTML(it);
  else if(!c) stage.innerHTML = '<div class="dnone">No cards in this deck yet.' +
    '<button data-a="add">Write the first one</button></div>';
  else stage.innerHTML = (run.length > 1 ? '<div class="dstack"><i></i><i></i></div>' : '') +
    cardHTML(c, true, MEDIA_URL, edit, !!it.side);
  stage.querySelectorAll('.dtxt,.dot').forEach(mathify);
  deckChrome(fig, it);
  deckModels(fig, it, page);
  ensureMedia(page);                                 // a card's video may still want its blob url
}
/* the bar, the progress line and the foot — everything but the card itself */
function deckChrome(fig, it){
  const run = deckRun(it), s = deckStats(it);
  const pos = fig.querySelector('.dpos');
  if(pos) pos.textContent = run.length
    ? (it.i + 1) + ' / ' + run.length + (it.queue ? ' · missed' : '') : 'empty';
  const pr = fig.querySelector('.dprog i');
  if(pr) pr.style.width = (run.length ? s.done / run.length * 100 : 0) + '%';
  const foot = fig.querySelector('.dfoot');
  if(foot) foot.innerHTML = run.length || DECK_EDIT.has(it.id)
    ? footHTML(it, DECK_EDIT.has(it.id), fig.classList.contains('scoped')) : '';
}
/* models on a card are drawn by the same shared canvas the page uses; in the scope
   they can be turned around, and everywhere they pose for the still print gets */
function deckModels(fig, it, page){
  const painters = [];
  fig.querySelectorAll('.dm-model').forEach(box => {
    const rec = deckRec(it, box.dataset.rec), cv = box.querySelector('canvas.mv');
    if(!rec || !cv) return;
    mdlNote(cv, 'reading ' + (rec.name || 'model') + '…');
    let mesh = null, mats = null;
    const paint = () => { if(document.body.contains(cv)) paintModel(box, rec, mesh, mats); };
    painters.push(paint);
    Promise.all([getMesh(rec.media), getMats(rec)]).then(([m, mt]) => {
      mesh = m; mats = mt;
      paint();
      const meta = box.querySelector('.dmname i');
      if(meta && m) meta.textContent = m.tris.toLocaleString() + ' tris';
      if(m && !rec.poster) posePoster(rec).then(got => { if(got) queueSave(page.id); });
    });
    if(fig.classList.contains('scoped')) wireCardModel(box, cv, rec, page, () => paint());
  });
  fig.__paint = painters;
}
function wireCardModel(box, cv, rec, page, paint){
  box.classList.add('dturn');
  cv.addEventListener('pointerdown', e => {
    if(DECK_EDIT.has((SCOPE || {}).it && SCOPE.it.id)) return;   // writing: the block drags instead
    e.preventDefault(); e.stopPropagation();
    const pid = e.pointerId, sx = e.clientX, sy = e.clientY;
    const y0 = rec.yaw || 0, p0 = rec.pitch || 0;
    try{ cv.setPointerCapture(pid); }catch(err){}
    const mv = ev => {
      if(ev.pointerId !== pid) return;
      rec.yaw = y0 + (ev.clientX - sx) * 0.011;
      rec.pitch = clamp(p0 + (ev.clientY - sy) * 0.011, -1.5, 1.5);
      paint();
    };
    const up = () => {
      cv.removeEventListener('pointermove', mv);
      cv.removeEventListener('pointerup', up);
      cv.removeEventListener('pointercancel', up);
      queueSave(page.id);
    };
    cv.addEventListener('pointermove', mv);
    cv.addEventListener('pointerup', up);
    cv.addEventListener('pointercancel', up);
  });
  cv.addEventListener('wheel', e => {
    e.preventDefault(); e.stopPropagation();
    rec.dist = clamp((rec.dist || MDL_HOME.dist) * (e.deltaY > 0 ? 1.12 : 1 / 1.12), 1.3, 18);
    paint(); queueSave(page.id);
  }, { passive: false });
  cv.addEventListener('dblclick', e => {
    e.stopPropagation();
    rec.yaw = MDL_HOME.yaw; rec.pitch = MDL_HOME.pitch; rec.dist = MDL_HOME.dist;
    paint(); queueSave(page.id);
  });
}

/* ---- laying the card out: drag, size, and the guides that line things up ---- */
function blkBox(el, r){
  const b = el.getBoundingClientRect();
  const l = (b.left - r.left) / r.width * 100, t = (b.top - r.top) / r.height * 100;
  const w = b.width / r.width * 100, h = b.height / r.height * 100;
  return { l, t, x2: l + w, y2: t + h, cx: l + w / 2, cy: t + h / 2, w, h };
}
/* the lines worth lining up with: the card's own middle and margins, and every
   edge and middle of everything else already on this side */
function guideLines(body, el, r){
  const xs = [50, 8, 92], ys = [50, 10, 90];
  [...body.children].forEach(n => {
    if(n === el || !n.classList.contains('dblk')) return;
    const o = blkBox(n, r);
    xs.push(o.cx, o.l, o.x2); ys.push(o.cy, o.t, o.y2);
  });
  return { xs, ys };
}
/* the nearest line wins — except that dead centre wins from a little further out,
   so a wide block settles in the middle of the card instead of catching the margin
   its edge happens to be nearer */
function nearest(v, anchors, cands, th){
  let best = null;
  for(const a of anchors) for(const c of cands){
    const d = c - (v + a);
    if(Math.abs(d) > th) continue;
    const score = Math.abs(d) - (c === 50 && a === 0 ? th * 0.55 : 0);
    if(!best || score < best.score) best = { d, line: c, score };
  }
  return best;
}
function showGuides(body, gx, gy){
  const v = body.querySelector('.dgv'), h = body.querySelector('.dgh');
  if(v){ v.style.display = gx == null ? 'none' : 'block'; if(gx != null) v.style.left = gx + '%'; }
  if(h){ h.style.display = gy == null ? 'none' : 'block'; if(gy != null) h.style.top = gy + '%'; }
}
/* a tap inside a box being written puts the cursor where it landed */
function caretInto(ev, el){
  const ed = (ev.target.closest && ev.target.closest('[contenteditable="true"]')) ||
             el.querySelector('[contenteditable="true"]');
  if(!ed) return;
  if(document.activeElement !== ed){ unmathify(ed); ed.focus(); }
  let r = null;
  if(document.caretPositionFromPoint){
    const p = document.caretPositionFromPoint(ev.clientX, ev.clientY);
    if(p && ed.contains(p.offsetNode)){ r = document.createRange(); r.setStart(p.offsetNode, p.offset); }
  }else if(document.caretRangeFromPoint){
    const rr = document.caretRangeFromPoint(ev.clientX, ev.clientY);
    if(rr && ed.contains(rr.startContainer)) r = rr;
  }
  if(!r) return;
  r.collapse(true);
  const s = getSelection(); s.removeAllRanges(); s.addRange(r);
}
function startBlkDrag(e, it, page, fig, el, b){
  const body = el.parentElement, r = body.getBoundingClientRect();
  const pid = e.pointerId, sx = e.clientX, sy = e.clientY, ox = b.x, oy = b.y;
  let moved = false;
  try{ el.setPointerCapture(pid); }catch(err){}
  const mv = ev => {
    if(ev.pointerId !== pid) return;
    if(!moved && Math.hypot(ev.clientX - sx, ev.clientY - sy) < 3) return;
    moved = true; el.classList.add('drag');
    const box = blkBox(el, r), g = guideLines(body, el, r);
    let nx = clamp(ox + (ev.clientX - sx) / r.width * 100, 0, 100);
    let ny = clamp(oy + (ev.clientY - sy) / r.height * 100, 0, 100);
    const fx = ev.shiftKey ? null : nearest(nx, [0, -box.w / 2, box.w / 2], g.xs, SNAP);
    const fy = ev.shiftKey ? null : nearest(ny, [0, -box.h / 2, box.h / 2], g.ys, SNAP * r.width / r.height);
    if(fx) nx += fx.d;
    if(fy) ny += fy.d;
    b.x = Math.round(nx * 10) / 10; b.y = Math.round(ny * 10) / 10;
    el.style.left = b.x + '%'; el.style.top = b.y + '%';
    showGuides(body, fx && fx.line, fy && fy.line);
  };
  const up = ev => {
    if(ev.pointerId !== pid) return;
    el.removeEventListener('pointermove', mv);
    el.removeEventListener('pointerup', up);
    el.removeEventListener('pointercancel', up);
    el.classList.remove('drag');
    showGuides(body, null, null);
    if(moved){ queueSave(page.id); SND.plop(); deckOthers(it, page, fig); }
    else caretInto(ev, el);
  };
  el.addEventListener('pointermove', mv);
  el.addEventListener('pointerup', up);
  el.addEventListener('pointercancel', up);
}
function startBlkResize(e, it, page, fig, el, b){
  e.stopPropagation();
  const body = el.parentElement, r = body.getBoundingClientRect();
  const pid = e.pointerId, sx = e.clientX, ow = b.w, left = b.x - b.w / 2;
  try{ el.setPointerCapture(pid); }catch(err){}
  const mv = ev => {
    if(ev.pointerId !== pid) return;
    const g = guideLines(body, el, r);
    let nw = clamp(ow + (ev.clientX - sx) / r.width * 100, BLK_MIN, 100);
    const fx = ev.shiftKey ? null : nearest(left + nw, [0], g.xs, SNAP);
    if(fx) nw = clamp(nw + fx.d, BLK_MIN, 100);
    b.w = Math.round(nw * 10) / 10; b.x = Math.round((left + nw / 2) * 10) / 10;
    el.style.width = b.w + '%'; el.style.left = b.x + '%';
    showGuides(body, fx && fx.line, null);
  };
  const up = ev => {
    if(ev.pointerId !== pid) return;
    el.removeEventListener('pointermove', mv);
    el.removeEventListener('pointerup', up);
    el.removeEventListener('pointercancel', up);
    showGuides(body, null, null);
    queueSave(page.id); deckOthers(it, page, fig);
  };
  el.addEventListener('pointermove', mv);
  el.addEventListener('pointerup', up);
  el.addEventListener('pointercancel', up);
}
function selectBlock(it, id){
  SELB = id;
  deckViews(it).forEach(f => {
    f.querySelectorAll('.dblk').forEach(n => n.classList.toggle('sel', !!id && n.dataset.b === id));
    deckChrome(f, it);
  });
}
/* something new goes where there is room: on a card holding one line in the middle,
   the line steps up and makes way for it */
function addBlock(it, page, side, b){
  const c = deckAt(it);
  if(!c) return null;
  const arr = blocksOf(c, side);
  if(arr.length === 1 && arr[0].k === 'text' && Math.abs(arr[0].y - 50) < 8){
    arr[0].y = 27;
    b.y = 68;
  }else if(arr.length){
    b.y = clamp(Math.max(...arr.map(x => x.y)) + 22, 12, 88);
  }
  arr.push(b);
  DECK_EDIT.add(it.id);
  it.side = side;
  queueSave(page.id); SND.plop();
  deckAll(it, page);
  selectBlock(it, b.id);
  return b;
}

/* ---- studying ---- */
/* In the scope a card is graded the way it is thrown: it tracks the hand 1:1,
   and on release the velocity — not the position — decides ✓ right (out to
   the right), ✗ wrong (out to the left), or come back to the middle. A tap is
   still just a tap: the card turns over. Grabbing a card that is springing
   home simply takes it back. */
function scopeThrow(e, card, it, page){
  if(card._throwStop) card._throwStop();
  const pid = e.pointerId, sx = e.clientX, sy = e.clientY;
  const base = it.side ? ' rotateY(180deg)' : '';    // the flip lives under the throw
  const fl = flickTrack();
  fl.track(e);
  let dragging = false, committed = false;
  try{ card.setPointerCapture(pid); }catch(err){}
  const paint = v => {
    card._tx = v;
    card.style.transform = 'translateX(' + v + 'px) rotate(' + clamp(v / 24, -9, 9) + 'deg)' + base;
  };
  const sp = spring({ from: card._tx || 0, response: .42, damping: .8, rest: .4, onUpdate: paint,
    onRest: () => {                                  // home again: the card is the CSS's once more
      if(!dragging && !committed && Math.abs(sp.target) < 1){
        card.style.transform = ''; card.style.transition = ''; card._tx = 0;
      }
    }});
  card._throwStop = () => { sp.stopAt(); card._throwStop = null; };
  const ox = card._tx || 0;
  const mv = ev => {
    if(ev.pointerId !== pid) return;
    fl.track(ev);
    const d = ev.clientX - sx;
    if(!dragging && Math.abs(d) < 6) return;
    if(!dragging){ dragging = true; card.style.transition = 'none'; }
    sp.jump(ox + d);
  };
  const up = ev => {
    if(ev.pointerId !== pid) return;
    card.removeEventListener('pointermove', mv);
    card.removeEventListener('pointerup', up);
    card.removeEventListener('pointercancel', up);
    if(!dragging){                                   // a tap turns the card over
      card._throwStop = null;
      if(ev.type === 'pointerup' && Math.hypot(ev.clientX - sx, ev.clientY - sy) <= 5)
        deckFlip(it, page);
      return;
    }
    dragging = false;
    const v = fl.vel().vx;
    const w = card.offsetWidth || 600;
    const rest = sp.value + projectFling(v);         // where the throw would land on its own
    const dir = Math.abs(v) > 450 ? (v > 0 ? 1 : -1)
              : Math.abs(rest) > w * .45 ? (rest > 0 ? 1 : -1) : 0;
    const grade = () => {
      card.style.transform = ''; card.style.transition = ''; card._tx = 0;
      card._throwStop = null;
      markCard(it, page, dir > 0 ? 'right' : 'wrong');
    };
    if(!dir){ sp.to(0, v); return; }                 // not thrown: back it comes, speed and all
    committed = true;
    if(SPRING_STILL.matches){ grade(); return; }
    sp.set({ damping: 1, response: .38 });
    sp.to(dir * (w + 160), v);                       // out it goes, at the hand's own speed
    setTimeout(grade, 170);                          // …and the next card slides in behind it
  };
  card.addEventListener('pointermove', mv);
  card.addEventListener('pointerup', up);
  card.addEventListener('pointercancel', up);
}
function deckFlip(it, page){
  if(!deckAt(it)) return;
  it.side = it.side ? 0 : 1;
  SELB = null;
  deckViews(it).forEach(f => {
    const card = f.querySelector('.dcard');
    if(card) card.classList.toggle('flipped', !!it.side);
    f.querySelectorAll('.dblk.sel').forEach(n => n.classList.remove('sel'));
    deckChrome(f, it);
  });
  queueSave(page.id); SND.flip();
}
function deckGo(it, page, d){
  const run = deckRun(it);
  if(run.length < 2) return;
  it.i = ((clamp(it.i || 0, 0, run.length - 1) + d) % run.length + run.length) % run.length;
  it.side = 0; SELB = null;
  queueSave(page.id); SND.flip();
  deckViews(it).forEach(f => {
    renderDeck(f, it, page);
    const card = f.querySelector('.dcard');
    if(card) card.classList.add(d > 0 ? 'inr' : 'inl');
  });
}
function deckJump(it, page, i){
  const run = deckRun(it);
  if(!run.length) return;
  it.i = clamp(i, 0, run.length - 1); it.side = 0; SELB = null;
  if(SCOPE && SCOPE.it === it) SCOPE.stats = false;
  queueSave(page.id); deckAll(it, page);
}
/* ✓ / ✗ — the tally is kept for good, the result only for this run */
function markCard(it, page, res, quiet){
  const c = deckAt(it);
  if(!c) return;
  if(c.res !== res){
    if(c.res === 'right') c.right = Math.max(0, (c.right || 0) - 1);
    if(c.res === 'wrong') c.wrong = Math.max(0, (c.wrong || 0) - 1);
    c.res = res;
    if(res === 'right') c.right = (c.right || 0) + 1; else c.wrong = (c.wrong || 0) + 1;
  }
  queueSave(page.id);
  if(res === 'right') SND.tick(); else SND.pluck();
  const s = deckStats(it);
  if(quiet || s.left === 0 || deckRun(it).length < 2){
    if(s.left === 0 && SCOPE && SCOPE.it === it) SCOPE.stats = true;   // the run is over: show the score
    deckAll(it, page);
    return;
  }
  deckGo(it, page, 1);                               // straight on to the next one
}
/* multiple choice: one tap answers it, unless several options are right */
function deckOpt(it, page, li){
  const c = cardOfEl(it, li), blk = c && mcOf(c), i = +li.dataset.o;
  if(!blk || !blk.opts || !blk.opts[i]) return;
  if(DECK_EDIT.has(it.id)) return;                   // writing: the text takes the click
  if(c.res && (c.pick || []).length) return;         // answered already
  c.pick = c.pick || [];
  if(mcMulti(blk)){
    const at = c.pick.indexOf(i);
    if(at >= 0) c.pick.splice(at, 1); else c.pick.push(i);
    SND.tick(); queueSave(page.id); deckAll(it, page);
    return;
  }
  c.pick = [i];
  mcCheck(it, page, c);
}
function mcCheck(it, page, c){
  c = c || deckAt(it);
  const blk = c && mcOf(c);
  if(!blk || !(blk.opts || []).length) return;
  const pick = c.pick || [];
  if(!pick.length) return;
  const ok = blk.opts.every((o, i) => !!o.ok === (pick.indexOf(i) >= 0));
  markCard(it, page, ok ? 'right' : 'wrong', true);
  /* the answer side is worth turning to on its own — but only if there is one */
  if(sideHas(c, 1) && !it.side) setTimeout(() => {
    if(deckAt(it) === c && !it.side) deckFlip(it, page);
  }, 650);
}
function deckReplay(it, page, wrongOnly){
  const cards = cardsOf(it);
  if(wrongOnly){
    const ids = cards.filter(c => c.res === 'wrong').map(c => c.id);
    if(!ids.length){
      const f = deckViews(it)[0];
      if(f) deckFlash(f, 'nothing marked wrong');
      return;
    }
    it.queue = ids;
  }else it.queue = null;
  deckRun(it).forEach(c => { c.res = null; c.pick = []; });
  it.i = 0; it.side = 0;
  if(SCOPE && SCOPE.it === it) SCOPE.stats = false;
  queueSave(page.id); SND.flip(); deckAll(it, page);
}
function deckFlash(fig, msg){
  const bar = fig.querySelector('.dbar');
  if(!bar) return;
  const n = document.createElement('span');
  n.className = 'dflash'; n.textContent = msg;
  bar.appendChild(n);
  setTimeout(() => n.remove(), 1800);
}

/* ---- writing the cards ---- */
function deckEdit(it, page, on){
  if(on == null) on = !DECK_EDIT.has(it.id);
  if(on) DECK_EDIT.add(it.id); else DECK_EDIT.delete(it.id);
  if(!on) SELB = null;
  if(on && SCOPE && SCOPE.it === it) SCOPE.stats = false;
  deckAll(it, page);
  document.querySelectorAll('#pageHost .item[data-id="' + it.id + '"] .tools button[data-deckedit]')
    .forEach(b => { b.style.background = on ? 'var(--accent)' : ''; });
}
function deckFocus(it, side){
  const f = deckViews(it)[0];
  if(!f) return;
  const t = f.querySelector('.dface.' + (side ? 'dback' : 'dfront') + ' .dtxt');
  if(t && t.isContentEditable){ unmathify(t); t.focus(); }
}
function deckAddCard(it, page){
  const cards = cardsOf(it), run = deckRun(it), c = newCard();
  const at = run.length ? cards.indexOf(run[clamp(it.i || 0, 0, run.length - 1)]) : -1;
  cards.splice(at < 0 ? cards.length : at + 1, 0, c);
  if(it.queue) it.queue.splice((it.i || 0) + 1, 0, c.id);
  it.i = run.length ? (it.i || 0) + 1 : 0;
  it.side = 0; SELB = null;
  queueSave(page.id); SND.plop(); deckEdit(it, page, true);
  deckFocus(it, 0);
}
function deckDelCard(it, page){
  const cards = cardsOf(it), c = deckAt(it);
  if(!c) return;
  const media = cardMedia(c);
  if(media.length && !confirm('Delete this card and the ' + media.length +
     ' thing' + (media.length === 1 ? '' : 's') + ' on it?')) return;
  media.forEach(r => mediaIds(r).forEach(dropMedia));
  cards.splice(cards.indexOf(c), 1);
  if(it.queue) it.queue = it.queue.filter(id => id !== c.id);
  it.i = clamp(it.i || 0, 0, Math.max(0, deckRun(it).length - 1));
  it.side = 0; SELB = null;
  queueSave(page.id); SND.pluck(); deckAll(it, page);
}
function deckMC(it, page){
  const c = deckAt(it);
  if(!c) return;
  const blk = mcOf(c);
  if(blk){
    blk.opts = blk.opts || [];
    blk.opts.push({ t:'', ok: !blk.opts.length });
    DECK_EDIT.add(it.id);
    it.side = blkSide(c, blk);
    queueSave(page.id); SND.plop(); deckAll(it, page); selectBlock(it, blk.id);
    return;
  }
  addBlock(it, page, 0, newBlk('mc', { fs:5.4, w:88, opts:[{ t:'', ok:true }, { t:'', ok:false }] }));
}
let cardTarget = null;                               // the card side a file is being added to
function takeCardTarget(){ const t = cardTarget; cardTarget = null; return t; }
function cardWants(it, page, what){
  const c = deckAt(it);
  if(!c) return;
  cardTarget = { it, page, cardId: c.id, side: it.side ? 1 : 0 };
  if(what === 'pic') $('#cardImg').click();
  else if(what === 'mdl') $('#cardObj').click();
  else if(what === 'file') $('#cardFile').click();
  else openVideoModal();                             // a link, or "choose file" inside it
}
function addCardMedia(rec){
  const t = takeCardTarget();
  if(!rec || !t) return;
  const c = cardsOf(t.it).find(x => x.id === t.cardId);
  if(!c) return;
  if(deckAt(t.it) !== c) return;
  addBlock(t.it, t.page, t.side, newBlk('media', { w: rec.type === 'file' ? 32 : 56, rec }));
}
$('#cardImg').addEventListener('change', async e => {
  const f = e.target.files[0]; e.target.value = '';
  if(f) addCardMedia(await imageRecord(f)); else takeCardTarget();
});
$('#cardVid').addEventListener('change', async e => {
  const f = e.target.files[0]; e.target.value = '';
  if(f) addCardMedia(await videoRecord(f)); else takeCardTarget();
});
$('#cardObj').addEventListener('change', async e => {
  const fs = [...e.target.files]; e.target.value = '';
  if(fs.length) addCardMedia(await modelRecord(fs)); else takeCardTarget();
});
$('#cardFile').addEventListener('change', async e => {
  const f = e.target.files[0]; e.target.value = '';
  if(f) addCardMedia(await attachRecord(f)); else takeCardTarget();
});
/* files dropped straight onto a card land on the side you are looking at */
async function dropOnCard(it, page, files){
  const all = [].concat(files || []).filter(Boolean);
  if(!all.length || !deckAt(it)) return;
  const side = it.side ? 1 : 0;
  const recs = [];
  if(all.some(f => /\.obj$/i.test(f.name))){
    const r = await modelRecord(all);
    if(r) recs.push(r);
  }else for(const f of all){
    const r = /^image\//.test(f.type) ? await imageRecord(f)
            : /^video\//.test(f.type) ? await videoRecord(f)
            : await attachRecord(f);
    if(r) recs.push(r);
  }
  recs.forEach(r => addBlock(it, page, side, newBlk('media', { w: r.type === 'file' ? 32 : 56, rec: r })));
}

/* ---- what every button on a deck does ---- */
function deckAct(a, it, page, el){
  if(a === 'scope') return openScope(it, page);
  if(a === 'close') return closeScope();
  if(a === 'prev') return deckGo(it, page, -1);
  if(a === 'next') return deckGo(it, page, 1);
  if(a === 'flip') return deckFlip(it, page);
  if(a === 'right') return markCard(it, page, 'right');
  if(a === 'wrong') return markCard(it, page, 'wrong');
  if(a === 'check') return mcCheck(it, page);
  if(a === 'replay') return deckReplay(it, page, false);
  if(a === 'replaywrong') return deckReplay(it, page, true);
  if(a === 'edit') return deckEdit(it, page);
  if(a === 'add') return deckAddCard(it, page);
  if(a === 'delcard') return deckDelCard(it, page);
  if(a === 'mc') return deckMC(it, page);
  if(a === 'text')
    return void addBlock(it, page, it.side ? 1 : 0, newBlk('text', { fs:6.4, al:'center', w:74, html:'' }));
  if(a === 'pic' || a === 'vid' || a === 'mdl' || a === 'file') return cardWants(it, page, a);
  if(a === 'stats'){
    if(SCOPE && SCOPE.it === it){ SCOPE.stats = !SCOPE.stats; deckAll(it, page); }
    else openScope(it, page, true);
    return;
  }
  if(a === 'hidestats'){
    if(SCOPE && SCOPE.it === it){ SCOPE.stats = false; deckAll(it, page); }
    return;
  }
  const c = deckAt(it);
  if(a === 'ok' || a === 'rmopt'){
    const li = el.closest('.dopt'), blk = c && mcOf(c);
    if(!li || !blk) return;
    const i = +li.dataset.o;
    if(a === 'ok') blk.opts[i].ok = !blk.opts[i].ok;
    else {
      blk.opts.splice(i, 1);
      if(!blk.opts.length){                          // the last option gone takes the box with it
        const arr = blocksOf(c, blkSide(c, blk));
        arr.splice(arr.indexOf(blk), 1);
      }
    }
    queueSave(page.id); SND.tick(); deckAll(it, page);
    return;
  }
  /* the rest work on whatever is picked out on the card */
  const b = c && SELB ? blkOf(c, SELB) : null;
  if(!b) return;
  const fig = el.closest('.deck');
  const bel = fig && fig.querySelector('.dblk[data-b="' + b.id + '"]');
  const save = () => { queueSave(page.id); deckAll(it, page); };
  if(a === 'bsm' || a === 'bbg'){
    b.fs = clamp(Math.round((b.fs || 7) * (a === 'bbg' ? 1.13 : 1 / 1.13) * 10) / 10, 2.4, 22);
    if(bel) bel.style.setProperty('--bfs', b.fs);
    queueSave(page.id); deckOthers(it, page, fig);
    return;
  }
  if(a === 'bnar' || a === 'bwid'){
    const left = b.x - b.w / 2;
    b.w = clamp(Math.round((b.w + (a === 'bwid' ? 8 : -8)) * 10) / 10, BLK_MIN, 100);
    b.x = Math.round((left + b.w / 2) * 10) / 10;
    if(bel){ bel.style.width = b.w + '%'; bel.style.left = b.x + '%'; }
    queueSave(page.id); deckOthers(it, page, fig);
    return;
  }
  if(a === 'alL' || a === 'alC' || a === 'alR'){
    b.al = a === 'alL' ? 'left' : a === 'alR' ? 'right' : 'center';
    return save();
  }
  if(a === 'bmid'){ b.x = 50; b.y = 50; return save(); }
  if(a === 'brm'){
    if(b.rec && !confirm('Take "' + entryName(b.rec) + '" off this card? Its file goes with it.')) return;
    const arr = blocksOf(c, blkSide(c, b));
    arr.splice(arr.indexOf(b), 1);
    if(b.rec) mediaIds(b.rec).forEach(dropMedia);
    SELB = null; SND.pluck();
    return save();
  }
  if(a === 'math'){
    const t = bel && bel.querySelector('.dtxt');
    if(!t) return;
    if(document.activeElement !== t){ unmathify(t); t.focus(); }
    insertMath(fig, t, it, page, v => { b.html = v; });
  }
}
/* ---- wiring one view of a deck (the page one and the scope one are the same) ---- */
function wireDeck(fig, it, page){
  const scoped = fig.classList.contains('scoped');
  const item = fig.closest('.item');
  const mine = () => { if(item) select(it.id); };
  fig.addEventListener('pointerdown', e => {
    if(e.target.closest('button')){
      e.stopPropagation(); e.preventDefault();       // as on any toolbar: keep the text selection alive
      mine();
      return;
    }
    if(DECK_EDIT.has(it.id)){
      const blkEl = e.target.closest('.dblk');
      if(blkEl){
        e.stopPropagation(); mine();
        const c = cardOfEl(it, blkEl), b = c && blkOf(c, blkEl.dataset.b);
        if(!b) return;
        if(SELB !== b.id) selectBlock(it, b.id);
        if(e.target.closest('.dbh')) startBlkResize(e, it, page, fig, blkEl, b);
        else startBlkDrag(e, it, page, fig, blkEl, b);
        return;
      }
      if(e.target.closest('.dbody')){                // the bare card: nothing is picked out
        e.stopPropagation(); mine();
        if(SELB) selectBlock(it, null);
        return;
      }
    }
    if(e.target.closest('.dopt,.dm,.dfile,.dvid,.dstats,[contenteditable="true"]')){
      e.stopPropagation();                           // a tap on the chrome never drags the deck
      mine();
      return;
    }
    const card = e.target.closest('.dcard');
    if(!card) return;
    if(scoped) e.stopPropagation();
    if(scoped && !DECK_EDIT.has(it.id)){             // in the scope, a card can be thrown
      scopeThrow(e, card, it, page);
      return;
    }
    const sx = e.clientX, sy = e.clientY, pid = e.pointerId;
    const up = ev => {                               // a tap turns the card, a drag moves the deck
      window.removeEventListener('pointerup', up, true);
      window.removeEventListener('pointercancel', up, true);
      if(ev.type !== 'pointerup' || ev.pointerId !== pid) return;
      if(Math.hypot(ev.clientX - sx, ev.clientY - sy) > 5) return;
      deckFlip(it, page);
    };
    window.addEventListener('pointerup', up, true);
    window.addEventListener('pointercancel', up, true);
  });
  fig.addEventListener('click', e => {
    const b = e.target.closest('[data-a]');
    if(b && fig.contains(b)){ e.stopPropagation(); e.preventDefault(); deckAct(b.dataset.a, it, page, b); return; }
    const jump = e.target.closest('.dsc');
    if(jump){ e.stopPropagation(); deckJump(it, page, +jump.dataset.go); return; }
    const opt = e.target.closest('.dopt');
    if(opt){ e.stopPropagation(); deckOpt(it, page, opt); return; }
    const file = e.target.closest('.dfile');
    if(file && !DECK_EDIT.has(it.id)){
      e.stopPropagation();
      const rec = deckRec(it, file.dataset.rec);
      if(rec) openAttachment(rec);
    }
  });
  /* editing: the source shows while you write, the maths compiles when you leave */
  fig.addEventListener('focusin', e => {
    const t = e.target;
    if(!t.classList) return;
    if(t.classList.contains('dtxt') || t.classList.contains('dot')){
      unmathify(t);
      if(item) item.classList.add('editing');
    }
  });
  fig.addEventListener('focusout', e => {
    const t = e.target, c = cardOfEl(it, t);
    if(!t.classList || !c) return;
    if(item) item.classList.remove('editing');
    if(t.classList.contains('dtxt')){
      const blkEl = t.closest('.dblk'), b = blkEl && blkOf(c, blkEl.dataset.b);
      if(!b) return;
      b.html = sanitize(t.innerHTML);
      t.innerHTML = b.html; mathify(t);
      queueSave(page.id); deckOthers(it, page, fig);
    }else if(t.classList.contains('dot')){
      const li = t.closest('.dopt'), blk = mcOf(c);
      if(li && blk && blk.opts[+li.dataset.o]){
        blk.opts[+li.dataset.o].t = sanitize(t.innerHTML);
        mathify(t); queueSave(page.id); deckOthers(it, page, fig);
      }
    }
  });
  fig.addEventListener('input', e => {
    const t = e.target, c = cardOfEl(it, t);
    if(!t.classList || !c) return;
    if(t.classList.contains('dtxt')){
      const blkEl = t.closest('.dblk'), b = blkEl && blkOf(c, blkEl.dataset.b);
      if(b){ b.html = sanitize(t.innerHTML); queueSave(page.id); SND.scratch(); }
    }else if(t.classList.contains('dot')){
      const li = t.closest('.dopt'), blk = mcOf(c);
      if(li && blk && blk.opts[+li.dataset.o]){
        blk.opts[+li.dataset.o].t = sanitize(t.innerHTML); queueSave(page.id);
      }
    }
  });
  fig.addEventListener('dragover', e => {
    if(!DECK_EDIT.has(it.id)) return;
    e.preventDefault(); e.stopPropagation();
    fig.classList.add('dover');
  });
  fig.addEventListener('dragleave', e => { if(e.target === fig) fig.classList.remove('dover'); });
  fig.addEventListener('drop', e => {
    if(!DECK_EDIT.has(it.id)) return;
    e.preventDefault(); e.stopPropagation();
    fig.classList.remove('dover');
    dropOnCard(it, page, [...(e.dataTransfer.files || [])]);
  });
}

/* ---- the scope: one card, the whole screen, everything else out of the way ---- */
let SCOPE = null;                                    // {it, page, stats}
function openScope(it, page, stats){
  SCOPE = { it, page: page || sheet(), stats: !!stats };
  const v = $('#scope');
  v.innerHTML = '<div class="swrap">' + deckShell('scope') +
    '<div class="shint">space turns the card · ← → walks the deck · ' +
    '1–9 answers · r / w marks · esc closes</div></div>';
  v.classList.add('on');
  const fig = v.querySelector('.deck');
  fig.querySelector('.dnm').textContent = it.cap || 'Flip cards';
  renderDeck(fig, it, SCOPE.page);
  wireDeck(fig, it, SCOPE.page);
  scopeScale();
  SND.flip();
  return true;
}
function closeScope(){
  if(!SCOPE) return false;
  const it = SCOPE.it, page = SCOPE.page;
  SCOPE = null;
  const v = $('#scope');
  v.classList.remove('on'); v.innerHTML = '';
  deckAll(it, page);                                 // the page deck catches up with the run
  return true;
}
/* the card's chrome grows with the window, the way the page's does */
function scopeScale(){
  const w = $('#scope .swrap');
  if(!w) return;
  const r = w.getBoundingClientRect();
  w.style.setProperty('--scale', clamp(Math.min(r.width / 620, innerHeight / 700), 0.85, 1.7).toFixed(3));
}
function scopeKey(e){
  const it = SCOPE.it, page = SCOPE.page;
  const k = e.key;
  if(k === 'Escape'){ closeScope(); return; }
  if(k === 'ArrowRight'){ e.preventDefault(); deckGo(it, page, 1); return; }
  if(k === 'ArrowLeft'){ e.preventDefault(); deckGo(it, page, -1); return; }
  if(k === ' ' || k === 'Enter'){ e.preventDefault(); deckFlip(it, page); return; }
  if(e.ctrlKey || e.metaKey || e.altKey) return;
  if(k === 'r' || k === 'R'){ markCard(it, page, 'right'); return; }
  if(k === 'w' || k === 'W'){ markCard(it, page, 'wrong'); return; }
  if(/^[1-9]$/.test(k)){
    const li = document.querySelector('#scope .dopt[data-o="' + (+k - 1) + '"]');
    if(li) deckOpt(it, page, li);
  }
}
$('#scope').addEventListener('pointerdown', e => { if(e.target === e.currentTarget) closeScope(); });
window.addEventListener('resize', scopeScale);

/* ---- decks in print, in the overview and in an exported book ----
   Nothing over there runs, so the card turns on a checkbox instead: click it and
   it flips, with no script anywhere. The exported book wires the arrows up too. */
function deckStatic(it, urls){
  const cards = cardsOf(it);
  const at = clamp(it.i || 0, 0, Math.max(0, cards.length - 1));
  const slots = cards.map((c, n) =>
    '<div class="dslot' + (n === at ? ' on' : '') + '">' +
    '<input type="checkbox" class="dflipbox" id="fc' + esc(c.id) + '">' +
    '<label class="dcard" data-card="' + esc(c.id) + '" for="fc' + esc(c.id) + '">' +
    faceHTML(c, 0, false, urls, false) + faceHTML(c, 1, false, urls, false) + '</label></div>').join('');
  const t = document.createElement('div');
  t.innerHTML = deckShell('static');
  const fig = t.firstChild;
  fig.querySelector('.dpos').textContent = cards.length ? (at + 1) + ' / ' + cards.length : 'empty';
  fig.querySelector('.dprog i').style.width = '0%';
  fig.querySelector('.dstage').innerHTML =
    (cards.length > 1 ? '<div class="dstack"><i></i><i></i></div>' : '') + slots;
  fig.querySelector('.dfoot').innerHTML = cards.length
    ? '<div class="drow"><button data-a="prev">‹</button>' +
      '<span class="dflip">click the card to turn it over</span>' +
      '<button data-a="next">›</button></div>' : '';
  return fig.outerHTML;
}

defineItem('deck', {
  add: { deck: base => ({ ...base, type:'deck', w:54, cap:'', i:0, side:0,
                          cards:[newCard()], queue:null, rot: 0 }) },
  html: (it, c) => c.live ? deckShell('page') : deckStatic(it, c.urls),
  /* in print and in exports the cards are markup rather than a live deck, so
     their writing has to be typeset here */
  mount(el, it, c){ if(!c.live) el.querySelectorAll('.dtxt,.dot').forEach(mathify); },
  parts: it => deckMedia(it),        // a card's picture, video or file is the deck's to keep
  forget: it => DECK_EDIT.delete(it.id),
  after(it, el, page){ deckEdit(it, page, true); deckFocus(it, 0); },
  tools(mk, it, el, page){
    mk('⌖', 'Study — the card takes the whole screen', () => openScope(it, page));
    mk('↻', 'Replay the whole deck', () => deckReplay(it, page, false));
    mk('↻✗', 'Replay only the ones you got wrong', () => deckReplay(it, page, true));
    mk('＋', 'A new card after this one', () => deckAddCard(it, page));
    const eb = mk('✎', 'Write the cards / study them', () => deckEdit(it, page));
    eb.dataset.deckedit = '1';
    if(DECK_EDIT.has(it.id)) eb.style.background = 'var(--accent)';
  },
  wire(el, it, page){
    const fig = el.querySelector('.deck');
    renderDeck(fig, it, page); wireDeck(fig, it, page);
  }
});
onNoteOpen(() => DECK_EDIT.clear());

/* ---- how it looks ---- */
addCSS('deck', `
/* a deck of flip cards: a stack of index cards with the red rule across the head */
.ficon .fcrule{stroke:var(--accent);stroke-width:3}
.ficon .fnum{fill:color-mix(in srgb,var(--ink) 70%,var(--paper));font-family:var(--mono)}
.item:hover .ficon,.item.sel .ficon{transform:translateY(calc(var(--scale)*-2px))}
/* ---------- flip cards ----------
   A deck of index cards: the question on the front, the answer on the back, ruled
   in red across the head the way a real one is. Everything ON a card is measured in
   the card itself — per cent across it for position and width, cqh (hundredths of
   its own height) for type — so one card reads the same taped to the page, zoomed
   in, filling the screen and printed. The chrome around it keeps page units, so the
   buttons stay a comfortable size whatever the card is doing. */
.deck{
  --card:color-mix(in srgb,var(--paper) 68%,#fff);       /* the card stock */
  --card2:color-mix(in srgb,var(--paper) 88%,#fff);      /* the sheets behind it */
  --cink:var(--ink);                                     /* what is written on it */
  --cdim:color-mix(in srgb,var(--ink) 50%,var(--card));  /* labels and hints */
  --cline:color-mix(in srgb,var(--ink) 20%,var(--card)); /* rules and outlines */
  --ctint:color-mix(in srgb,var(--ink) 5%,transparent);  /* a box on the card */
  --cok:#2e7d4f;                                         /* right */
  --cno:#c0432c;                                         /* wrong */
  background:none;padding:0;box-shadow:none}
.deck .dbar{display:flex;align-items:center;gap:calc(var(--scale)*6px);
  padding-bottom:calc(var(--scale)*5px);font-family:var(--mono);
  font-size:calc(var(--scale)*10.5px);letter-spacing:.13em;text-transform:uppercase;color:var(--soft)}
.deck .dnm{flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;
  color:var(--ink);opacity:.9;outline:none;padding:0;font-family:var(--mono);
  font-size:calc(var(--scale)*10.5px);letter-spacing:.13em;text-transform:uppercase}
.deck .dnm:empty::before{content:"flip cards";opacity:.45}
.item.sel .deck .dnm{color:var(--accent2);opacity:1}
.deck .dpos{flex:none;opacity:.75;white-space:nowrap}
.deck .dbar button{flex:none;display:grid;place-items:center;min-width:calc(var(--scale)*21px);
  height:calc(var(--scale)*18px);padding:0 calc(var(--scale)*4px);
  font-family:var(--mono);font-size:calc(var(--scale)*11px);line-height:1;color:var(--ink);opacity:.75;
  border:1px solid var(--cline);border-radius:2px}
.deck .dbar button:hover{opacity:1;color:var(--accent);border-color:var(--accent)}
.deck .dflash{flex:none;color:var(--accent);letter-spacing:.1em;text-transform:none}
.deck .dprog{height:calc(var(--scale)*3px);margin-bottom:calc(var(--scale)*6px);
  background:color-mix(in srgb,var(--ink) 12%,transparent)}
.deck .dprog i{display:block;height:100%;width:0;background:var(--accent2);transition:width .3s}
.dstage{position:relative;aspect-ratio:3/2;perspective:1600px}
.dstack{position:absolute;inset:0}
.dstack i{position:absolute;inset:0;border-radius:calc(var(--scale)*3px);background:var(--card2);
  box-shadow:0 calc(var(--scale)*3px) calc(var(--scale)*9px) rgba(0,0,0,.22),
             inset 0 0 0 1px color-mix(in srgb,var(--ink) 12%,transparent)}
.dstack i:first-child{transform:translate(calc(var(--scale)*6px),calc(var(--scale)*7px)) rotate(1.1deg)}
.dstack i:last-child{transform:translate(calc(var(--scale)*3px),calc(var(--scale)*3px)) rotate(-.7deg)}
.dcard{position:absolute;inset:0;display:block;transform-style:preserve-3d;cursor:pointer;
  transition:transform .55s cubic-bezier(.3,.8,.25,1)}
.dcard.flipped{transform:rotateY(180deg)}
.dcard.inr{animation:dslidein .3s ease-out}
.dcard.inl{animation:dslideinl .3s ease-out}
@keyframes dslidein{from{opacity:.2;transform:translateX(6%) rotate(1.4deg)}}
@keyframes dslideinl{from{opacity:.2;transform:translateX(-6%) rotate(-1.4deg)}}
.dface{position:absolute;inset:0;display:flex;flex-direction:column;overflow:hidden;
  backface-visibility:hidden;-webkit-backface-visibility:hidden;border-radius:calc(var(--scale)*3px);
  background:var(--card);
  box-shadow:0 calc(var(--scale)*9px) calc(var(--scale)*20px) rgba(0,0,0,.3),
             inset 0 0 0 1px color-mix(in srgb,var(--ink) 15%,transparent)}
.dback{transform:rotateY(180deg)}
.dhead{flex:none;display:flex;align-items:center;gap:calc(var(--scale)*8px);
  padding:calc(var(--scale)*6px) calc(var(--scale)*10px) calc(var(--scale)*5px);
  border-bottom:max(1px,calc(var(--scale)*1.5px)) solid color-mix(in srgb,var(--accent) 62%,transparent);
  font-family:var(--mono);font-size:calc(var(--scale)*9.5px);letter-spacing:.2em;
  text-transform:uppercase;color:var(--cdim)}
.dmark{margin-left:auto;letter-spacing:.12em}
.dmark.right{color:var(--cok)}
.dmark.wrong{color:var(--cno)}
/* the board: everything on it is placed by its own middle, so "in the middle of the
   card" is just 50% / 50%, and type is a fraction of the card's height */
.dbody{position:relative;flex:1;min-height:0;overflow:hidden;container-type:size}
.dblk{position:absolute;transform:translate(-50%,-50%);border-radius:calc(var(--scale)*2px)}
.dblk .dtxt{font-family:var(--body);font-size:calc(var(--bfs,7)*1cqh);line-height:1.28;
  color:var(--cink);white-space:pre-wrap;word-break:break-word;outline:none}
.dblk .dtxt:empty::before{content:attr(data-ph);opacity:.3}
.dblk .dmi{display:block;width:100%;height:auto;border-radius:calc(var(--scale)*2px)}
.dblk .dvid{position:relative;aspect-ratio:16/9;background:#000;border-radius:calc(var(--scale)*2px);overflow:hidden}
.dblk .dvid iframe,.dblk .dvid video{position:absolute;inset:0;width:100%;height:100%;border:0}
.dblk .mwrap{aspect-ratio:4/3;border-radius:calc(var(--scale)*2px);
  background:linear-gradient(180deg,color-mix(in srgb,var(--paper) 93%,var(--ink)),color-mix(in srgb,var(--paper) 76%,var(--ink)))}
.dm.dturn canvas.mv{cursor:grab}
.dm.dturn canvas.mv:active{cursor:grabbing}
.dmname{display:flex;gap:1.4cqh;padding-top:.6cqh;font-family:var(--mono);
  font-size:2.6cqh;letter-spacing:.08em;color:var(--cdim)}
.dmname b{font-weight:400;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dmname i{font-style:normal;opacity:.75;margin-left:auto;white-space:nowrap}
.dfile{display:flex;align-items:center;gap:1.8cqh;cursor:pointer;text-align:left}
.dfile .ficon{flex:none;width:34%;min-width:22px}
.dfn{font-family:var(--mono);font-size:3cqh;line-height:1.3;color:var(--cink);overflow-wrap:anywhere}
.dfn i{display:block;font-style:normal;font-size:2.4cqh;letter-spacing:.08em;color:var(--cdim);margin-top:.4cqh}
/* multiple choice */
.dmc{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:1cqh;
  font-family:var(--body);font-size:calc(var(--bfs,5.4)*1cqh)}
.dopt{display:flex;align-items:flex-start;gap:.75em;padding:.5em .7em;text-align:left;line-height:1.25;
  border:1px solid var(--cline);border-radius:.45em;background:var(--ctint);color:var(--cink);cursor:pointer}
.dopt:hover{border-color:var(--accent2);background:color-mix(in srgb,var(--accent2) 9%,transparent)}
.dopt.picked{border-color:var(--accent2);background:color-mix(in srgb,var(--accent2) 17%,transparent)}
.dopt.ok{border-color:var(--cok);background:color-mix(in srgb,var(--cok) 17%,transparent)}
.dopt.no{border-color:var(--cno);background:color-mix(in srgb,var(--cno) 15%,transparent)}
.dopt.isok{border-color:var(--cok)}
.dkey{flex:none;display:grid;place-items:center;width:1.65em;height:1.65em;border-radius:50%;
  border:1px solid currentColor;color:var(--cdim);font-family:var(--mono);font-size:.78em;line-height:1}
.dopt.ok .dkey,.dopt.isok .dkey{color:var(--cok)}
.dopt.no .dkey{color:var(--cno)}
.dedit .dkey{cursor:pointer}
.dot{flex:1;min-width:0;outline:none;overflow-wrap:anywhere}
.dot:empty::before{content:attr(data-ph);opacity:.3}
.dsm{flex:none;width:1.5em;height:1.5em;display:grid;place-items:center;border-radius:2px;
  font-family:var(--mono);font-size:.7em;line-height:1;color:var(--cdim)}
.dsm:hover{background:var(--cno);color:#fff}
.dmcadd{display:flex;align-items:center;gap:1.4cqh;margin-top:1.2cqh}
.dmini{font-family:var(--mono);font-size:2.8cqh;letter-spacing:.08em;text-transform:uppercase;
  padding:.7cqh 1.4cqh;border-radius:2px;color:var(--cink);border:1px solid var(--cline)}
.dmini:hover{border-color:var(--accent);color:var(--accent)}
.dhintline{font-family:var(--mono);font-size:2.4cqh;letter-spacing:.08em;color:var(--cdim)}
/* writing on it: everything can be picked up, sized, and lined up with the rest */
.dedit .dblk{outline:1px dashed transparent;outline-offset:calc(var(--scale)*3px);cursor:move}
.dedit .dblk:hover{outline-color:var(--cline)}
.dedit .dblk.sel{outline:1.5px solid var(--accent2);outline-style:solid}
.dedit .dblk.drag{outline-color:var(--accent)}
.dbh{position:absolute;right:calc(var(--scale)*-6px);bottom:calc(var(--scale)*-6px);
  width:calc(var(--scale)*12px);height:calc(var(--scale)*12px);border-radius:50%;
  background:var(--accent2);border:1.5px solid var(--card);display:none;cursor:ew-resize;z-index:8}
.dedit .dblk.sel .dbh{display:block}
.dg{position:absolute;display:none;background:var(--accent);z-index:9;pointer-events:none;opacity:.9}
.dgv{top:-6%;bottom:-6%;width:1px;margin-left:-.5px}
.dgh{left:-4%;right:-4%;height:1px;margin-top:-.5px}
.dover .dface{outline:2px dashed var(--accent);outline-offset:-5px}
/* the row under the card */
.deck .dfoot{margin-top:calc(var(--scale)*7px)}
.deck .drow{display:flex;align-items:center;gap:calc(var(--scale)*4px);flex-wrap:wrap}
.deck .drow2{margin-top:calc(var(--scale)*4px);padding-top:calc(var(--scale)*4px);
  border-top:1px solid color-mix(in srgb,var(--ink) 12%,transparent)}
.deck .drow button{font-family:var(--mono);font-size:calc(var(--scale)*10px);letter-spacing:.09em;
  text-transform:uppercase;padding:calc(var(--scale)*5px) calc(var(--scale)*8px);border-radius:2px;
  color:var(--ink);opacity:.85;border:1px solid var(--cline)}
.deck .drow button:hover{border-color:var(--accent);color:var(--accent);opacity:1}
.deck .drow button[disabled]{opacity:.3;pointer-events:none}
.deck .dflip{font-family:var(--mono);font-size:calc(var(--scale)*10px);letter-spacing:.09em;
  text-transform:uppercase;color:var(--soft)}
.deck .dgap{flex:1}
.deck .dsep{width:1px;height:calc(var(--scale)*15px);margin:0 calc(var(--scale)*3px);
  background:color-mix(in srgb,var(--ink) 22%,transparent)}
.deck .dlab2{font-family:var(--mono);font-size:calc(var(--scale)*9.5px);letter-spacing:.14em;
  text-transform:uppercase;color:var(--accent2);max-width:14ch;overflow:hidden;
  text-overflow:ellipsis;white-space:nowrap}
.deck .dal{min-width:calc(var(--scale)*24px)}
.deck .drow button.on{border-color:var(--accent);color:var(--accent)}
.deck .dtally{font-family:var(--mono);font-size:calc(var(--scale)*10px);letter-spacing:.09em;
  color:var(--soft);border:0!important;padding-left:calc(var(--scale)*4px)!important}
/* The two marks wear their colours before they are pressed and fill in after —
   written past .drow button and .drow button.on, which would otherwise have them. */
.deck .drow .dok{color:var(--cok)}
.deck .drow .dno{color:var(--cno)}
.deck .drow .dok:hover{border-color:var(--cok);color:var(--cok)}
.deck .drow .dno:hover{border-color:var(--cno);color:var(--cno)}
.deck .drow .dok.on{background:var(--cok);border-color:var(--cok);color:#fff;opacity:1}
.deck .drow .dno.on{background:var(--cno);border-color:var(--cno);color:#fff;opacity:1}
.dnone{position:absolute;inset:0;display:grid;place-content:center;justify-items:center;
  gap:calc(var(--scale)*10px);text-align:center;border:1px dashed var(--line);
  border-radius:calc(var(--scale)*3px);font-family:var(--mono);font-size:calc(var(--scale)*10.5px);
  letter-spacing:.08em;line-height:1.7;color:var(--soft)}
.dnone button{font-family:var(--mono);font-size:calc(var(--scale)*10.5px);letter-spacing:.1em;
  text-transform:uppercase;padding:calc(var(--scale)*6px) calc(var(--scale)*10px);
  border:1px solid var(--accent);border-radius:2px;color:var(--accent)}
/* the scoreboard */
.dstats{position:absolute;inset:0;overflow:auto;padding:calc(var(--scale)*16px) calc(var(--scale)*18px);
  border-radius:calc(var(--scale)*3px);background:var(--card);
  box-shadow:0 calc(var(--scale)*9px) calc(var(--scale)*20px) rgba(0,0,0,.3),
             inset 0 0 0 1px color-mix(in srgb,var(--ink) 15%,transparent)}
.dstitle{font-family:var(--mono);font-size:calc(var(--scale)*9.5px);letter-spacing:.24em;
  text-transform:uppercase;color:var(--cdim)}
.dsnum{font-family:var(--disp);font-weight:700;font-size:calc(var(--scale)*54px);line-height:1;
  color:var(--cink);margin-top:calc(var(--scale)*4px)}
.dsnum em{font-style:normal;font-size:.5em;color:var(--cdim)}
.dslab{font-family:var(--mono);font-size:calc(var(--scale)*10.5px);letter-spacing:.09em;
  color:var(--cdim);margin-top:calc(var(--scale)*4px)}
.dsbar{display:flex;height:calc(var(--scale)*9px);margin:calc(var(--scale)*11px) 0 calc(var(--scale)*7px);
  background:color-mix(in srgb,var(--ink) 12%,transparent);border-radius:calc(var(--scale)*5px);overflow:hidden}
.dsbar i{background:var(--cok);transition:width .3s}
.dsbar u{background:var(--cno);transition:width .3s}
.dsrow{display:flex;gap:calc(var(--scale)*14px);flex-wrap:wrap;font-family:var(--mono);
  font-size:calc(var(--scale)*10.5px);letter-spacing:.07em;color:var(--cdim)}
.dsrow .gd{color:var(--cok)}
.dsrow .bd{color:var(--cno)}
.dsclist{list-style:none;margin:calc(var(--scale)*13px) 0;padding:0;display:flex;flex-direction:column;gap:2px}
.dsc{display:flex;align-items:center;gap:calc(var(--scale)*8px);cursor:pointer;border-radius:2px;
  padding:calc(var(--scale)*4px) calc(var(--scale)*6px);font-family:var(--mono);
  font-size:calc(var(--scale)*10.5px);color:var(--cink);border-left:calc(var(--scale)*3px) solid transparent}
.dsc:hover{background:color-mix(in srgb,var(--accent2) 13%,transparent)}
.dsc.right{border-left-color:var(--cok)}
.dsc.wrong{border-left-color:var(--cno)}
.dsc.none{opacity:.55}
.dscn{flex:none;width:2.2em;color:var(--cdim)}
.dsct{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dscm{flex:none}
.dsc.right .dscm{color:var(--cok)}
.dsc.wrong .dscm{color:var(--cno)}
.dsacts{display:flex;gap:calc(var(--scale)*6px);flex-wrap:wrap;margin-top:calc(var(--scale)*6px)}
.dsacts button{font-family:var(--mono);font-size:calc(var(--scale)*10.5px);letter-spacing:.09em;
  text-transform:uppercase;padding:calc(var(--scale)*6px) calc(var(--scale)*10px);border-radius:2px;
  color:var(--cink);border:1px solid var(--cline)}
.dsacts button:hover{border-color:var(--accent);color:var(--accent)}
.dsacts button[disabled]{opacity:.32;pointer-events:none}
/* ---------- the scope: one card, the whole screen ---------- */
.scope{position:fixed;inset:0;z-index:95;display:none;place-items:center;padding:18px;
  background:rgba(8,10,12,.86);-webkit-backdrop-filter:blur(4px);backdrop-filter:blur(4px)}
.scope.on{display:grid}
.swrap{--scale:1.25;width:min(940px,94vw,118vh);display:flex;flex-direction:column}
.scope .dbar{color:#a9a49a;gap:calc(var(--scale)*6px);padding-bottom:calc(var(--scale)*6px)}
.scope .dnm{color:#f3f0ea;opacity:.95}
.scope .dbar button{color:#e6e3db;border-color:rgba(255,255,255,.22);
  min-width:calc(var(--scale)*24px);height:calc(var(--scale)*21px);font-size:calc(var(--scale)*11px);opacity:.85}
.scope .dbar button:hover{color:#fff;border-color:var(--accent)}
.scope .dprog{background:rgba(255,255,255,.14)}
.scope .dfoot{margin-top:calc(var(--scale)*15px)}
.scope .drow button{color:#e6e3db;border-color:rgba(255,255,255,.22);
  padding:calc(var(--scale)*6px) calc(var(--scale)*10px)}
.scope .drow button:hover{color:#fff;border-color:var(--accent)}
.scope .drow2{border-top-color:rgba(255,255,255,.14)}
.scope .dsep{background:rgba(255,255,255,.22)}
.scope .dflip,.scope .dtally{color:#a9a49a}
.scope .dstage{aspect-ratio:3/2}
.shint{margin-top:calc(var(--scale)*10px);text-align:center;font-family:var(--mono);
  font-size:calc(var(--scale)*9.5px);letter-spacing:.12em;text-transform:uppercase;color:#8d8880}
/* ---------- a deck in print, in the overview and in an exported book ----------
   Nothing runs over there, so the card turns on a checkbox of its own. */
.deck.static .dslot{position:absolute;inset:0;display:none}
.deck.static .dslot.on{display:block}
.dflipbox{position:absolute;width:0;height:0;opacity:0;pointer-events:none}
.dflipbox:checked ~ .dcard{transform:rotateY(180deg)}
.deck.static .dfoot .drow{justify-content:center}
`);
/* its tile in the palette */
defineTool({ kind:'deck', cat:'write', label:'Flip cards', icon:'deck', order:40,
  hint:'A deck of flip cards — question on the front, answer on the back' });
