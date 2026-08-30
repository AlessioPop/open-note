/* Open Note — items/deck.js
   flip cards — a deck of index cards */

/* ================= flip cards =================
   A deck is one item on the page holding a stack of cards. A card has two sides —
   the question and the answer — and each side is a little board you lay things out
   on: text (LaTeX included), a picture, a video, a model out of Blender, a file, a
   row of multiple choice options, or a whole widget off the palette — a table, a
   plot, a chart, a molecule. Everything on a card can be dragged and sized, and
   snaps to the card's own centre lines and to whatever else is already on it. What
   you got right and wrong is kept per card, so a deck can be replayed — all of it,
   or only the ones you missed — and every finished run is written down, so the
   scoreboard can show how you have been doing over the weeks. ⌖ gives the card
   the whole screen. ⤓ writes the deck out as a file that studies on its own.

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
const HIST_MAX = 400;                              // runs a deck remembers

/* ---- the looks ----
   The card stock. Each is a set of the variables the CSS below is written in —
   the card, what is written on it, the rule across the head, the face — so a
   look is a paragraph of CSS and nothing in the markup. `bg` and `fg` are only
   the colours its chip wears in the picker. */
const DECK_LOOKS = [
  { id:'index',     label:'Index card', hint:'White stock with the red rule across the head',  bg:'#f4f1ea', fg:'#c0432c' },
  { id:'plain',     label:'Plain',      hint:'Clean and quiet — no rule, softer corners',       bg:'#ffffff', fg:'#444444' },
  { id:'lined',     label:'Notebook',   hint:'Ruled right down the card, with the margin',     bg:'#fbfaf4', fg:'#5b8fc9' },
  { id:'kraft',     label:'Kraft',      hint:'Brown card, stitched round the edge',            bg:'#c8a878', fg:'#3b2a17' },
  { id:'sticky',    label:'Sticky',     hint:'A square of yellow paper, in your own hand',     bg:'#f5d94e', fg:'#4a3a05' },
  { id:'chalk',     label:'Chalkboard', hint:'Slate and chalk, framed in wood',                bg:'#2f3b36', fg:'#eef2ea' },
  { id:'blueprint', label:'Blueprint',  hint:'White lines on blue, set in the typewriter face', bg:'#1f4f8b', fg:'#eaf2ff' },
  { id:'night',     label:'Night',      hint:'Dark glass with a glow at the edge',              bg:'#191c22', fg:'#9ec1ff' }
];
const deckLook = it => DECK_LOOKS.some(l => l.id === it.look) ? it.look : 'index';

/* ---- the widgets ----
   What off the palette may go on a card: everything, bar what needs the sheet
   around it. A widget is kept as the very record the page would keep and drawn
   by its own feature through the registry, so the deck never learns what a
   table is — and a feature written next year is on a card the day it registers.
   The exceptions are named by type: a circuit and its wires, a node and its
   graph, a country that clicks to its neighbour, the world they sit on, a slide
   deck's reader, a folder, another deck. The palette's picture, video, model and
   file tiles go through the card's own file dialogs instead. */
const DECK_ON_SHEET = { deck:1, folder:1, circuit:1, logic:1, node:1, country:1, atlas:1, slides:1 };
const CARD_FILES = { image:'pic', video:'vid', model:'mdl', file:'file' };
function deckTakes(kind){
  const e = ADD_KINDS[kind];
  if(!e || DECK_ON_SHEET[e.type]) return false;
  return e.pick ? !!CARD_FILES[e.type] : true;
}
const deckWidgetKinds = () => TOOLS.filter(t => deckTakes(t.kind) && !ADD_KINDS[t.kind].pick)
  .map(t => ({ kind: t.kind, tool: t }));

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
/* everything on a card that owns something in the media store: its pictures,
   videos, models and files, and the widgets, which may own some of their own */
const cardParts = c => allBlocks(c).filter(b => (b.k === 'media' && b.rec) || (b.k === 'item' && b.it))
  .map(b => b.rec || b.it);
const deckMedia = it => cardsOf(it).reduce((a, c) => a.concat(cardMedia(c)), []);
const deckParts = it => cardsOf(it).reduce((a, c) => a.concat(cardParts(c)), []);
const mcOf = c => allBlocks(c).find(b => b.k === 'mc') || null;
const mcMulti = b => !!b && (b.opts || []).filter(o => o.ok).length > 1;
/* a line of a card as a list would show it: no markup, and an equation's
   source without its dollars */
const plain = h => String(h == null ? '' : h).replace(/<[^>]*>/g, ' ').replace(/\$\$([^$]*)\$\$/g, '$1')
  .replace(/\s+/g, ' ').trim();
/* what a card is called in a list: its question, failing that its first option,
   failing that the widget on it */
const cardText = c => {
  const t = plain((c.qb || []).filter(b => b.k === 'text').map(b => b.html).join(' ')) ||
    plain(((mcOf(c) || { opts:[] }).opts[0] || {}).t);
  if(t) return t;
  const w = (c.qb || []).find(b => b.k === 'item' && b.it);
  return w ? entryName(w.it) : '';
};
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
function deckWidget(it, id){
  for(const c of cardsOf(it)) for(const b of allBlocks(c)) if(b.k === 'item' && b.it && b.it.id === id) return b.it;
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
/* ---- the record ----
   A run that reaches its last card is written down: when, how many, how it went,
   and whether it was only the missed ones. A mark changed after the end corrects
   the entry rather than adding another — it is the same sitting. */
function logRun(it){
  const s = deckStats(it);
  if(!s.n || s.left) return false;
  const e = { t: Date.now(), n: s.n, right: s.right, wrong: s.wrong, missed: !!it.queue };
  it.hist = it.hist || [];
  if(it.logged && it.hist.length) it.hist[it.hist.length - 1] = e;
  else { it.hist.push(e); it.logged = true; }
  if(it.hist.length > HIST_MAX) it.hist.splice(0, it.hist.length - HIST_MAX);
  return true;
}
/* everything the scoreboard says, as plain numbers — the same model feeds the
   scope and the exported file, which is why it holds nothing but data */
function deckScore(it){
  const s = deckStats(it), run = deckRun(it);
  const cards = cardsOf(it);
  return {
    name: it.cap || 'Flip cards', missed: !!it.queue,
    n: s.n, right: s.right, wrong: s.wrong, left: s.left, done: s.done, pct: s.pct,
    list: run.map((c, i) => ({ i, t: cardText(c) || 'card ' + (cards.indexOf(c) + 1), res: c.res || '' })),
    hist: (it.hist || []).slice(),
    hard: cards.map((c, i) => ({ i, t: cardText(c) || 'card ' + (i + 1), right: c.right || 0, wrong: c.wrong || 0 }))
      .filter(x => x.wrong).sort((a, b) => b.wrong - a.wrong || a.right - b.right).slice(0, 3)
  };
}

/* ---- the icons: one stroke each, drawn in the button's own ink ---- */
const DICO = {
  stats: 'M4 19h16M7 19v-8M12 19V5M17 19v-5',
  look: 'M12 4 4 8.5l8 4.5 8-4.5L12 4ZM4 15l8 4.5L20 15',
  desk: 'M4 5h16v11H4zM9.5 20h5M12 16v4',
  replay: 'M1 4v6h6M3.51 15a9 9 0 1 0 2.13-9.36L1 10',
  replaywrong: 'M1 4v6h6M3.51 15a9 9 0 1 0 2.13-9.36L1 10M10.5 10.5 15 15M15 10.5l-4.5 4.5',
  study: 'M9 4H4v5M15 4h5v5M4 15v5h5M20 15v5h-5',
  prev: 'M14.5 5.5 8 12l6.5 6.5',
  next: 'M9.5 5.5 16 12l-6.5 6.5',
  flip: 'M23 4v6h-6M20.49 15a9 9 0 1 1-2.12-9.36L23 10',
  check: 'm4.5 12.5 5.5 5.5L19.5 6.5',
  cross: 'M6 6l12 12M18 6 6 18',
  text: 'M5 6V4h14v2M12 4v16M9.5 20h5',
  pic: 'M4 5h16v14H4zm2 10.5 4.5-4.5 3 3 2.5-2.5 4 4M8.75 9.25h.01',
  video: 'M4 6.5h11.5v11H4zM15.5 10.5 20 8v8l-4.5-2.5',
  model: 'M12 3 4.5 7.25v9.5L12 21l7.5-4.25v-9.5L12 3ZM4.5 7.25 12 11.5l7.5-4.25M12 11.5V21',
  file: 'M6.5 3H14l4 4v14H6.5zM14 3v4h4',
  widget: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z',
  mc: 'M3.5 4.5h5v5h-5zM5 7l1.2 1.2 2.3-2.5M3.5 14.5h5v5h-5zM12 7h8.5M12 17h8.5',
  plus: 'M12 5.5v13M5.5 12h13',
  trash: 'M4.5 7h15M9.5 7V4.5h5V7M6.5 7l1 13h9l1-13M10.5 10.5v6M13.5 10.5v6'
};
const ico = n => '<svg class="dico" viewBox="0 0 24 24" aria-hidden="true"><path d="' + DICO[n] + '"/></svg>';

/* ---- the markup: one shell serves the page, the scope, the printed page and the file ---- */
function deckShell(mode, it){
  const btns = mode === 'scope'
    ? '<button data-a="stats" title="The score, and how it has been going">' + ico('stats') + '</button>' +
      '<button data-a="look" title="The card stock">' + ico('look') + '</button>' +
      '<button data-a="export" title="Take it to the desk — a window of its own, or a file">' + ico('desk') + '</button>' +
      '<button data-a="replay" title="Replay the whole deck">' + ico('replay') + '</button>' +
      '<button data-a="replaywrong" title="Replay only the ones you got wrong">' + ico('replaywrong') + '</button>' +
      '<button data-a="close" title="Close (Esc)">' + ico('cross') + '</button>'
    : mode === 'study'
    ? '<button data-a="stats" title="The score (s)">' + ico('stats') + '</button>' +
      '<button data-a="replay" title="Replay the whole deck">' + ico('replay') + '</button>' +
      '<button data-a="replaywrong" title="Replay only the ones you got wrong">' + ico('replaywrong') + '</button>' +
      '<button data-a="close" class="dclose" title="Close this window">' + ico('cross') + '</button>'
    : mode === 'page'
    ? '<button data-a="scope" title="Study — the card takes the whole screen">' + ico('study') + '</button>'
    : '';
  return '<figure class="body deck' + (mode === 'scope' ? ' scoped' : mode === 'study' ? ' scoped study' : mode === 'static' ? ' static' : '') +
    '" data-look="' + (it ? deckLook(it) : 'index') + '"' + (mode === 'study' ? ' data-deck="' + esc(it.id) + '"' : '') + '>' +
    '<div class="dbar">' + (mode === 'page' ? btns : '') +
    /* the deck's name is the item's caption — print and exports fill it the same way */
    (mode === 'scope' || mode === 'study' ? '<span class="dnm"></span>' : '<figcaption class="dnm"></figcaption>') +
    '<span class="dpos"></span>' + (mode === 'scope' || mode === 'study' ? btns : '') + '</div>' +
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
/* a widget: the feature's own markup, wearing the .item its styles are written
   against, inside a box the card can move and size. What goes on inside it —
   the feature's mount and wire — happens once the markup is in the document. */
function widgetHTML(b, live, urls, page){
  const w = b.it;
  if(!w) return '';
  const spec = specOf(w);
  return '<div class="item dwidget" data-id="' + esc(w.id) + '" data-type="' + esc(w.type) + '"' +
    (w.fs ? ' style="--fs:' + (+w.fs || 18) + '"' : '') + '>' +
    (spec.html ? spec.html(w, { live: !!live, urls: urls || MEDIA_URL, page: page || sheet(), idx: index }) : '') +
    '</div>';
}
/* the options, when the card asks a multiple choice question. `reveal` writes
   which are right into the markup — only the exported file wants that, since
   it has no deck to ask. */
function mcHTML(b, c, live, edit, reveal){
  const opts = b.opts || [];
  const answered = live && !edit && (c.pick || []).length && c.res;
  const rows = opts.map((o, i) => {
    const picked = (c.pick || []).indexOf(i) >= 0;
    const cls = edit ? (o.ok ? ' isok' : '')
      : answered ? (o.ok ? ' ok' : picked ? ' no' : '')
      : picked ? ' picked' : '';
    return '<li class="dopt' + cls + '" data-o="' + i + '"' + (reveal && o.ok ? ' data-ok="1"' : '') + '>' +
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
function blockHTML(b, c, live, urls, edit, side, n, o){
  o = o || {};
  const st = 'left:' + b.x + '%;top:' + b.y + '%;width:' + b.w + '%' +
    (b.fs ? ';--bfs:' + b.fs : '') + (b.al ? ';text-align:' + b.al : '');
  let inner;
  if(b.k === 'text')
    inner = '<div class="dtxt" data-ph="' + (n ? 'more' : side ? 'the answer' : 'the question') + '"' +
      (edit ? ' contenteditable="true"' : '') + '>' + sanitize(b.html) + '</div>';
  else if(b.k === 'media') inner = b.rec ? mediaHTML(b.rec, live, urls) : '';
  else if(b.k === 'item') inner = (edit ? '<i class="dgrip" title="Drag to move it"></i>' : '') + widgetHTML(b, live, urls, o.page);
  else inner = mcHTML(b, c, live, edit, o.reveal);
  return '<div class="dblk k-' + b.k + (edit && SELB === b.id ? ' sel' : '') +
    '" data-b="' + esc(b.id) + '" style="' + st + '">' + inner +
    (edit ? '<i class="dbh" title="Drag to size it"></i>' : '') + '</div>';
}
/* one side of a card. `o.stamps` puts the two rubber stamps on it that a throw
   brings up — the scope and the exported file want them, the page does not. */
function faceHTML(c, side, live, urls, edit, o){
  o = o || {};
  let n = 0;
  return '<div class="dface ' + (side ? 'dback' : 'dfront') + '">' +
    '<div class="dhead"><span class="dlab">' + (side ? 'answer' : 'question') + '</span>' +
    (c.res ? '<span class="dmark ' + c.res + '">' + (c.res === 'right' ? '✓ right' : '✗ wrong') + '</span>' : '') +
    '</div><div class="dbody">' +
    blocksOf(c, side).map(b => blockHTML(b, c, live, urls, edit, side, b.k === 'text' ? n++ : 0, o)).join('') +
    (edit ? '<i class="dg dgv"></i><i class="dg dgh"></i>' : '') +
    '</div>' +
    (o.stamps ? '<div class="dstamp no"><b>✗</b>wrong</div><div class="dstamp ok"><b>✓</b>right</div>' : '') +
    '</div>';
}
function cardHTML(c, live, urls, edit, flipped, o){
  return '<div class="dcard' + (flipped ? ' flipped' : '') + '" data-card="' + esc(c.id) + '">' +
    faceHTML(c, 0, live, urls, edit, o) + faceHTML(c, 1, live, urls, edit, o) + '</div>';
}
/* the row under the card: flipping and marking, or the tools to write cards with */
function footHTML(it, edit, big){
  const c = deckAt(it), s = deckStats(it);
  const nav = '<button data-a="prev" title="The card before this one">' + ico('prev') + '</button>' +
    '<button data-a="flip" class="dflip" title="' + (edit ? 'Write the other side' : 'Turn the card over') + '">' +
    ico('flip') + '<span class="dfl">' + (it.side ? 'question' : 'answer') + '</span></button>' +
    '<button data-a="next" title="The next card">' + ico('next') + '</button>';
  if(!edit) return '<div class="drow">' + nav +
    '<span class="dgap"></span>' +
    '<button data-a="wrong" class="dno' + (c && c.res === 'wrong' ? ' on' : '') + '" title="I got this one wrong (w)' + (big ? ' — or throw the card left' : '') + '">' + ico('cross') + (big ? '<span>wrong</span>' : '') + '</button>' +
    '<button data-a="right" class="dok' + (c && c.res === 'right' ? ' on' : '') + '" title="I got this one right (r)' + (big ? ' — or throw the card right' : '') + '">' + ico('check') + (big ? '<span>right</span>' : '') + '</button>' +
    '<button class="dtally" data-a="stats" title="The score so far">' + s.right + '✓ ' + s.wrong + '✗</button>' +
    '</div>';
  const b = c && SELB ? blkOf(c, SELB) : null;
  return '<div class="drow">' + nav + '<span class="dsep"></span>' +
    '<button data-a="text" title="Another line of text on this side">' + ico('text') + '<span>Text</span></button>' +
    '<button data-a="pic" title="A picture">' + ico('pic') + '</button>' +
    '<button data-a="vid" title="A video">' + ico('video') + '</button>' +
    '<button data-a="mdl" title="A .obj out of Blender — take its .mtl and textures too">' + ico('model') + '</button>' +
    '<button data-a="attach" title="A PDF, or any file">' + ico('file') + '</button>' +
    '<button data-a="widget" title="Anything off the palette — a table, a plot, a chart, a molecule. Or right-click the card where you want it">' + ico('widget') + '</button>' +
    '<button data-a="mc" title="Ask it as a multiple choice question">' + ico('mc') + '</button>' +
    '<button data-a="look" title="The card stock">' + ico('look') + '</button>' +
    '<span class="dgap"></span>' +
    '<button data-a="add" title="A new card after this one">' + ico('plus') + '<span>card</span></button>' +
    '<button data-a="delcard" title="Delete this card">' + ico('trash') + '</button>' +
    '<button data-a="edit" class="on" title="Back to studying">' + ico('check') + '<span>Done</span></button></div>' +
    (b ? '<div class="drow drow2">' +
      '<span class="dlab2">' + esc(b.k === 'text' ? 'text' : b.k === 'mc' ? 'options' : b.k === 'item' ? entryName(b.it || {}) : entryName(b.rec || {})) + '</span>' +
      (b.fs ? '<button data-a="bsm" title="Smaller">A−</button><button data-a="bbg" title="Bigger">A+</button>' : '') +
      (b.k === 'text' || b.k === 'mc' ? '<button data-a="alL" class="dal' + (b.al === 'left' ? ' on' : '') + '" title="Line it up left">L</button>' +
        '<button data-a="alC" class="dal' + (b.al === 'center' ? ' on' : '') + '" title="Centre the writing">C</button>' +
        '<button data-a="alR" class="dal' + (b.al === 'right' ? ' on' : '') + '" title="Line it up right">R</button>' : '') +
      '<button data-a="bnar" title="Narrower">◧−</button><button data-a="bwid" title="Wider">◧+</button>' +
      '<button data-a="bmid" title="Put it in the middle of the card">⌖ middle</button>' +
      (b.k === 'text' ? '<button data-a="math" title="Equation — wraps the selection in $$…$$">∑</button>' : '') +
      '<span class="dgap"></span>' +
      '<button data-a="brm" title="Take it off the card">✕</button></div>' : '');
}
/* A widget is worked exactly as it is on the canvas: pick it out and its own
   toolbar hangs over it — the feature's buttons, built by the same tools()
   call the page uses, plus A−/A+, ⌖ and ✕. The bar drops below the widget
   when the widget sits too near the head of the card to hold it. */
function widgetBar(wel, w, it, page){
  const spec = specOf(w), blkEl = wel.closest('.dblk');
  const bar = document.createElement('div');
  bar.className = 'tools';
  const mk = (label, title, fn, cls) => {
    const btn = document.createElement('button');
    if(cls) btn.className = cls; else btn.textContent = label;
    btn.title = title || '';
    btn.addEventListener('pointerdown', e => { e.stopPropagation(); e.preventDefault(); });
    btn.addEventListener('click', e => { e.stopPropagation(); fn(btn); });
    bar.appendChild(btn); return btn;
  };
  if(sizeable(w)){
    mk('A−', 'Smaller', () => { w.fs = Math.max(9, (w.fs || 18) - 3); wel.style.setProperty('--fs', w.fs); queueSave(page.id); });
    mk('A+', 'Bigger',  () => { w.fs = Math.min(140, (w.fs || 18) + 3); wel.style.setProperty('--fs', w.fs); queueSave(page.id); });
  }
  if(spec.tools) spec.tools(mk, w, wel, page);
  const blk = () => { const c = cardOfEl(it, wel); return c && allBlocks(c).find(x => x.k === 'item' && x.it === w); };
  mk('⌖', 'Put it in the middle of the card', () => {
    const b = blk(); if(!b) return;
    b.x = 50; b.y = 50; queueSave(page.id); deckAll(it, page);
  });
  mk('✕', 'Take it off the card', () => {
    const c = cardOfEl(it, wel), b = blk(); if(!c || !b) return;
    const arr = blocksOf(c, blkSide(c, b));
    arr.splice(arr.indexOf(b), 1);
    mediaIds(w).forEach(dropMedia);
    if(SELB === b.id) SELB = null;
    queueSave(page.id); SND.pluck(); deckAll(it, page);
  });
  if(blkEl && parseFloat(blkEl.style.top) < 26) bar.classList.add('below');
  wel.prepend(bar);
}

/* ---- the scoreboard ----
   How this run went, how the deck has gone over time, and which cards keep
   getting away. A pure function of the score model, on purpose: the exported
   file carries this very function and draws the same board from its own record. */
function deckScoreHTML(m){
  const E = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;' }[c]));
  const R = 2 * Math.PI * 44;
  const okL = m.n ? R * m.right / m.n : 0, noL = m.n ? R * m.wrong / m.n : 0;
  const ring = '<svg class="dsring" viewBox="0 0 100 100"><circle class="trk" cx="50" cy="50" r="44"/>' +
    '<circle class="ok" cx="50" cy="50" r="44" style="stroke-dasharray:' + okL.toFixed(2) + ' ' + R.toFixed(2) + '"/>' +
    '<circle class="no" cx="50" cy="50" r="44" style="stroke-dasharray:' + noL.toFixed(2) + ' ' + R.toFixed(2) +
      ';stroke-dashoffset:' + (-okL).toFixed(2) + '"/>' +
    '<text x="50" y="50" class="pct">' + (m.done ? m.pct + '<tspan>%</tspan>' : '–') + '</text>' +
    '<text x="50" y="66" class="sub">' + (m.done ? m.right + ' of ' + m.done : 'not yet') + '</text></svg>';
  const tiles = '<div class="dstiles">' +
    '<div class="dstile gd"><b>' + m.right + '</b><span>right</span></div>' +
    '<div class="dstile bd"><b>' + m.wrong + '</b><span>wrong</span></div>' +
    '<div class="dstile"><b>' + m.left + '</b><span>to go</span></div></div>';
  const word = !m.done ? 'Nothing marked yet — turn a card and say how you did.'
    : m.left ? m.pct + '% right so far, ' + m.left + ' card' + (m.left === 1 ? '' : 's') + ' still to go.'
    : m.pct === 100 ? 'Every one of them. Clean sheet.'
    : m.pct >= 80 ? 'Nearly there — replay the ' + m.wrong + ' you missed.'
    : m.pct >= 50 ? 'Half way to knowing them. Again?'
    : 'A hard deck. Replay the missed ones until they stick.';
  /* the record: one bar a run, the last thirty, the newest on the right */
  const H = m.hist || [], hs = H.slice(-30);
  const pc = e => e.n ? Math.round(e.right / e.n * 100) : 0;
  const day = t => { const d = new Date(t); return d.getDate() + ' ' + 'Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec'.split(' ')[d.getMonth()] + (d.getFullYear() !== new Date().getFullYear() ? ' ' + d.getFullYear() : ''); };
  let hist;
  if(!H.length) hist = '<div class="dsempty">No finished runs yet. Get to the last card and this fills in.</div>';
  else {
    const W = 300, Hh = 72, gap = 3, bw = Math.max(2, (W - gap * (hs.length - 1)) / hs.length);
    const avg = Math.round(H.reduce((a, e) => a + pc(e), 0) / H.length);
    const bars = hs.map((e, i) => {
      const p = pc(e), h = Math.max(1.5, Hh * p / 100), x = i * (bw + gap);
      return '<rect class="' + (e.missed ? 'missed' : '') + (i === hs.length - 1 ? ' last' : '') + '" x="' + x.toFixed(1) +
        '" y="' + (Hh - h).toFixed(1) + '" width="' + bw.toFixed(1) + '" height="' + h.toFixed(1) + '" rx="1.5">' +
        '<title>' + E(day(e.t)) + ' · ' + e.right + ' / ' + e.n + ' · ' + p + '%' + (e.missed ? ' · the missed ones' : '') + '</title></rect>';
    }).join('');
    const ay = Hh - Hh * avg / 100;
    const best = Math.max(...H.map(pc));
    const last5 = H.slice(-5), prev5 = H.slice(-10, -5);
    const mean = a => a.length ? a.reduce((x, e) => x + pc(e), 0) / a.length : null;
    const tr = prev5.length ? Math.round(mean(last5) - mean(prev5)) : null;
    let streak = 0;
    for(let i = H.length - 1; i >= 0 && pc(H[i]) === 100; i--) streak++;
    hist = '<svg class="dshist" viewBox="0 0 ' + W + ' ' + Hh + '" preserveAspectRatio="none">' + bars +
      '<line class="avg" x1="0" x2="' + W + '" y1="' + ay.toFixed(1) + '" y2="' + ay.toFixed(1) + '"/></svg>' +
      '<div class="dsaxis"><span>' + E(day(hs[0].t)) + '</span><span>' + (hs.length > 1 ? E(day(hs[hs.length - 1].t)) : '') + '</span></div>' +
      '<div class="dsfacts">' +
      '<span><b>' + H.length + '</b> run' + (H.length === 1 ? '' : 's') + '</span>' +
      '<span>best <b>' + best + '%</b></span>' +
      '<span>average <b>' + avg + '%</b></span>' +
      (tr != null ? '<span class="' + (tr > 0 ? 'up' : tr < 0 ? 'down' : '') + '">last five <b>' + (tr > 0 ? '↑ +' : tr < 0 ? '↓ ' : '→ ') + tr + '</b></span>' : '') +
      (streak > 1 ? '<span class="up"><b>' + streak + '</b> clean in a row</span>' : '') +
      '</div>';
  }
  const hard = (m.hard || []).length
    ? '<div class="dssec">Keeps getting away</div><ul class="dshard">' + m.hard.map(h =>
        '<li data-go="' + h.i + '"><span class="dscn">' + (h.i + 1) + '</span><span class="dsct">' + E(h.t.length > 56 ? h.t.slice(0, 55) + '…' : h.t) +
        '</span><span class="dscm"><i class="bd">' + h.wrong + '✗</i> <i class="gd">' + h.right + '✓</i></span></li>').join('') + '</ul>'
    : '';
  const list = (m.list || []).map(c =>
    '<li class="dsc ' + (c.res || 'none') + '" data-go="' + c.i + '">' +
    '<span class="dscn">' + (c.i + 1) + '</span><span class="dsct">' +
    E(c.t.length > 64 ? c.t.slice(0, 63) + '…' : c.t) + '</span>' +
    '<span class="dscm">' + (c.res === 'right' ? '✓' : c.res === 'wrong' ? '✗' : '–') + '</span></li>').join('');
  return '<div class="dstats">' +
    '<div class="dshead"><span class="dstitle">Score</span><span class="dsname">' + E(m.name) + (m.missed ? ' · the missed ones' : '') + '</span></div>' +
    '<div class="dstop">' + ring + tiles + '</div>' +
    '<div class="dslab">' + word + '</div>' +
    '<div class="dssec">Over time</div>' + hist + hard +
    '<div class="dssec">This run</div><ul class="dsclist">' + list + '</ul>' +
    '<div class="dsacts"><button data-a="replay">↻ Replay all ' + (m.missed ? '' : m.n) + '</button>' +
    '<button data-a="replaywrong"' + (m.wrong ? '' : ' disabled') + '>↻✗ Replay the ' + m.wrong + ' missed</button>' +
    '<button data-a="hidestats">Back to the cards</button></div></div>';
}
const statsHTML = it => deckScoreHTML(deckScore(it));

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
  fig.dataset.look = deckLook(it);
  const stage = fig.querySelector('.dstage');
  const oc = stage.querySelector('.dcard');
  if(oc){ oc._gone = true; if(oc._throwStop) oc._throwStop(); }
  stage.style.removeProperty('--tr');                // a throw that was under way is over
  if(scoped && SCOPE && SCOPE.stats) stage.innerHTML = statsHTML(it);
  else if(!c) stage.innerHTML = '<div class="dnone">No cards in this deck yet.' +
    '<button data-a="add">Write the first one</button></div>';
  else stage.innerHTML = (run.length > 1 ? '<div class="dstack"><i></i><i></i></div>' : '') +
    (scoped && !edit ? '<span class="dedge no" title="Throw the card left: wrong">‹ ✗</span><span class="dedge ok" title="Throw the card right: right">✓ ›</span>' : '') +
    cardHTML(c, true, MEDIA_URL, edit, !!it.side, { page, stamps: scoped && !edit });
  stage.querySelectorAll('.dtxt,.dot').forEach(richify);
  mountWidgets(stage, it, page, true, MEDIA_URL);
  stage.querySelectorAll('.dbody').forEach(watchBody);
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
  if(foot){
    const edit = DECK_EDIT.has(it.id), c = deckAt(it);
    const html = run.length || edit ? footHTML(it, edit, fig.classList.contains('scoped')) : '';
    const flipb = foot.querySelector('.drow > [data-a="flip"]');
    if(!edit && html && foot._study && flipb){
      /* studying, same shape: patch the words and the lights but keep the
         buttons, so a rapid second tap still lands on a live node */
      const fl = flipb.querySelector('.dfl');
      if(fl) fl.textContent = it.side ? 'question' : 'answer';
      const t = foot.querySelector('.dtally');
      if(t) t.textContent = s.right + '\u2713 ' + s.wrong + '\u2717';
      foot.querySelector('.dok').classList.toggle('on', !!(c && c.res === 'right'));
      foot.querySelector('.dno').classList.toggle('on', !!(c && c.res === 'wrong'));
    }else{
      foot.innerHTML = html;
      foot._study = !edit && !!html;
    }
  }
}
/* A widget is measured in the card like everything else on it: the card's own
   width sets the --scale its feature draws with, so a table on a card grows
   with the card in the scope and shrinks with it on a small deck. A card a
   thousand pixels wide draws at 1, which is what the page does at full size. */
const BODY_RO = typeof ResizeObserver === 'function'
  ? new ResizeObserver(es => es.forEach(e => bodyScale(e.target))) : null;
function bodyScale(body){
  const w = body.clientWidth;
  if(w) body.style.setProperty('--scale', clamp(w / 1000, 0.5, 2.4).toFixed(3));
}
function watchBody(body){
  bodyScale(body);
  if(BODY_RO) BODY_RO.observe(body);
}
/* the feature's own mount and wire, run over every widget in the markup — for
   the page, the scope, print and the file alike; only the live ones are wired */
function mountWidgets(root, it, page, live, urls){
  root.querySelectorAll('.dwidget').forEach(wel => {
    const w = deckWidget(it, wel.dataset.id);
    if(!w) return;
    const spec = specOf(w), ctx = { live: !!live, urls: urls || MEDIA_URL, page: page || sheet(), idx: index };
    const txt = wel.querySelector('.txt');
    if(txt){ txt.innerHTML = sanitize(w.html); richify(txt, ctx.live); }
    const cap = wel.querySelector('figcaption');
    if(cap){ cap.textContent = w.cap || ''; richify(cap, ctx.live); }
    if(spec.mount) spec.mount(wel, w, ctx);
    if(!live) return;
    /* writing inside it works as it does on the page: double-click opens the
       source, leaving compiles it. The widget keeps its text; the deck is saved. */
    if(txt){
      wel.addEventListener('dblclick', e => { e.stopPropagation(); startEdit(wel, txt); });
      txt.addEventListener('blur', () => {
        wel.classList.remove('editing'); txt.contentEditable = 'false';
        w.html = sanitize(txt.innerHTML);
        txt.innerHTML = w.html; richify(txt);
        queueSave(ctx.page.id);
      });
      txt.addEventListener('input', () => { w.html = sanitize(txt.innerHTML); queueSave(ctx.page.id); SND.scratch(); });
    }
    if(cap){
      cap.contentEditable = 'true';
      cap.addEventListener('pointerdown', e => e.stopPropagation());
      cap.addEventListener('focus', () => plainify(cap));
      cap.addEventListener('input', () => { w.cap = cap.textContent; queueSave(ctx.page.id); });
      cap.addEventListener('blur', () => { cap.textContent = w.cap || ''; richify(cap); });
    }
    if(spec.wire) spec.wire(wel, w, ctx.page);
    if(DECK_EDIT.has(it.id)) widgetBar(wel, w, it, ctx.page);
  });
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
  if(document.activeElement !== ed){ plainify(ed); ed.focus(); }
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
    queueSave(page.id); deckAll(it, page);          // a widget wants drawing again at its new width
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
   the line steps up and makes way for it. Or, with `at`, exactly where the card
   was clicked — that is where the right-click palette puts things. */
function addBlock(it, page, side, b, at){
  const c = deckAt(it);
  if(!c) return null;
  const arr = blocksOf(c, side);
  if(at){
    b.x = clamp(Math.round(at.x * 10) / 10, 4, 96); b.y = clamp(Math.round(at.y * 10) / 10, 4, 96);
  }else if(arr.length === 1 && arr[0].k === 'text' && Math.abs(arr[0].y - 50) < 8){
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
/* a widget is made the way the palette makes one, then taken off the sheet's
   coordinates: on a card its place is the block's, not its own */
function makeWidget(kind){
  const e = ADD_KINDS[kind];
  if(!e || e.pick) return null;
  const w = e.make({ id: uid(), x: 0, y: 0, rot: 0, z: 1, lay: curLayerId() }, kind);
  if(!w) return null;
  w.type = w.type || e.type;
  delete w.x; delete w.y; delete w.rot; delete w.z; delete w.lay;
  return w;
}
function addWidget(it, page, kind, at, side){
  const w = makeWidget(kind);
  if(!w) return null;
  const wide = /^(table|plot|pie|bars|stack|ptable|nuchart|molecule|feynman|code|atlas)$/.test(kind);
  return addBlock(it, page, side == null ? (it.side ? 1 : 0) : side, newBlk('item', { w: wide ? 78 : 46, it: w }), at);
}
/* The palette is the picker: right-click the card, or Widget on the tray, and
   the same panel the sheet uses opens saying "onto the card", with what cannot
   go on one dimmed. The pick lands where the card was clicked. */
function cardCtx(it, page, at, side){
  return { page, into: 'the card', accept: deckTakes,
           take: kind => deckTake(it, page, kind, at, side) };
}
function deckTake(it, page, kind, at, side){
  if(!deckTakes(kind)){
    const f = deckViews(it)[0];
    if(f) deckFlash(f, 'that stays on the sheet');
    return true;                                     // taken, in that the sheet does not get it either
  }
  const e = ADD_KINDS[kind];
  if(side != null) it.side = side;
  if(e.pick){ cardWants(it, page, CARD_FILES[e.type], at); return true; }
  addWidget(it, page, kind, at, side);
  return true;
}
function deckPalette(it, page, anchor){
  const r = anchor.getBoundingClientRect();
  openQuickMenu(r.left, r.top, cardCtx(it, page, null, it.side ? 1 : 0), true, r.left + r.width / 2, r.top);
}
/* the picker for the card stock */
function pickLook(anchor, it, page){
  openProps(anchor, {
    title: 'Card stock',
    rows: [{ t: 'pick', label: '', opts: DECK_LOOKS.map(l => ({ v: l.id, label: l.label, hint: l.hint, bg: l.bg, fg: l.fg })),
             get: () => deckLook(it),
             pick: v => { it.look = v; queueSave(page.id); SND.card();
                          deckViews(it).forEach(f => { f.dataset.look = deckLook(it); }); } }]
  });
}

/* ---- studying ---- */
/* In the scope a card is graded the way it is thrown: it tracks the hand 1:1,
   and on release the velocity — not the position — decides ✓ right (out to
   the right), ✗ wrong (out to the left), or come back to the middle. While it
   is in the hand the card says which way it is going: the ✓ stamp comes up as it
   goes right, the ✗ as it goes left, and the face tints to match. A tap is still
   just a tap: the card turns over. Grabbing a card that is springing home simply
   takes it back. */
function scopeThrow(e, card, it, page){
  if(card._gone) return;                             // already thrown away: the next card is coming
  if(card._throwStop) card._throwStop();
  card.classList.remove('turning');                  // a turn still running lands flat, now
  const pid = e.pointerId, sx = e.clientX, sy = e.clientY;
  const base = '';                                   // at rest a card is flat, whichever side is up
  const stage = card.parentElement;
  const fl = flickTrack();
  fl.track(e);
  let dragging = false, committed = false, graded = false;
  try{ card.setPointerCapture(pid); }catch(err){}
  const paint = v => {
    if(graded) return;                               // the verdict is in: nothing left to paint
    card._tx = v;
    card.style.transform = 'translateX(' + v + 'px) rotate(' + clamp(v / 24, -9, 9) + 'deg)' + base;
    /* how far towards a verdict, −1 … 1: the stamps and the tint read it */
    stage.style.setProperty('--tr', clamp(v / ((card.offsetWidth || 600) * .38), -1, 1).toFixed(3));
  };
  const sp = spring({ from: card._tx || 0, response: .42, damping: .8, rest: .4, onUpdate: paint,
    onRest: () => {                                  // home again: the card is the CSS's once more
      if(!dragging && !committed && Math.abs(sp.target) < 1){
        card.style.transform = ''; card.style.transition = ''; card._tx = 0;
        stage.style.removeProperty('--tr');
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
      graded = true; sp.stopAt();                    // else the fly-out keeps painting --tr onto the next card
      card.style.transform = ''; card.style.transition = ''; card._tx = 0;
      card._throwStop = null;
      stage.style.removeProperty('--tr');
      markCard(it, page, dir > 0 ? 'right' : 'wrong');
    };
    if(!dir){ sp.to(0, v); return; }                 // not thrown: back it comes, speed and all
    committed = true; card._gone = true;           // grabbing it back now would mark the wrong card
    SND.whoosh();
    if(SPRING_STILL.matches){ grade(); return; }
    sp.set({ damping: 1, response: .38 });
    sp.to(dir * (w + 160), v);                       // out it goes, at the hand's own speed
    setTimeout(grade, 170);                          // …and the next card slides in behind it
  };
  card.addEventListener('pointermove', mv);
  card.addEventListener('pointerup', up);
  card.addEventListener('pointercancel', up);
}
/* the turn: into 3D, turn, and back out to flat the moment it has settled */
function turnCard(card, on){
  if(card.classList.contains('flipped') === !!on) return;
  clearTimeout(card._turn);
  if(SPRING_STILL.matches){ card.classList.toggle('flipped', !!on); return; }
  card.classList.add('turning');
  void card.offsetWidth;                             // the start state has to be laid out first
  card.classList.toggle('flipped', !!on);
  card._turn = setTimeout(() => card.classList.remove('turning'), 580);
}
function deckFlip(it, page){
  if(!deckAt(it)) return;
  it.side = it.side ? 0 : 1;
  SELB = null;
  deckViews(it).forEach(f => {
    const card = f.querySelector('.dcard');
    if(card) turnCard(card, !!it.side);
    f.querySelectorAll('.dblk.sel').forEach(n => n.classList.remove('sel'));
    deckChrome(f, it);
  });
  queueSave(page.id); SND.card();
}
function deckGo(it, page, d){
  const run = deckRun(it);
  if(run.length < 2) return;
  it.i = ((clamp(it.i || 0, 0, run.length - 1) + d) % run.length + run.length) % run.length;
  it.side = 0; SELB = null;
  queueSave(page.id); SND.slide();
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
/* ✓ / ✗ — the tally is kept for good, the result only for this run; the run,
   once it reaches its end, goes into the record */
function markCard(it, page, res, quiet){
  const c = deckAt(it);
  if(!c) return;
  if(c.res !== res){
    if(c.res === 'right') c.right = Math.max(0, (c.right || 0) - 1);
    if(c.res === 'wrong') c.wrong = Math.max(0, (c.wrong || 0) - 1);
    c.res = res;
    if(res === 'right') c.right = (c.right || 0) + 1; else c.wrong = (c.wrong || 0) + 1;
  }
  const s = deckStats(it);
  if(s.left === 0) logRun(it);
  queueSave(page.id);
  if(res === 'right') SND.right(); else SND.wrong();
  if(quiet || s.left === 0 || deckRun(it).length < 2){
    if(s.left === 0){                                // the run is over: into the record, and the score comes up
      if(SCOPE && SCOPE.it === it) SCOPE.stats = true;
      SND.done();
    }
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
  it.i = 0; it.side = 0; it.logged = false;          // a fresh sitting: it gets a line of its own
  if(SCOPE && SCOPE.it === it) SCOPE.stats = false;
  queueSave(page.id); SND.slide(); deckAll(it, page);
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
  if(t && t.isContentEditable){ plainify(t); t.focus(); }
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
  const parts = cardParts(c);
  if(parts.length && !confirm('Delete this card and the ' + parts.length +
     ' thing' + (parts.length === 1 ? '' : 's') + ' on it?')) return;
  parts.forEach(r => mediaIds(r).forEach(dropMedia));
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
function cardWants(it, page, what, at){
  const c = deckAt(it);
  if(!c) return;
  cardTarget = { it, page, cardId: c.id, side: it.side ? 1 : 0, at: at || null };
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
  addBlock(t.it, t.page, t.side, newBlk('media', { w: rec.type === 'file' ? 32 : 56, rec }), t.at);
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
  if(a === 'look') return pickLook(el, it, page);
  if(a === 'widget') return deckPalette(it, page, el);
  if(a === 'export') return deskMenu(el, it, page);
  if(a === 'desk') return void deckDesk(it, page);
  if(a === 'file') return void deckExport(it, page);
  if(a === 'text')
    return void addBlock(it, page, it.side ? 1 : 0, newBlk('text', { fs:6.4, al:'center', w:74, html:'' }));
  if(a === 'pic' || a === 'vid' || a === 'mdl' || a === 'attach') return cardWants(it, page, a === 'attach' ? 'file' : a);
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
    queueSave(page.id);
    if(b.k === 'item') deckAll(it, page); else deckOthers(it, page, fig);
    return;
  }
  if(a === 'alL' || a === 'alC' || a === 'alR'){
    b.al = a === 'alL' ? 'left' : a === 'alR' ? 'right' : 'center';
    return save();
  }
  if(a === 'bmid'){ b.x = 50; b.y = 50; return save(); }
  if(a === 'brm'){
    const own = b.rec || b.it;
    if(own && b.rec && !confirm('Take "' + entryName(own) + '" off this card? Its file goes with it.')) return;
    const arr = blocksOf(c, blkSide(c, b));
    arr.splice(arr.indexOf(b), 1);
    if(own) mediaIds(own).forEach(dropMedia);
    SELB = null; SND.pluck();
    return save();
  }
  if(a === 'math'){
    const t = bel && bel.querySelector('.dtxt');
    if(!t) return;
    if(document.activeElement !== t){ plainify(t); t.focus(); }
    insertMath(fig, t, it, page, v => { b.html = v; });
  }
}
/* ---- wiring one view of a deck (the page one and the scope one are the same) ---- */
function wireDeck(fig, it, page){
  const scoped = fig.classList.contains('scoped');
  const item = fig.closest('.item');
  const mine = () => { if(item) select(it.id); };
  fig.addEventListener('pointerdown', e => {
    if(e.target.closest('button') && !e.target.closest('.dwidget')){
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
        /* a widget drags like anything else on the card — as on the canvas. A
           surface its feature claims never lets the event get this far (a cell,
           a legend, a plot being panned all stop it), and the play areas — a
           model, a solid, a molecule you turn by hand — are left to it too. */
        else if(b.k === 'item' && playAreas() && e.target.closest(playAreas())) return;
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
    if(e.target.closest('.dwidget')) return;         // the widget's own buttons are its own
    const b = e.target.closest('[data-a]');
    if(b && fig.contains(b)){ e.stopPropagation(); e.preventDefault(); deckAct(b.dataset.a, it, page, b); return; }
    const jump = e.target.closest('[data-go]');
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
      plainify(t);
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
      t.innerHTML = b.html; richify(t);
      queueSave(page.id); deckOthers(it, page, fig);
    }else if(t.classList.contains('dot')){
      const li = t.closest('.dopt'), blk = mcOf(c);
      if(li && blk && blk.opts[+li.dataset.o]){
        blk.opts[+li.dataset.o].t = sanitize(t.innerHTML);
        richify(t); queueSave(page.id); deckOthers(it, page, fig);
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
  /* right-click on the card: the palette, for this spot on this side */
  fig.addEventListener('contextmenu', e => {
    const body = e.target.closest('.dbody');
    if(!body || e.target.closest('.dwidget') || fig.classList.contains('static')) return;
    const c = cardOfEl(it, body);
    if(!c || c !== deckAt(it)) return;
    e.preventDefault(); e.stopPropagation();
    const r = body.getBoundingClientRect();
    const at = { x: (e.clientX - r.left) / r.width * 100, y: (e.clientY - r.top) / r.height * 100 };
    const side = body.closest('.dback') ? 1 : 0;
    if(item) select(it.id);
    openQuickMenu(e.clientX + 4, e.clientY + 4, cardCtx(it, page, at, side));
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
  v.innerHTML = '<div class="swrap">' + deckShell('scope', it) +
    '<div class="shint"><div class="sthrow"><span class="sk no">← throw it left · ✗ wrong</span>' +
    '<span class="sk ok">✓ right · throw it right →</span></div>' +
    'space turns the card · ← → walks the deck · 1–9 answers · r / w marks · s the score · esc closes</div></div>';
  v.classList.add('on');
  const fig = v.querySelector('.deck');
  fig.querySelector('.dnm').textContent = it.cap || 'Flip cards';
  renderDeck(fig, it, SCOPE.page);
  wireDeck(fig, it, SCOPE.page);
  scopeScale();
  SND.card();
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
  if(k === 'Escape'){
    if(PROPS_SPEC) return;                           // the panel takes its own escape
    if(SCOPE.stats){ SCOPE.stats = false; deckAll(it, page); return; }
    closeScope(); return;
  }
  if(k === 'ArrowRight'){ e.preventDefault(); deckGo(it, page, 1); return; }
  if(k === 'ArrowLeft'){ e.preventDefault(); deckGo(it, page, -1); return; }
  if(k === ' ' || k === 'Enter'){ e.preventDefault(); deckFlip(it, page); return; }
  if(e.ctrlKey || e.metaKey || e.altKey) return;
  if(k === 'r' || k === 'R'){ markCard(it, page, 'right'); return; }
  if(k === 'w' || k === 'W'){ markCard(it, page, 'wrong'); return; }
  if(k === 's' || k === 'S'){ SCOPE.stats = !SCOPE.stats; deckAll(it, page); return; }
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
  t.innerHTML = deckShell('static', it);
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

/* ---- the deck as a file of its own ----
   ⤓ writes one .html that studies without the app: every card, both sides, the
   look, the widgets as they print — and the whole of studying: turning, walking,
   throwing, marking, the score with its record, replaying the missed ones. What
   it needs is in the file — the app's stylesheet, the media as data URLs, the
   scoreboard's own renderer — and what it learns it keeps in the browser it is
   opened in, so the results are there next time. Nothing comes back into the
   note: it is a copy, taken to the desk. */
function deckStandalone(it, urls){
  const cards = cardsOf(it);
  const slots = cards.map((c, n) =>
    '<div class="dslot' + (n === 0 ? ' on' : '') + '" data-card="' + esc(c.id) + '">' +
    '<div class="dcard" data-card="' + esc(c.id) + '">' +
    faceHTML(c, 0, false, urls, false, { stamps: true, reveal: true }) +
    faceHTML(c, 1, false, urls, false, { stamps: true, reveal: true }) + '</div></div>').join('');
  const t = document.createElement('div');
  t.innerHTML = deckShell('study', it);
  const fig = t.firstChild;
  fig.querySelector('.dnm').textContent = it.cap || 'Flip cards';
  fig.querySelector('.dpos').textContent = cards.length ? '1 / ' + cards.length : 'empty';
  fig.querySelector('.dstage').innerHTML =
    (cards.length > 1 ? '<div class="dstack"><i></i><i></i></div>' : '') +
    '<span class="dedge no">‹ ✗</span><span class="dedge ok">✓ ›</span>' + slots + '<div class="dscore"></div>';
  fig.querySelector('.dfoot').innerHTML = cards.length ? footHTML({ ...it, i: 0, side: 0, queue: null,
    cards: cards.map(c => ({ ...c, res: null })) }, false, true) : '';
  /* the widgets are drawn as they print, in the holder, before the markup is read */
  const holder = document.createElement('div');
  holder.style.cssText = 'position:fixed;left:-20000px;top:0;width:900px';
  holder.appendChild(fig);
  document.body.appendChild(holder);
  fig.querySelectorAll('.dtxt,.dot').forEach(n => richify(n, false));
  mountWidgets(fig, it, null, false, urls);
  const html = fig.outerHTML;
  holder.remove();
  return html;
}
/* the file's own script: the deck's whole study loop in a hundred lines, over
   the markup the app wrote and the scoreboard the app draws with. Written as
   plain text on purpose — nothing in it may lean on anything in the app. */
const DECK_VIEWER = `(function(){
var D=document.querySelector('.deck'),ID=D.dataset.deck,KEY='open-note-deck:'+ID;
var slots=[].slice.call(D.querySelectorAll('.dslot')),ids=slots.map(function(s){return s.dataset.card;});
var st;try{st=JSON.parse(localStorage.getItem(KEY)||'null');}catch(e){st=null;}
if(!st||!st.res)st={res:{},pick:{},tally:{},hist:[],queue:null,i:0,side:0,logged:false,stats:false};
if(st.queue&&!st.queue.length)st.queue=null;
function save(){try{localStorage.setItem(KEY,JSON.stringify(st));}catch(e){}}
function run(){var q=st.queue?st.queue.filter(function(id){return ids.indexOf(id)>=0;}):[];return q.length?q:ids;}
function cur(){var r=run();st.i=Math.max(0,Math.min(st.i||0,r.length-1));return r[st.i];}
function stats(){var r=run(),ri=0,wr=0;r.forEach(function(id){if(st.res[id]==='right')ri++;else if(st.res[id]==='wrong')wr++;});
  return{n:r.length,right:ri,wrong:wr,done:ri+wr,left:r.length-ri-wr,pct:ri+wr?Math.round(ri/(ri+wr)*100):0};}
function textOf(id){var s=D.querySelector('.dslot[data-card="'+id+'"] .dfront .dbody');if(!s)return '';
  var t=(s.textContent||'').replace(/\\s+/g,' ').trim();return t;}
function model(){var s=stats(),r=run(),cards=ids;
  return{name:D.querySelector('.dnm').textContent,missed:!!st.queue,n:s.n,right:s.right,wrong:s.wrong,left:s.left,done:s.done,pct:s.pct,
    list:r.map(function(id,i){return{i:i,t:textOf(id)||'card '+(cards.indexOf(id)+1),res:st.res[id]||''};}),
    hist:st.hist.slice(),
    hard:cards.map(function(id,i){var t=st.tally[id]||{};return{i:i,t:textOf(id)||'card '+(i+1),right:t.right||0,wrong:t.wrong||0};})
      .filter(function(x){return x.wrong;}).sort(function(a,b){return b.wrong-a.wrong||a.right-b.right;}).slice(0,3)};}
var stage=D.querySelector('.dstage'),score=D.querySelector('.dscore'),pos=D.querySelector('.dpos'),prog=D.querySelector('.dprog i'),foot=D.querySelector('.dfoot');
function show(){var id=cur(),r=run(),s=stats();
  slots.forEach(function(sl){var on=sl.dataset.card===id;sl.className='dslot'+(on?' on':'');
    var c=sl.querySelector('.dcard');c.classList.toggle('flipped',on&&!!st.side);if(!on){c.style.transform='';c.classList.remove('turning');}
    var m=sl.querySelectorAll('.dmark');[].forEach.call(m,function(x){x.remove();});
    var res=st.res[sl.dataset.card];if(res)[].forEach.call(sl.querySelectorAll('.dhead'),function(h){
      var b=document.createElement('span');b.className='dmark '+res;b.textContent=res==='right'?'✓ right':'✗ wrong';h.appendChild(b);});
    var pk=st.pick[sl.dataset.card]||[];[].forEach.call(sl.querySelectorAll('.dopt'),function(o){
      var i=+o.dataset.o,ok=o.dataset.ok==='1',picked=pk.indexOf(i)>=0;
      o.className='dopt'+(res&&pk.length?(ok?' ok':picked?' no':''):picked?' picked':'');});});
  pos.textContent=r.length?(st.i+1)+' / '+r.length+(st.queue?' · missed':''):'empty';
  prog.style.width=(r.length?s.done/r.length*100:0)+'%';
  var ok=foot.querySelector('.dok'),no=foot.querySelector('.dno'),ta=foot.querySelector('.dtally'),fl=foot.querySelector('.dflip');
  if(ok)ok.classList.toggle('on',st.res[id]==='right');if(no)no.classList.toggle('on',st.res[id]==='wrong');
  if(ta)ta.textContent=s.right+'✓ '+s.wrong+'✗';if(fl){var fsp=fl.querySelector('.dfl');if(fsp)fsp.textContent=st.side?'question':'answer';}
  score.innerHTML=st.stats?deckScoreHTML(model()):'';score.classList.toggle('on',!!st.stats);
  stage.style.removeProperty('--tr');
  [].forEach.call(stage.querySelectorAll('.dbody'),function(b){var w=b.clientWidth;if(w)b.style.setProperty('--scale',Math.max(.5,Math.min(2.4,w/1000)).toFixed(3));});
  save();}
function flip(){if(!ids.length)return;var c=D.querySelector('.dslot.on .dcard');
  if(c&&!matchMedia('(prefers-reduced-motion: reduce)').matches){clearTimeout(c._t);c.classList.add('turning');void c.offsetWidth;c._t=setTimeout(function(){c.classList.remove('turning');},580);}
  st.side=st.side?0:1;show();}
function go(d){var r=run();if(r.length<2)return;st.i=((st.i+d)%r.length+r.length)%r.length;st.side=0;show();
  var c=D.querySelector('.dslot.on .dcard');if(c){c.classList.remove('inr','inl');void c.offsetWidth;c.classList.add(d>0?'inr':'inl');}}
function log(){var s=stats();if(!s.n||s.left)return;var e={t:Date.now(),n:s.n,right:s.right,wrong:s.wrong,missed:!!st.queue};
  if(st.logged&&st.hist.length)st.hist[st.hist.length-1]=e;else{st.hist.push(e);st.logged=true;}if(st.hist.length>400)st.hist.splice(0,st.hist.length-400);}
function mark(res,quiet){var id=cur();if(!id)return;var t=st.tally[id]||(st.tally[id]={right:0,wrong:0});
  if(st.res[id]!==res){if(st.res[id]==='right')t.right=Math.max(0,t.right-1);if(st.res[id]==='wrong')t.wrong=Math.max(0,t.wrong-1);
    st.res[id]=res;if(res==='right')t.right++;else t.wrong++;}
  var s=stats();if(!s.left){log();st.stats=true;show();return;}if(quiet||run().length<2){show();return;}go(1);}
function replay(wrongOnly){if(wrongOnly){var q=ids.filter(function(id){return st.res[id]==='wrong';});if(!q.length)return;st.queue=q;}else st.queue=null;
  run().forEach(function(id){delete st.res[id];delete st.pick[id];});st.i=0;st.side=0;st.logged=false;st.stats=false;show();}
function opt(li){var id=cur(),sl=li.closest('.dslot');if(!sl||sl.dataset.card!==id)return;if(st.res[id]&&(st.pick[id]||[]).length)return;
  var opts=[].slice.call(sl.querySelectorAll('.dfront .dopt')),multi=opts.filter(function(o){return o.dataset.ok==='1';}).length>1,i=+li.dataset.o;
  var pk=st.pick[id]=st.pick[id]||[];
  if(multi){var at=pk.indexOf(i);if(at>=0)pk.splice(at,1);else pk.push(i);show();return;}
  st.pick[id]=[i];check();}
function check(){var id=cur(),sl=D.querySelector('.dslot[data-card="'+id+'"]');if(!sl)return;var pk=st.pick[id]||[];if(!pk.length)return;
  var opts=[].slice.call(sl.querySelectorAll('.dfront .dopt'));
  var ok=opts.every(function(o){return (o.dataset.ok==='1')===(pk.indexOf(+o.dataset.o)>=0);});
  mark(ok?'right':'wrong',true);
  var back=sl.querySelector('.dback .dbody'),has=back&&(back.textContent.trim()||back.querySelector('img,video,iframe,.dwidget,.dfile'));
  if(has&&!st.side)setTimeout(function(){if(cur()===id&&!st.side)flip();},650);}
D.addEventListener('click',function(e){var b=e.target.closest('[data-a]');
  if(b){var a=b.dataset.a;if(a==='prev')go(-1);else if(a==='next')go(1);else if(a==='flip')flip();else if(a==='right')mark('right');else if(a==='wrong')mark('wrong');
    else if(a==='check')check();else if(a==='replay')replay(false);else if(a==='replaywrong')replay(true);else if(a==='stats'){st.stats=!st.stats;show();}else if(a==='hidestats'){st.stats=false;show();}else if(a==='close'){window.close();}return;}
  var j=e.target.closest('[data-go]');if(j){st.i=+j.dataset.go;st.side=0;st.stats=false;show();return;}
  var o=e.target.closest('.dopt');if(o){opt(o);return;}});
/* the throw: the card follows the hand; past a third of its width, or fast, it goes */
D.addEventListener('pointerdown',function(e){var card=e.target.closest('.dslot.on .dcard');if(!card||e.target.closest('.dopt,.dfile,.dvid,button'))return;
  if(e.button)return;e.preventDefault();var sx=e.clientX,sy=e.clientY,pid=e.pointerId,drag=false,last=[],w=card.offsetWidth||600;
  try{card.setPointerCapture(pid);}catch(x){}
  var mv=function(ev){if(ev.pointerId!==pid)return;var d=ev.clientX-sx;last.push([performance.now(),ev.clientX]);if(last.length>6)last.shift();
    if(!drag&&Math.abs(d)<6)return;drag=true;card.style.transition='none';
    card.style.transform='translateX('+d+'px) rotate('+Math.max(-9,Math.min(9,d/24))+'deg)';
    stage.style.setProperty('--tr',Math.max(-1,Math.min(1,d/(w*.38))).toFixed(3));};
  var up=function(ev){if(ev.pointerId!==pid)return;card.removeEventListener('pointermove',mv);card.removeEventListener('pointerup',up);card.removeEventListener('pointercancel',up);
    if(!drag){if(ev.type==='pointerup'&&Math.hypot(ev.clientX-sx,ev.clientY-sy)<=5)flip();return;}
    var d=ev.clientX-sx,v=0;if(last.length>1){var a=last[0],b=last[last.length-1];v=(b[1]-a[1])/((b[0]-a[0])||1)*1000;}
    var dir=Math.abs(v)>450?(v>0?1:-1):Math.abs(d)>w*.35?(d>0?1:-1):0;
    card.style.transition='transform .28s cubic-bezier(.2,.8,.3,1)';
    if(!dir){card.style.transform='';stage.style.removeProperty('--tr');setTimeout(function(){card.style.transition='';},300);return;}
    card.style.transform='translateX('+dir*(w+160)+'px) rotate('+dir*9+'deg)';
    setTimeout(function(){card.style.transition='';card.style.transform='';stage.style.removeProperty('--tr');mark(dir>0?'right':'wrong');},170);};
  card.addEventListener('pointermove',mv);card.addEventListener('pointerup',up);card.addEventListener('pointercancel',up);});
window.addEventListener('keydown',function(e){var k=e.key;if(e.ctrlKey||e.metaKey||e.altKey)return;
  if(k==='ArrowRight'){e.preventDefault();go(1);}else if(k==='ArrowLeft'){e.preventDefault();go(-1);}
  else if(k===' '||k==='Enter'){e.preventDefault();flip();}else if(k==='r'||k==='R')mark('right');else if(k==='w'||k==='W')mark('wrong');
  else if(k==='s'||k==='S'){st.stats=!st.stats;show();}else if(k==='Escape'&&st.stats){st.stats=false;show();}
  else if(/^[1-9]$/.test(k)){var li=D.querySelector('.dslot.on .dfront .dopt[data-o="'+(+k-1)+'"]');if(li)opt(li);}});
function fit(){var w=document.querySelector('.swrap');if(!w)return;var r=w.getBoundingClientRect();
  w.style.setProperty('--scale',Math.max(.85,Math.min(1.7,Math.min(r.width/620,innerHeight/700))).toFixed(3));
  [].forEach.call(stage.querySelectorAll('.dbody'),function(b){var x=b.clientWidth;if(x)b.style.setProperty('--scale',Math.max(.5,Math.min(2.4,x/1000)).toFixed(3));});}
window.addEventListener('resize',fit);fit();show();
})();`;
/* the whole file, as text — a function of the deck and nothing else, so the
   harness can read it without a download */
function deckExportHTML(it, urls){
  const css = document.getElementById('appcss').textContent;
  const s = index.settings || {};
  const inline = ['paper', 'ink', 'line', 'accent', 'accent2', 'desk']
    .filter(v => s[v]).map(v => '--' + v + ':' + s[v]).join(';');
  const title = it.cap || 'Flip cards';
  const viewerCss =
    'html,body{height:100%}body{margin:0;overflow:hidden;background:#101214}' +
    '.scope{position:fixed;inset:0;display:grid;overflow:auto}' +
    '.shint{padding-bottom:18px}' +
    '@media print{.scope{position:static;background:#fff}.dfoot,.shint,.dedge,.dstamp{display:none}}';
  return '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">' +
    '<title>' + esc(title) + ' — flip cards</title>' +
    '<link href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@600;700&family=Caveat:wght@500;600;700&family=IBM+Plex+Mono:wght@400;500&family=Newsreader:ital,opsz,wght@0,6..72,400;0,6..72,600;1,6..72,400&display=swap" rel="stylesheet">' +
    '<style>' + css + viewerCss + '</style></head>' +
    '<body data-theme="' + esc(index.theme || 'graph') + '"' + (inline ? ' style="' + inline + '"' : '') + '>' +
    '<div class="scope on"><div class="swrap">' + deckStandalone(it, urls) +
    '<div class="shint"><div class="sthrow"><span class="sk no">← throw it left · ✗ wrong</span>' +
    '<span class="sk ok">✓ right · throw it right →</span></div>' +
    'space turns the card · ← → walks the deck · 1–9 answers · r / w marks · s the score</div></div></div>' +
    '<scr' + 'ipt>var deckScoreHTML=' + deckScoreHTML.toString() + ';\n' + DECK_VIEWER + '</scr' + 'ipt></body></html>';
}
/* the document, with everything the cards hold inside it — as the book export
   does it: a picture is already in its record, a video rides as a data URL, a
   model as its poster */
async function deckExportDoc(it){
  if(typeof flush === 'function') await flush();
  const urls = {};
  for(const rec of mediaRecords(it)){
    if(!rec.media || specOf(rec).stream === false || urls[rec.media]) continue;
    const b = await mediaGet(rec.media);
    const cap = specOf(rec).exportMaxBytes;
    if(!b || (cap && b.size > cap)) continue;
    urls[rec.media] = await blobToDataURL(b);
  }
  return deckExportHTML(it, urls);
}
async function deckExport(it, page){
  const doc = await deckExportDoc(it);
  const name = ((it.cap || 'flip cards').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'flip-cards') + '.html';
  await plSaveFile(name, new Blob([doc], { type: 'text/html' }));
  const f = deckViews(it)[0];
  if(f) deckFlash(f, 'saved ' + name);
  SND.card();
}
/* ---- the desk card ----
   The deck in a small window of its own, on the desk — not a tab, and not tied
   to this one: close Open Note and it stays. The document is the same one the
   file gets, parked in the app's own store under the deck's id, and desk.html
   is a page of nothing but a loader that reads it back — so the window is the
   app's origin and keeps what it learns in the same place the app keeps its
   notes. In the desktop shell the window is frameless and floats above the
   others (desktop/main.js decides that); in a browser it is a popup window.
   Asking again rewrites the card and the open window reloads to it. */
const deskKey = it => 'desk:' + it.id;
const DESK_FEATURES = 'popup=yes,width=640,height=580,resizable=yes';
async function deckDesk(it, page){
  const doc = await deckExportDoc(it);
  let up;
  if(PLAT.name === 'electron'){
    /* the shell owns the window: the document is parked in the store for
       desk.html to become, which is also what brings the card back at the next
       launch. window.open is answered with null there — the shell took it. */
    await kvSet(deskKey(it), doc);
    window.open('desk.html?id=' + encodeURIComponent(it.id), 'desk-' + it.id, DESK_FEATURES);
    up = true;
  }else{
    /* a browser gets the document written straight into the popup — nothing in
       between, so it works wherever the app itself runs, file:// included,
       where there is no IndexedDB for desk.html to read it back from */
    const w = window.open('', 'desk-' + it.id, DESK_FEATURES);
    if(w){ try{ w.document.open(); w.document.write(doc); w.document.close(); }catch(e){} }
    up = !!w;
  }
  const f = deckViews(it)[0];
  if(f) deckFlash(f, up ? 'on the desk' : 'the window was blocked — allow pop-ups for this page');
  SND.card();
  return up;
}
function deskMenu(anchor, it, page){
  openProps(anchor, {
    title: 'Take it to the desk',
    rows: [
      { t: 'btn', label: '', text: '▣  Put it on the desk',
        hint: 'A small window of its own that stays when Open Note closes', act: () => { closeProps(); deckDesk(it, page); } },
      { t: 'btn', label: '', text: '⤓  Save it as a file',
        hint: 'One .html that studies on its own — for a phone, a stick, anyone', act: () => { closeProps(); deckExport(it, page); } }
    ]
  });
}

defineItem('deck', {
  add: { deck: base => ({ ...base, type:'deck', w:54, cap:'', i:0, side:0, look:'index',
                          cards:[newCard()], queue:null, hist:[], rot: 0 }) },
  html: (it, c) => c.live ? deckShell('page', it) : deckStatic(it, c.urls),
  /* in print and in exports the cards are markup rather than a live deck, so
     their writing has to be typeset here, and their widgets drawn */
  mount(el, it, c){
    if(c.live) return;
    el.querySelectorAll('.dtxt,.dot').forEach(n => richify(n, false));
    mountWidgets(el, it, c.page, false, c.urls);
  },
  parts: it => deckParts(it),        // a card's picture, video, file or widget is the deck's to keep
  forget: it => DECK_EDIT.delete(it.id),
  after(it, el, page){ deckEdit(it, page, true); deckFocus(it, 0); },
  tools(mk, it, el, page){
    mk('⌖', 'Study — the card takes the whole screen', () => openScope(it, page));
    const lk = mk('◑', 'The card stock — eight looks', () => pickLook(lk, it, page));
    mk('↻', 'Replay the whole deck', () => deckReplay(it, page, false));
    mk('↻✗', 'Replay only the ones you got wrong', () => deckReplay(it, page, true));
    mk('＋', 'A new card after this one', () => deckAddCard(it, page));
    const eb = mk('✎', 'Write the cards / study them', () => deckEdit(it, page));
    eb.dataset.deckedit = '1';
    if(DECK_EDIT.has(it.id)) eb.style.background = 'var(--accent)';
    const xb = mk('⤓', 'Take it to the desk — a window of its own, or a file', () => deskMenu(xb, it, page));
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
   buttons stay a comfortable size whatever the card is doing.

   The card stock is a set of variables, and a look is a paragraph that sets them:
   --card the stock, --cink what is written on it, --crule the rule across the head,
   --cface what is printed on the face, --cframe what runs round its edge. */
.deck{
  --card:color-mix(in srgb,var(--paper) 68%,#fff);       /* the card stock */
  --card2:color-mix(in srgb,var(--paper) 88%,#fff);      /* the sheets behind it */
  --cink:var(--ink);                                     /* what is written on it */
  --cdim:color-mix(in srgb,var(--ink) 50%,var(--card));  /* labels and hints */
  --cline:color-mix(in srgb,var(--ink) 20%,var(--card)); /* rules and outlines */
  --ctint:color-mix(in srgb,var(--ink) 5%,transparent);  /* a box on the card */
  --cok:#2e7d4f;                                         /* right */
  --cno:#c0432c;                                         /* wrong */
  --crule:color-mix(in srgb,var(--accent) 62%,transparent);
  --cface:none;--cframe:0 solid transparent;--cfin:0;
  --cfont:var(--body);--crad:calc(var(--scale)*3px);
  --cshadow:0 calc(var(--scale)*9px) calc(var(--scale)*20px) rgba(0,0,0,.3),inset 0 0 0 1px color-mix(in srgb,var(--ink) 15%,transparent);
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
/* one stroke each, in the button's own ink — the whole chrome drawn with one pen */
.deck .dico{width:calc(var(--scale)*12px);height:calc(var(--scale)*12px);flex:none;display:block;
  fill:none;stroke:currentColor;stroke-width:1.9;stroke-linecap:round;stroke-linejoin:round;pointer-events:none}
.deck .drow .dico{width:calc(var(--scale)*13px);height:calc(var(--scale)*13px)}
.deck .drow button{display:inline-flex;align-items:center;justify-content:center;gap:calc(var(--scale)*5px)}
.deck .dbar button:hover{opacity:1;color:var(--accent);border-color:var(--accent)}
.deck .dflash{flex:none;color:var(--accent);letter-spacing:.1em;text-transform:none}
.deck .dprog{height:calc(var(--scale)*3px);margin-bottom:calc(var(--scale)*6px);
  background:color-mix(in srgb,var(--ink) 12%,transparent)}
.deck .dprog i{display:block;height:100%;width:0;background:var(--accent2);transition:width .3s}
.dstage{position:relative;aspect-ratio:3/2;perspective:1600px}
.dstack{position:absolute;inset:0}
.dstack i{position:absolute;inset:0;border-radius:var(--crad);background:var(--card2);
  box-shadow:0 calc(var(--scale)*3px) calc(var(--scale)*9px) rgba(0,0,0,.22),
             inset 0 0 0 1px color-mix(in srgb,var(--ink) 12%,transparent)}
.dstack i:first-child{transform:translate(calc(var(--scale)*6px),calc(var(--scale)*7px)) rotate(1.1deg)}
.dstack i:last-child{transform:translate(calc(var(--scale)*3px),calc(var(--scale)*3px)) rotate(-.7deg)}
/* Flat at rest. A card that lived in a 3D rendering context the whole time —
   preserve-3d, a back face turned 180°, backface-visibility — is composited as
   GPU layers, and type in a layer loses its subpixel hinting and lands on
   fractional pixels: everything on the card reads faintly soft. So at rest a
   card is one face, no transform, no backface rule, and reads like the rest of
   the sheet; the 3D exists only for the half second of a turn (.turning). */
.dcard{position:absolute;inset:0;display:block;cursor:pointer}
.dcard .dback{visibility:hidden}
.dcard.flipped .dfront{visibility:hidden}
.dcard.flipped .dback{visibility:visible}
.dcard.turning{transform-style:preserve-3d;transition:transform .55s cubic-bezier(.3,.8,.25,1)}
.dcard.turning .dface{visibility:visible;backface-visibility:hidden;-webkit-backface-visibility:hidden}
.dcard.turning .dback{transform:rotateY(180deg)}
.dcard.turning.flipped{transform:rotateY(180deg)}
.dcard.inr{animation:dslidein .3s ease-out}
.dcard.inl{animation:dslideinl .3s ease-out}
@keyframes dslidein{from{opacity:.2;transform:translateX(6%) rotate(1.4deg)}}
@keyframes dslideinl{from{opacity:.2;transform:translateX(-6%) rotate(-1.4deg)}}
.dface{position:absolute;inset:0;display:flex;flex-direction:column;overflow:hidden;border-radius:var(--crad);
  background:var(--card);box-shadow:var(--cshadow)}
.dhead{flex:none;display:flex;align-items:center;gap:calc(var(--scale)*8px);
  padding:calc(var(--scale)*6px) calc(var(--scale)*10px) calc(var(--scale)*5px);
  border-bottom:max(1px,calc(var(--scale)*1.5px)) solid var(--crule);
  font-family:var(--mono);font-size:calc(var(--scale)*9.5px);letter-spacing:.2em;
  text-transform:uppercase;color:var(--cdim)}
.dmark{margin-left:auto;letter-spacing:.12em}
.dmark.right{color:var(--cok)}
.dmark.wrong{color:var(--cno)}
/* the board: everything on it is placed by its own middle, so "in the middle of the
   card" is just 50% / 50%, and type is a fraction of the card's height */
.dbody{position:relative;flex:1;min-height:0;overflow:hidden;container-type:size}
/* what the look prints on the face, and what it runs round the edge — both drawn
   in the body so they can be measured in the card (cqw / cqh) like everything else */
.dbody::before{content:"";position:absolute;inset:0;pointer-events:none;background:var(--cface)}
.dbody::after{content:"";position:absolute;inset:var(--cfin);pointer-events:none;border:var(--cframe);border-radius:inherit}
.dblk{position:absolute;transform:translate(-50%,-50%);border-radius:calc(var(--scale)*2px)}
.dblk .dtxt{font-family:var(--cfont);font-size:calc(var(--bfs,7)*1cqh);line-height:1.28;
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
/* a widget on a card: the feature's own .item, made to sit still — the card
   places it, the block sizes it, and its --scale is the card's (see bodyScale) */
.dblk.k-item{text-align:left;cursor:auto}
/* Outside of editing, a widget is part of the picture: every tap on the card —
   widget or not — flips it, every drag throws it. Only edit mode wakes them. */
.deck:not(.dedit) .dblk .dwidget{pointer-events:none}
.dblk .dwidget{position:relative;left:auto;top:auto;width:100%;transform:none;z-index:auto;
  user-select:text;touch-action:auto}
.dblk .dwidget .rot,.dblk .dwidget .rs{display:none}
/* its toolbar, exactly the canvas one, shown while the block is picked out */
.dblk .dwidget > .tools{display:none;left:50%;transform:translateX(-50%);white-space:nowrap}
.dedit .dblk.sel .dwidget > .tools{display:flex}
.dblk .dwidget > .tools.below{bottom:auto;top:100%;margin:calc(var(--scale)*6px) 0 0}
.dedit .dblk.k-item{cursor:auto}
.dgrip{position:absolute;left:50%;top:calc(var(--scale)*-9px);transform:translate(-50%,-100%);
  width:calc(var(--scale)*44px);height:calc(var(--scale)*9px);border-radius:calc(var(--scale)*5px);
  background:var(--accent2);opacity:0;cursor:move;z-index:8;
  box-shadow:0 1px 3px rgba(0,0,0,.35)}
.dgrip::before{content:"";position:absolute;left:50%;top:50%;width:60%;height:1px;transform:translate(-50%,-50%);
  background:rgba(255,255,255,.7);box-shadow:0 calc(var(--scale)*-2.5px) rgba(255,255,255,.7),0 calc(var(--scale)*2.5px) rgba(255,255,255,.7)}
.dedit .dblk.k-item:hover .dgrip,.dedit .dblk.k-item.sel .dgrip{opacity:1}
/* multiple choice */
.dmc{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:1cqh;
  font-family:var(--cfont);font-size:calc(var(--bfs,5.4)*1cqh)}
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
/* ---- the throw ----
   --tr on the stage runs −1 … 1 with the hand: the ✗ stamp and a red wash come
   up as the card goes left, the ✓ and a green one as it goes right, and the two
   gate posts at the edges brighten on the side the card is heading for. */
.dstamp{position:absolute;top:8%;z-index:4;pointer-events:none;opacity:0;
  display:flex;align-items:center;gap:.25em;padding:.1em .45em;border-radius:.18em;
  border:.13em solid currentColor;font-family:var(--disp);font-weight:700;line-height:1;
  font-size:calc(var(--scale)*34px);letter-spacing:.08em;text-transform:uppercase;
  background:color-mix(in srgb,var(--card) 70%,transparent)}
.dstamp b{font-size:1.15em}
.dstamp.ok{right:6%;color:var(--cok);transform:rotate(12deg);opacity:clamp(0,calc(var(--tr,0)*1.5),1)}
.dstamp.no{left:6%;color:var(--cno);transform:rotate(-12deg);opacity:clamp(0,calc(var(--tr,0)*-1.5),1)}
.dface::before,.dface::after{content:"";position:absolute;inset:0;pointer-events:none;border-radius:inherit;z-index:3;opacity:0}
.dface::before{background:color-mix(in srgb,var(--cno) 26%,transparent);opacity:clamp(0,calc(var(--tr,0)*-1.3),1)}
.dface::after{background:color-mix(in srgb,var(--cok) 26%,transparent);opacity:clamp(0,calc(var(--tr,0)*1.3),1)}
.dedge{position:absolute;top:50%;z-index:1;transform:translateY(-50%);pointer-events:none;
  font-family:var(--mono);font-size:calc(var(--scale)*12px);letter-spacing:.1em;white-space:nowrap;
  color:#fff;opacity:.35;transition:opacity .15s}
.dedge.no{left:calc(var(--scale)*-8px);transform:translate(-100%,-50%);color:var(--cno);
  opacity:clamp(.35,calc(.35 + var(--tr,0)*-1),1)}
.dedge.ok{right:calc(var(--scale)*-8px);transform:translate(100%,-50%);color:var(--cok);
  opacity:clamp(.35,calc(.35 + var(--tr,0)*1),1)}
.sthrow{display:flex;justify-content:space-between;margin-bottom:calc(var(--scale)*6px);font-size:calc(var(--scale)*10.5px)}
.shint .sk{display:inline-block;color:#b7b2a8}
.shint .sk.no{color:#e28a78}
.shint .sk.ok{color:#83c79a}
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
/* ---- the scoreboard ----
   Set to be read from across the room: the ring and the three numbers in the
   display face, the sentence under them in the reading face, and every label in
   the card's own ink rather than a wash of it. */
.dstats{position:absolute;inset:0;overflow:auto;padding:calc(var(--scale)*16px) calc(var(--scale)*20px);
  border-radius:var(--crad);background:var(--card);color:var(--cink);box-shadow:var(--cshadow);
  font-family:var(--body);font-size:calc(var(--scale)*13px);line-height:1.4}
.dshead{display:flex;align-items:baseline;gap:calc(var(--scale)*12px);margin-bottom:calc(var(--scale)*8px)}
.dstitle{font-family:var(--mono);font-size:calc(var(--scale)*10px);letter-spacing:.24em;
  text-transform:uppercase;color:var(--cink);opacity:.7}
.dsname{font-family:var(--mono);font-size:calc(var(--scale)*10px);letter-spacing:.1em;color:var(--cdim);
  overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dstop{display:flex;align-items:center;gap:calc(var(--scale)*22px);flex-wrap:wrap}
.dsring{flex:none;width:calc(var(--scale)*118px);height:calc(var(--scale)*118px)}
.dsring circle{fill:none;stroke-width:9;transform:rotate(-90deg);transform-origin:50% 50%;stroke-linecap:butt}
.dsring .trk{stroke:color-mix(in srgb,var(--cink) 13%,transparent)}
.dsring .ok{stroke:var(--cok);transition:stroke-dasharray .4s}
.dsring .no{stroke:var(--cno);transition:stroke-dasharray .4s,stroke-dashoffset .4s}
.dsring .pct{font-family:var(--disp);font-weight:700;font-size:28px;fill:var(--cink);text-anchor:middle;dominant-baseline:central}
.dsring .pct tspan{font-size:14px}
.dsring .sub{font-family:var(--mono);font-size:6.5px;letter-spacing:.14em;text-transform:uppercase;fill:var(--cink);opacity:.6;text-anchor:middle}
.dstiles{display:flex;gap:calc(var(--scale)*8px);flex:1;min-width:calc(var(--scale)*220px)}
.dstile{flex:1;display:flex;flex-direction:column;align-items:center;gap:calc(var(--scale)*2px);
  padding:calc(var(--scale)*10px) calc(var(--scale)*6px);border-radius:calc(var(--scale)*8px);
  background:color-mix(in srgb,var(--cink) 6%,transparent);color:var(--cink)}
.dstile b{font-family:var(--disp);font-weight:700;font-size:calc(var(--scale)*34px);line-height:1}
.dstile span{font-family:var(--mono);font-size:calc(var(--scale)*9.5px);letter-spacing:.16em;text-transform:uppercase;opacity:.7}
.dstile.gd{background:color-mix(in srgb,var(--cok) 14%,transparent);color:var(--cok)}
.dstile.bd{background:color-mix(in srgb,var(--cno) 14%,transparent);color:var(--cno)}
.dslab{margin:calc(var(--scale)*12px) 0 calc(var(--scale)*4px);font-family:var(--body);
  font-size:calc(var(--scale)*14.5px);color:var(--cink)}
.dssec{margin-top:calc(var(--scale)*14px);padding-bottom:calc(var(--scale)*4px);
  border-bottom:1px solid color-mix(in srgb,var(--cink) 14%,transparent);
  font-family:var(--mono);font-size:calc(var(--scale)*9.5px);letter-spacing:.22em;text-transform:uppercase;
  color:var(--cink);opacity:.7}
.dsempty{padding:calc(var(--scale)*10px) 0;color:var(--cdim);font-size:calc(var(--scale)*13px)}
.dshist{display:block;width:100%;height:calc(var(--scale)*72px);margin-top:calc(var(--scale)*10px)}
.dshist rect{fill:var(--cok);opacity:.8}
.dshist rect.missed{fill:var(--accent2);opacity:.6}
.dshist rect.last{opacity:1;stroke:var(--cink);stroke-width:1;vector-effect:non-scaling-stroke}
.dshist .avg{stroke:var(--cink);stroke-width:1;stroke-dasharray:3 3;opacity:.45;vector-effect:non-scaling-stroke}
.dsaxis{display:flex;justify-content:space-between;font-family:var(--mono);font-size:calc(var(--scale)*9px);
  letter-spacing:.1em;color:var(--cdim);margin-top:calc(var(--scale)*3px)}
.dsfacts{display:flex;gap:calc(var(--scale)*14px);flex-wrap:wrap;margin-top:calc(var(--scale)*8px);
  font-family:var(--mono);font-size:calc(var(--scale)*10.5px);letter-spacing:.06em;color:var(--cink)}
.dsfacts b{font-family:var(--disp);font-weight:700;font-size:calc(var(--scale)*15px);letter-spacing:0}
.dsfacts .up{color:var(--cok)}
.dsfacts .down{color:var(--cno)}
.dshard{list-style:none;margin:calc(var(--scale)*6px) 0 0;padding:0;display:flex;flex-direction:column;gap:2px}
.dshard li{display:flex;align-items:center;gap:calc(var(--scale)*8px);cursor:pointer;border-radius:2px;
  padding:calc(var(--scale)*4px) calc(var(--scale)*6px);font-size:calc(var(--scale)*13px);color:var(--cink)}
.dshard li:hover{background:color-mix(in srgb,var(--accent2) 13%,transparent)}
.dshard .dscm i{font-style:normal;font-family:var(--mono);font-size:calc(var(--scale)*10.5px)}
.dshard .gd,.dsclist .gd{color:var(--cok)}
.dshard .bd,.dsclist .bd{color:var(--cno)}
.dsclist{list-style:none;margin:calc(var(--scale)*6px) 0 calc(var(--scale)*12px);padding:0;display:flex;flex-direction:column;gap:2px}
.dsc{display:flex;align-items:center;gap:calc(var(--scale)*8px);cursor:pointer;border-radius:2px;
  padding:calc(var(--scale)*4px) calc(var(--scale)*6px);font-family:var(--body);
  font-size:calc(var(--scale)*13px);color:var(--cink);border-left:calc(var(--scale)*3px) solid transparent}
.dsc:hover{background:color-mix(in srgb,var(--accent2) 13%,transparent)}
.dsc.right{border-left-color:var(--cok)}
.dsc.wrong{border-left-color:var(--cno)}
.dsc.none{opacity:.6}
.dscn{flex:none;width:2.2em;font-family:var(--mono);font-size:calc(var(--scale)*10px);color:var(--cdim)}
.dsct{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dscm{flex:none;font-family:var(--mono)}
.dsc.right .dscm{color:var(--cok)}
.dsc.wrong .dscm{color:var(--cno)}
.dsacts{display:flex;gap:calc(var(--scale)*6px);flex-wrap:wrap;margin-top:calc(var(--scale)*6px)}
.dsacts button{font-family:var(--mono);font-size:calc(var(--scale)*10.5px);letter-spacing:.09em;
  text-transform:uppercase;padding:calc(var(--scale)*7px) calc(var(--scale)*11px);border-radius:2px;
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
   Nothing runs over there, so the card turns on a checkbox of its own — which
   means it keeps the 3D on all the time; that is the one place it does. */
.deck.static .dslot{position:absolute;inset:0;display:none}
.deck.static .dslot.on{display:block}
.deck.static .dcard{transform-style:preserve-3d;transition:transform .55s cubic-bezier(.3,.8,.25,1)}
.deck.static .dface{visibility:visible;backface-visibility:hidden;-webkit-backface-visibility:hidden}
.deck.static .dback{transform:rotateY(180deg)}
.dflipbox{position:absolute;width:0;height:0;opacity:0;pointer-events:none}
.dflipbox:checked ~ .dcard{transform:rotateY(180deg)}
.deck.static .dfoot .drow{justify-content:center}
/* ---------- the deck as a file, or a window, of its own ----------
   In the desktop shell the window has no frame, so its bar is what you hold it by */
.deck.study .dbar{-webkit-app-region:drag}
.deck.study .dbar button{-webkit-app-region:no-drag}
.deck.study .dclose{margin-left:calc(var(--scale)*6px)}
.deck.study .dslot{position:absolute;inset:0;display:none}
.deck.study .dslot.on{display:block}
.deck.study .dscore{display:none}
.deck.study .dscore.on{display:block;position:absolute;inset:0;z-index:5}
/* ---------- the looks ---------- */
.deck[data-look="plain"]{--card:#fff;--card2:#f3f3f1;--cink:#222;--cdim:#8a8a86;--cline:rgba(0,0,0,.13);
  --ctint:rgba(0,0,0,.035);--crule:transparent;--crad:calc(var(--scale)*12px);
  --cshadow:0 calc(var(--scale)*10px) calc(var(--scale)*26px) rgba(0,0,0,.22),inset 0 0 0 1px rgba(0,0,0,.08)}
.deck[data-look="plain"] .dhead{padding-bottom:0;opacity:.8}
.deck[data-look="lined"]{--card:#fcfbf5;--card2:#f1efe6;--cink:#25303d;--cdim:#7d8794;--cline:rgba(60,80,110,.22);
  --ctint:rgba(60,80,110,.05);--crule:rgba(214,96,96,.7);
  --cface:linear-gradient(90deg,transparent 0 9cqw,rgba(214,96,96,.55) 9cqw calc(9cqw + 1px),transparent 0),
          repeating-linear-gradient(180deg,transparent 0 calc(8cqh - 1px),rgba(96,140,200,.32) calc(8cqh - 1px) 8cqh)}
.deck[data-look="kraft"]{--card:#c9a97a;--card2:#b8986b;--cink:#2e2114;--cdim:#6f5637;--cline:rgba(60,40,20,.3);
  --ctint:rgba(60,40,20,.08);--crule:rgba(60,40,20,.5);--cok:#2f6b3f;--cno:#9c2f1c;
  --cface:radial-gradient(ellipse at 28% 18%,rgba(255,255,255,.16),transparent 58%),radial-gradient(ellipse at 78% 82%,rgba(0,0,0,.08),transparent 55%);
  --cframe:1.5px dashed rgba(60,40,20,.55);--cfin:2.6cqh 1.8cqw}
.deck[data-look="sticky"]{--card:#f5d94e;--card2:#ebcf46;--cink:#3d3105;--cdim:#7a6512;--cline:rgba(60,48,5,.28);
  --ctint:rgba(60,48,5,.07);--crule:transparent;--cfont:var(--hand);--crad:calc(var(--scale)*1.5px);
  --cok:#2f6b3f;--cno:#b2331b;
  --cface:linear-gradient(180deg,rgba(255,255,255,.28),transparent 28%,rgba(0,0,0,.06))}
.deck[data-look="sticky"] .dblk .dtxt{font-weight:600}
.deck[data-look="chalk"]{--card:#2f3b36;--card2:#26302c;--cink:#eef2ea;--cdim:#a9b5ad;--cline:rgba(255,255,255,.24);
  --ctint:rgba(255,255,255,.06);--crule:rgba(255,255,255,.38);--cfont:var(--hand);--cok:#93d6a4;--cno:#f2907e;
  --cface:radial-gradient(ellipse at 22% 32%,rgba(255,255,255,.07),transparent 55%),radial-gradient(ellipse at 78% 68%,rgba(255,255,255,.05),transparent 50%);
  --cframe:calc(var(--scale)*7px) solid #8f6d4b;--crad:calc(var(--scale)*2px)}
.deck[data-look="chalk"] .dblk .dtxt{font-weight:600;text-shadow:0 0 1px rgba(255,255,255,.35)}
.deck[data-look="chalk"] .dhead{color:#c9d3cc}
.deck[data-look="blueprint"]{--card:#1f4f8b;--card2:#1a4275;--cink:#eaf2ff;--cdim:#a9c4e8;--cline:rgba(255,255,255,.32);
  --ctint:rgba(255,255,255,.08);--crule:rgba(255,255,255,.45);--cfont:var(--mono);--cok:#9be3a8;--cno:#ffb0a0;
  --cface:linear-gradient(rgba(255,255,255,.1) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.1) 1px,transparent 1px);
  --cframe:1px solid rgba(255,255,255,.45);--cfin:2cqh 1.4cqw;--crad:0}
.deck[data-look="blueprint"] .dbody::before{background-size:5cqh 5cqh}
.deck[data-look="night"]{--card:#191c22;--card2:#14171c;--cink:#f0f1f4;--cdim:#8d93a1;--cline:rgba(255,255,255,.15);
  --ctint:rgba(255,255,255,.05);--crule:var(--accent);--cok:#7fd8a0;--cno:#ff8f7d;--crad:calc(var(--scale)*14px);
  --cface:radial-gradient(ellipse at 50% -20%,color-mix(in srgb,var(--accent) 38%,transparent),transparent 62%);
  --cshadow:0 0 0 1px color-mix(in srgb,var(--accent) 45%,transparent),0 calc(var(--scale)*18px) calc(var(--scale)*40px) rgba(0,0,0,.55)}
.deck[data-look="night"] .dstack i{box-shadow:inset 0 0 0 1px rgba(255,255,255,.1)}
`);
/* its tile in the palette */
defineTool({ kind:'deck', cat:'write', label:'Flip cards', icon:'deck', order:40,
  hint:'A deck of flip cards — question on the front, answer on the back, in eight looks' });
