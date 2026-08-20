/* Open Note — items/washi.js
   decorative tape — six patterns, torn off at an angle */

/* The patterns are plain CSS gradients, so a new one is a line in this list. */
const WASHI = [
  'repeating-linear-gradient(45deg,#cf3a24 0 8px,#f2e2c4 8px 16px)',
  'repeating-linear-gradient(45deg,#2b7d8c 0 8px,#dff0ee 8px 16px)',
  'radial-gradient(circle at 8px 13px,#fff 3px,transparent 3.5px) 0 0/22px 26px,#e8a23c',
  'radial-gradient(circle at 8px 13px,#fff 3px,transparent 3.5px) 0 0/22px 26px,#7a5ea8',
  'linear-gradient(0deg,#3a6e4f,#3a6e4f)',
  'repeating-linear-gradient(90deg,#1d2328 0 3px,#e8c93e 3px 14px)'
];

defineItem('washi', {
  add: { washi: base => ({ ...base, type:'washi', w:30, rot: 0,
                           pat: Math.floor(Math.random() * WASHI.length) }) },
  sound: 'tape',
  html: it => '<div class="body washi" style="background:' + WASHI[it.pat % WASHI.length] + '"></div>',
  after(){},                                     // nothing to type in — it is just tape
  tools(mk, it, el, page){
    mk('◑', 'Tape pattern', () => {
      it.pat = ((it.pat || 0) + 1) % WASHI.length;
      el.querySelector('.washi').style.background = WASHI[it.pat]; queueSave(page.id); });
  }
});

/* ---- how it looks ---- */
addCSS('washi', `
.washi{height:calc(var(--scale)*26px);opacity:.88;box-shadow:0 2px 5px rgba(0,0,0,.15);mix-blend-mode:multiply}
`);
/* its tile in the palette */
defineTool({ kind:'washi', cat:'decor', label:'Tape', icon:'washi', order:10,
  hint:'Decorative washi strips, 6 patterns' });
