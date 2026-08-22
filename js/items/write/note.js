/* Open Note — items/note.js
   sticky notes, in five colours, with a folded corner */

const NOTE_SEQ = ['', 'c2', 'c3', 'c4', 'c5'];    // '' is the first colour, then four more

defineItem('note', {
  add: { note: base => ({ ...base, type:'note', w:32, fs:22, color:'', html:'',
                          rot: 0 }) },
  sizeable: true,
  autoWidth: it => it.aw !== false,        // as wide as its writing, until it is pinned
  dropWhenBlank: true,                     // an empty one was an accident: it goes
  html: it => '<div class="body note ' + (it.color || '') +
    '" style="font-size:calc(var(--fs)*var(--scale)*1px)"><div class="txt" data-ph="quick note"></div></div>',
  tools(mk, it, el, page){
    mk('◑', 'Note colour', () => {
      it.color = NOTE_SEQ[(NOTE_SEQ.indexOf(it.color || '') + 1) % NOTE_SEQ.length];
      el.querySelector('.note').className = 'body note ' + it.color; queueSave(page.id); });
  }
});

/* ---- how it looks ---- */
addCSS('note', `
.note{background:var(--accent);color:#fff;padding:.7em .8em;box-shadow:0 6px 12px rgba(0,0,0,.22);font-family:var(--hand);font-weight:600;min-height:3em}
.note.c2{background:var(--accent2)}
.note.c3{background:var(--ink);color:var(--paper)}
.note.c4{background:#e8c93e;color:#3a3009}
.note.c5{background:#e58ab2;color:#4d1330}
.note::before{content:"";position:absolute;right:0;bottom:0;border-style:solid;border-width:0 0 calc(var(--scale)*16px) calc(var(--scale)*16px);border-color:transparent transparent rgba(0,0,0,.18) transparent}
`);
/* its tile in the palette */
defineTool({ kind:'note', cat:'write', label:'Sticky', icon:'note', order:30,
  hint:'Sticky notes in 5 colours, with a folded corner' });
