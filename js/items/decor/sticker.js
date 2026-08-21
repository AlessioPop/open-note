/* Open Note — items/sticker.js
   stickers — arrow, star, warning, check, bug, heart */

/* Each is one path drawn in `currentColor`, so recolouring is a CSS property
   and a new sticker is one more entry here. */
const STICKERS = {
  arrow:'<svg viewBox="0 0 100 60" xmlns="http://www.w3.org/2000/svg"><path d="M4 34 C30 10 60 8 82 22 L78 8 96 26 72 34 78 26 C58 14 32 18 12 38 Z" fill="currentColor"/></svg>',
  star:'<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg"><path d="M50 4 61 36 96 36 68 57 78 92 50 71 22 92 32 57 4 36 39 36 Z" fill="currentColor"/></svg>',
  bang:'<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg"><circle cx="50" cy="50" r="46" fill="currentColor"/><path d="M43 20 h14 l-4 42 h-6 Z M50 72 a8 8 0 1 0 .01 0 Z" fill="#fff"/></svg>',
  check:'<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg"><circle cx="50" cy="50" r="46" fill="currentColor"/><path d="M26 52 l16 16 32-36" fill="none" stroke="#fff" stroke-width="11" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  bug:'<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg"><ellipse cx="50" cy="58" rx="24" ry="30" fill="currentColor"/><circle cx="50" cy="26" r="12" fill="currentColor"/><path d="M50 34 V86 M30 46 H70 M32 62 H68" stroke="#fff" stroke-width="4" opacity=".6"/><path d="M28 40 12 28 M72 40 88 28 M26 60 H8 M74 60 H92 M30 76 16 88 M70 76 84 88" stroke="currentColor" stroke-width="5" stroke-linecap="round"/></svg>',
  heart:'<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg"><path d="M50 88 C10 60 6 34 24 20 38 10 50 22 50 30 50 22 62 10 76 20 94 34 90 60 50 88 Z" fill="currentColor"/></svg>'
};
const STK_KEYS = Object.keys(STICKERS);
const STK_COLORS = ['var(--accent)', 'var(--accent2)', 'var(--ink)', '#e8c93e'];

defineItem('sticker', {
  add: { sticker: base => ({ ...base, type:'sticker', w:13, ci:0,
                             kind: STK_KEYS[Math.floor(Math.random() * STK_KEYS.length)],
                             rot: 0 }) },
  sound: 'pop',
  html: it => '<div class="body stk" style="color:' + STK_COLORS[(it.ci || 0) % STK_COLORS.length] +
    '">' + (STICKERS[it.kind] || STICKERS.star) + '</div>',
  after(){},
  tools(mk, it, el, page){
    mk('◑', 'Sticker colour', () => {
      it.ci = ((it.ci || 0) + 1) % STK_COLORS.length;
      el.querySelector('.stk').style.color = STK_COLORS[it.ci]; queueSave(page.id); });
    mk('✦', 'Next sticker', () => {
      it.kind = STK_KEYS[(STK_KEYS.indexOf(it.kind) + 1) % STK_KEYS.length];
      el.querySelector('.stk').innerHTML = STICKERS[it.kind]; queueSave(page.id); });
  }
});

/* ---- how it looks ---- */
addCSS('sticker', `
.stk svg{display:block;width:100%;height:auto;filter:drop-shadow(0 3px 4px rgba(0,0,0,.25))}
`);
/* its tile in the palette */
defineTool({ kind:'sticker', cat:'decor', label:'Sticker', icon:'sticker', order:20,
  hint:'Arrow, star, warning, check, bug, heart — recolourable' });
