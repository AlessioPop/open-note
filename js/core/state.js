/* Open Note — core/state.js
   the open book, its pages, and what is selected */

/* ================= state ================= */
let lib = null;            // {lastOpen, books:[{id,name,created,updated}]}
let curBookId = null;
let index = null;          // the open book: {theme, cur, spread, settings:{}, pages:[{id,title,date}]}
let pages = new Map();
let cur = 0, selected = null, activePageId = null;
const MEDIA_URL = {};
let zoom = 1, panX = 0, panY = 0;

function blankPage(n, src){
  const s = src || index;
  const def = (s && s.settings && s.settings.defPaper) || 'grid';
  return { id: uid(), title: n === 0 ? 'Cover' : 'Entry ' + n,
    date: new Date().toISOString().slice(0, 10),
    paper: n === 0 ? 'blank' : def, items: [] };
}
function coverItems(){
  return [
    { id:uid(), type:'text', st:'mono',  x:12, y:16, w:60, rot:0, fs:15, z:1, html:'DEVLOG — VOLUME ONE' },
    { id:uid(), type:'text', st:'title', x:12, y:24, w:74, rot:0, fs:74, z:2, html:'Working Title' },
    { id:uid(), type:'text', st:'hand',  x:13, y:52, w:60, rot:0, fs:30, z:3, html:'notes, screenshots and bad ideas' },
    { id:uid(), type:'washi', x:8,  y:8,  w:34, rot:0, z:4, pat:0 },
    { id:uid(), type:'text', st:'mono',  x:12, y:82, w:60, rot:0, fs:13, z:5, html:'STARTED · ' + new Date().toISOString().slice(0, 10) }
  ];
}
