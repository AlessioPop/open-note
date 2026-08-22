/* Open Note — items/text.js
   writing on the page — poster type, body text, handwriting, marker */

const MK_COLORS = ['#f5e04b', '#8fe08c', '#f2a9c4', '#8fd3f2'];   // the marker's four inks

/* One item type wearing five hats. They differ only in the font they are set
   in, which is the `st` on the item and the `st-…` class in the markup, so a
   sixth style is a line in `add` and a rule in the stylesheet. */
defineItem('text', {
  add: {
    title:  base => ({ ...base, type:'text', st:'title',  w:70, fs:46, html:'' }),
    body:   base => ({ ...base, type:'text', st:'body',   w:54, fs:19, html:'' }),
    hand:   base => ({ ...base, type:'text', st:'hand',   w:48, fs:30, html:'' }),
    mono:   base => ({ ...base, type:'text', st:'mono',   w:48, fs:15, html:'' }),
    marker: base => ({ ...base, type:'text', st:'marker', w:52, fs:26, html:'', mk:MK_COLORS[0] })
  },
  sizeable: true,
  autoWidth: it => it.aw !== false,        // as wide as its writing, until it is pinned
  dropWhenBlank: true,                     // an empty one was an accident: it goes
  html: it => it.st === 'marker'
    ? '<div class="body mkwrap"><div class="txt st-marker" data-ph="highlight something"></div></div>'
    : '<div class="body"><div class="txt st-' + it.st + '" data-ph="type here"></div></div>',
  tools(mk, it, el, page){
    if(it.st !== 'marker') return;
    mk('◑', 'Marker colour', () => {
      const i = (MK_COLORS.indexOf(it.mk || MK_COLORS[0]) + 1) % MK_COLORS.length;
      it.mk = MK_COLORS[i]; el.style.setProperty('--mk', it.mk); queueSave(page.id); });
  }
});

/* ---- how it looks ---- */
addCSS('text', `
.txt{font-size:calc(var(--fs)*var(--scale)*1px);color:var(--ink);padding:.15em .2em;outline:none;white-space:pre-wrap;word-break:break-word;line-height:1.35}
.txt:empty::before{content:attr(data-ph);opacity:.4}
.editing .txt{user-select:text;cursor:text;background:rgba(127,127,127,.08)}
.st-title{font-family:var(--disp);font-weight:700;text-transform:uppercase;letter-spacing:.01em;line-height:1.02}
.st-body{font-family:var(--body);line-height:1.4}
.st-hand{font-family:var(--hand);font-weight:600;line-height:1.25}
.st-mono{font-family:var(--mono);font-size:calc(var(--fs)*var(--scale)*.86px);letter-spacing:.02em;line-height:1.5}
.st-marker{font-family:var(--hand);font-weight:700;line-height:1.35;display:inline;background:linear-gradient(0deg,transparent 8%,var(--mk,#f5e04b) 8% 72%,transparent 72%);-webkit-box-decoration-break:clone;box-decoration-break:clone;padding:.05em .25em}
.mkwrap{max-width:100%}
.st-marker .math.dsp{display:inline-block;text-align:left;margin:0}
`);
/* its tiles in the palette — one per style */
defineTool({ kind:'title',  cat:'write', label:'Heading',     icon:'heading', order:10, hint:'Poster type for titles' });
defineTool({ kind:'body',   cat:'write', label:'Text',        icon:'text',    order:12, hint:'Serif body text — $$…$$ sets an equation' });
defineTool({ kind:'hand',   cat:'write', label:'Handwriting', icon:'hand',    order:14, hint:'Marker-pen handwriting' });
defineTool({ kind:'mono',   cat:'write', label:'Mono',        icon:'mono',    order:16, hint:'Monospace — for code and readouts' });
defineTool({ kind:'marker', cat:'write', label:'Marker',      icon:'marker',  order:18, hint:'Highlighted handwriting — ◑ cycles the colour' });
