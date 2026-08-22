/* Open Note — core/util.js
   helpers, constants, and the stored-HTML sanitiser */

/* ================= helpers / constants ================= */
const uid = () => Math.random().toString(36).slice(2, 9);
const $ = s => document.querySelector(s);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));

const K_LIB = 'library';                 // the stored name stays: see core/state.js
const kPage = id => 'page:' + id;
const kBook = id => 'book:' + id;
const fmtDate = ts => ts ? new Date(ts).toISOString().slice(0, 10) : '';
const PG_MIN = 360, PG_MAX = 2600;                 // how small a sheet may be, and the plain ceiling
const PG_BASE = 660;                               // the width every default below was drawn against
const PG_DEF_W = 1980, PG_DEF_H = 1320;            // a note that has never said how big it is
/* how big this note's sheet is, in sheet units. A note raises the ceiling on
   itself with `pgmax` — core/doc.js sets it to SHEET_MAX. */
function pgSize(idx){
  const b = (idx || index) || {};
  const s = b.settings || {};
  const hi = Math.max(PG_MAX, +b.pgmax || 0);
  return { w: clamp(+s.pgw || PG_DEF_W, PG_MIN, hi), h: clamp(+s.pgh || PG_DEF_H, PG_MIN, hi) };
}
const pgW = idx => pgSize(idx).w;
const pgH = idx => pgSize(idx).h;
/* Anything stored as a fraction of the paper — an item's width, a margin, a
   stroke — comes out bigger on bigger paper. These keep a thing the physical
   size it was drawn to be, whatever it is sitting on: pgK() rescales a width
   written as a percentage, pctW/pctH turn a distance in page units into a
   percentage of this sheet. */
const pgK = () => PG_BASE / pgW();
const pctW = u => 100 * u / pgW();
const pctH = u => 100 * u / pgH();
/* an item may never be narrower than a thumb of normal paper */
const minItemW = () => Math.min(6, pctW(40));
/* per-theme palettes, mirrored from the CSS so shelf covers can render in their own book's colours */
const THEME_VARS = {
  graph:{desk:'#2a2e33',paper:'#e9e6dd',ink:'#191f24',soft:'#6b7076',line:'#c3cbc6',accent:'#cf3a24',accent2:'#2b7d8c',edge:'#cfc9bd',tape:'rgba(210,200,175,.72)'},
  dark: {desk:'#0f1114',paper:'#262a2f',ink:'#e9e6df',soft:'#9aa0a6',line:'#3a4046',accent:'#e0653f',accent2:'#58b3c0',edge:'#1c2024',tape:'rgba(255,255,255,.10)'},
  blue: {desk:'#08131f',paper:'#14304d',ink:'#e6f1fb',soft:'#93b4cf',line:'#2b5a80',accent:'#f2b544',accent2:'#7fd3ff',edge:'#0d2438',tape:'rgba(255,255,255,.12)'},
  kraft:{desk:'#3a3128',paper:'#d9c39a',ink:'#2c2318',soft:'#7a6a52',line:'#c0aa80',accent:'#b83a1d',accent2:'#33656b',edge:'#c2ab80',tape:'rgba(255,255,255,.28)'}
};
/* MK_COLORS, NOTE_SEQ, WASHI and the stickers moved out to the features that
   own them — js/items/text.js, note.js, washi.js and sticker.js. */
const HL_COLORS = ['#f5e04b', '#a5e6a0', '#f6b9d2', '#a8dcf5'];
const PAPERS = ['grid', 'ruled', 'dots', 'iso', 'blank'];

/* keep only harmless formatting in stored rich text */
function sanitize(html){
  const t = document.createElement('div');
  t.innerHTML = html == null ? '' : String(html);
  t.querySelectorAll('script,style,iframe,object,embed,link,meta').forEach(n => n.remove());
  /* compiled maths and code are stored as their source, never as markup */
  t.querySelectorAll('[data-tex],[data-tick]').forEach(n =>
    n.replaceWith(document.createTextNode(
      n.getAttribute('data-tex') || n.getAttribute('data-tick') || '')));
  const ok = { B:1, I:1, U:1, S:1, BR:1, SPAN:1, MARK:1, DIV:1, FONT:1 };
  (function walk(n){
    [...n.children].forEach(c => {
      walk(c);
      if(!ok[c.tagName]){ c.replaceWith(...c.childNodes); return; }
      const bg = c.style ? c.style.backgroundColor : '';
      [...c.attributes].forEach(a => c.removeAttribute(a.name));
      if(bg) c.style.backgroundColor = bg;
    });
  })(t);
  return t.innerHTML;
}

/* ---- the clipboard ----
   One way of putting text on it, for the three or four buttons that offer to.
   The modern call needs a secure context and a permission, and a book opened
   off the disk has neither, so the old off-screen textarea is kept behind it —
   both only work inside the gesture that asked, so neither may be deferred.
   `done` is called only if the text really landed. */
function copyText(text, done){
  const said = () => { if(done) done(); };
  const fallback = () => {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0';
    document.body.appendChild(ta); ta.select();
    let ok = false;
    try{ ok = document.execCommand('copy'); }catch(e){}
    ta.remove();
    if(ok) said();
  };
  if(navigator.clipboard && navigator.clipboard.writeText)
    navigator.clipboard.writeText(text).then(said).catch(fallback);
  else fallback();
}
