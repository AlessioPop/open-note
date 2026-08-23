/* Open Note — lib/ticks.js
   code ticks: `like this`, and ```fenced``` blocks with a copy button

   The same bargain LaTeX made in lib/latex.js, for code. What is stored is the
   source you typed — backticks and all — and it is compiled into markup when
   you leave the box and taken apart again when you come back to it, so there is
   never a second copy of anything to keep in step. A run of one or two
   backticks is a phrase set in the typewriter face; three or more open a block,
   which carries a bar with the language on it and a button that puts the code
   on the clipboard.

   Ticks are compiled BEFORE maths — richify() below settles the order — so a
   `$$` inside a fence is a `$$` and not an equation. The other way round, a
   backtick standing inside a formula (\grave writes one) is left alone. */

const TK_COPY = '⧉ copy', TK_DONE = '✓ copied';

/* ---- every run of backticks in a string, closed or not ----
   Reported the way mathScan() reports dollars: a…b is the whole thing, o…c is
   the body between the fences. An unclosed run is only a backtick someone
   typed, so the scan carries on from just after it rather than giving up on the
   rest of the line. */
function tickScan(s){
  const out = [];
  let i = 0;
  while(i < s.length){
    if(s[i] !== '`'){ i++; continue; }
    let n = 0;
    while(s[i + n] === '`') n++;
    let j = i + n, c = -1;
    while(j < s.length){                              // the closer is a run of the same length
      if(s[j] !== '`'){ j++; continue; }
      let m = 0;
      while(s[j + m] === '`') m++;
      if(m === n){ c = j; break; }
      j += m;
    }
    const shut = c >= 0;
    out.push({ a: i, o: i + n, c: shut ? c : s.length, b: shut ? c + n : s.length,
               n, blk: n >= 3, shut, body: s.slice(i + n, shut ? c : s.length) });
    i = shut ? c + n : i + n;
  }
  return out;
}
/* the run an offset is standing in — o…c is its body */
function tickRegion(s, off){
  for(const r of tickScan(s))
    if(off >= r.o && off <= r.c) return r;
  return null;
}
/* is this offset inside a fenced block? — where nothing else may claim the text */
function tickInFence(s, off){
  const r = tickRegion(s, off);
  return !!(r && r.blk && r.shut && off > r.o && off < r.c);
}

/* ---- what a fence says about itself ----
   The word after the opening fence names the language, as it does in every
   other markdown-shaped thing. No word — a fence opened with ⏎ straight after
   it — and the body starts on the first line. */
function tickInfo(body){
  const nl = body.indexOf('\n');
  if(nl < 0) return '';
  const head = body.slice(0, nl);
  return /^[ \t]*[A-Za-z][\w+#.-]*[ \t]*$/.test(head) ? head.trim() : '';
}
/* the code itself, without the language line, the break that follows the fence,
   or the blank tail before the closing one */
function tickCode(body){
  const lang = tickInfo(body);
  const c = lang ? body.slice(body.indexOf('\n') + 1) : body.replace(/^\n/, '');
  return c.replace(/\s+$/, '');
}

/* the runs worth compiling: closed, holding something, and — for a phrase —
   staying on one line. A tick opened inside a formula is the formula's. */
function tickHits(s){
  const out = [];
  const math = (typeof mathScan === 'function' ? mathScan(s) : []).filter(r => r.shut);
  for(const r of tickScan(s)){
    if(!r.shut || !r.body.trim()) continue;
    if(!r.blk && r.body.indexOf('\n') >= 0) continue;
    if(math.some(m => r.a > m.a && r.a < m.b)) continue;
    out.push({ at: r.a, len: r.b - r.a, src: s.slice(r.a, r.b), blk: r.blk,
               lang: r.blk ? tickInfo(r.body) : '',
               code: r.blk ? tickCode(r.body) : r.body });
  }
  return out;
}

/* ---- what typing a ` does ----
   Written as mathpad's rules are, over (text, offset) with no DOM in sight, so
   the harness can drive them without a caret. One backtick writes the pair, a
   second grows it, a third opens it out onto three lines with the caret on the
   middle one — which is the whole point of a fence, since you cannot get inside
   one that has already closed. */
function tickTick(s, off){
  const b1 = s[off - 1], b2 = s[off - 2], b3 = s[off - 3];
  const a1 = s[off], a2 = s[off + 1], a3 = s[off + 2];
  /* inside a fence a backtick is a backtick — code is full of them */
  if(tickInFence(s, off)) return { from: off, to: off, text: '`', caret: 1 };
  /* the third one, inside the pair the second made: three lines, and a line of
     its own if there is writing either side */
  if(b1 === '`' && b2 === '`' && b3 !== '`' && a1 === '`' && a2 === '`' && a3 !== '`'){
    const ls = s.lastIndexOf('\n', off - 3) + 1, le = s.indexOf('\n', off + 2);
    const pre  = s.slice(ls, off - 2).trim() ? '\n' : '';
    const post = s.slice(off + 2, le < 0 ? s.length : le).trim() ? '\n' : '';
    return { from: off - 2, to: off + 2, text: pre + '```\n\n```' + post, caret: pre.length + 4 };
  }
  /* the second one, inside the pair the first made: grow both sides */
  if(b1 === '`' && b2 !== '`' && a1 === '`' && a2 !== '`')
    return { from: off - 1, to: off + 1, text: '````', caret: 2 };
  /* the closer is already there: step over it rather than adding another */
  if(a1 === '`') return { from: off, to: off, text: '', caret: a2 === '`' ? 2 : 1 };
  return { from: off, to: off, text: '``', caret: 1 };
}

/* ---- compiled, and back again ---- */
function tickNode(hit, live, root){
  if(!hit.blk){
    const c = document.createElement('code');
    c.className = 'tick';
    c.setAttribute('data-tick', hit.src);
    c.contentEditable = 'false';
    c.textContent = hit.code;
    return c;
  }
  /* a block is a code cell in a sentence, and the cell's own feature builds it
     — coloured, in the note's scheme, with the bar the cell wears */
  const pen = codePen();
  if(pen && pen.node) return pen.node(hit, live !== false, root);
  const d = document.createElement('div');
  d.className = 'tickblk';
  d.setAttribute('data-tick', hit.src);
  d.contentEditable = 'false';
  const bar = document.createElement('div');
  bar.className = 'tkbar';
  const lab = document.createElement('span');
  lab.className = 'tklang';
  lab.textContent = hit.lang || 'code';
  const btn = document.createElement('button');
  btn.className = 'tkcopy'; btn.type = 'button';
  btn.title = 'Copy this code';
  btn.textContent = TK_COPY;
  bar.appendChild(lab); bar.appendChild(btn);
  const pre = document.createElement('pre');
  pre.className = 'tkpre';
  pre.textContent = hit.code;
  d.appendChild(bar); d.appendChild(pre);
  return d;
}
/* compile every tick sitting in this element's text, in place. The flatten and
   the offsets are latex.js's — one text box, one way of reading it. */
function tickify(root, live){
  if(!root) return root;
  if((root.textContent || '').indexOf('`') < 0) return root;
  const flat = mathFlat(root);
  const hits = tickHits(flat.s);
  if(!hits.length) return root;
  for(let i = hits.length - 1; i >= 0; i--){         // back to front, so earlier offsets hold
    const h = hits[i], end = h.at + h.len;
    const a = mathSpot(flat.nodes, h.at);
    if(!a) continue;
    /* A block ends the line it stands on, so the break after the closing fence
       is the fence's own — left where it is it shows as an empty line under the
       code. It goes into the source on the element with everything else, so
       coming back to edit gives it straight back. */
    const grab = h.blk && flat.s[end] === '\n' ? mathSpot(flat.nodes, end + 1) : null;
    const r = document.createRange();
    r.setStart(a[0], a[1]);
    let src = h.src;
    if(grab){
      try{ r.setEnd(grab[0], grab[1]); src += '\n'; }
      catch(e){ src = h.src; }
    }
    if(src === h.src){                               // the plain end, or the grab would not take
      const b = mathSpot(flat.nodes, end);
      if(!b) continue;
      try{ r.setEnd(b[0], b[1]); }catch(e){ continue; }
    }
    r.deleteContents();
    r.insertNode(tickNode(src === h.src ? h : { ...h, src }, live, root));
  }
  return root;
}
/* put the backticks back, ready to be edited */
function untickify(root){
  if(!root) return root;
  root.querySelectorAll('[data-tick]').forEach(n =>
    n.replaceWith(document.createTextNode(n.getAttribute('data-tick') || '')));
  root.normalize();
  return root;
}

/* ---- the two anybody else calls ----
   Marks first — a heading is a line, and it may hold code or a formula — then
   ticks, because a fence seals its text and the maths pass walks straight over
   it. Every writing surface in the app goes through this pair, and unwinds it
   in the opposite order. Only an explicit `live === false` — a print, an
   export, a thumbnail — leaves the buttons off a block, so that
   `list.forEach(richify)` handing an index along is harmless. */
function richify(root, live){ return mathify(tickify(markify(root), live)); }
function plainify(root){ return unmarkify(untickify(unmathify(root))); }

/* ---- setting the language from the bar ----
   A fence keeps nothing but its source, so the language is the word after the
   opening backticks and changing it rewrites that line. The block is then built
   again from the new source and the box it sits in is told, the way a keystroke
   tells it — every writing surface that stores rich text saves itself on
   `input`, so nothing here needs to know whose writing this is. */
function tickRelang(node, word){
  const src = node.getAttribute('data-tick') || '';
  const m = /^(`{3,})([^\n]*)/.exec(src);
  if(!m) return;
  const next = m[1] + word + src.slice(m[1].length + m[2].length);
  const hit = tickHits(next)[0];
  const fresh = tickNode(hit ? { ...hit, src: next } : { blk: true, src: next, lang: word, code: '' },
                         true, node.parentNode);
  node.replaceWith(fresh);
  const box = fresh.closest('.txt,.dtxt,.dot');
  if(box) box.dispatchEvent(new Event('input', { bubbles: true }));
  if(typeof SND === 'object' && SND.tick) SND.tick();
}
document.addEventListener('change', e => {
  const sel = e.target.closest && e.target.closest('.cfence select.clang');
  if(!sel) return;
  e.stopPropagation();
  tickRelang(sel.closest('[data-tick]'), sel.value);
}, true);
/* the bar belongs to the block: the item under it must not take a press on it
   for the start of a drag, and a double-click on it is not "edit this writing" */
document.addEventListener('pointerdown', e => {
  if(e.target.closest && e.target.closest('.cfence .cbar')) e.stopPropagation();
}, true);
document.addEventListener('dblclick', e => {
  if(e.target.closest && e.target.closest('.cfence .cbar')) e.stopPropagation();
}, true);

/* ---- the copy button ----
   Delegated, because these come and go with every rebuild of a page. The
   pointer is caught in the capture phase: the item underneath would otherwise
   take it as the start of a drag before the click ever landed. */
const tkBtn = e => e.target.closest && e.target.closest('.tickblk .tkcopy,.cfence .ccopy,.cfence .csch');
document.addEventListener('pointerdown', e => {
  if(tkBtn(e)){ e.stopPropagation(); e.preventDefault(); }
}, true);
document.addEventListener('click', e => {
  const b = tkBtn(e);
  if(!b) return;
  e.stopPropagation(); e.preventDefault();
  if(b.classList.contains('csch')){                  // the note's colour scheme, cycled
    const pen = codePen();
    if(pen && pen.cycle) pen.cycle();
    return;
  }
  const box = b.closest('[data-tick]');
  const code = box && (box.querySelector('.tkpre') || box.querySelector('.ced'));
  copyText(code ? code.textContent : '', () => {
    b.classList.add('did');
    if(b.classList.contains('tkcopy')) b.textContent = TK_DONE;
    if(typeof SND === 'object' && SND.tick) SND.tick();
    clearTimeout(b._t);
    b._t = setTimeout(() => {
      b.classList.remove('did');
      if(b.classList.contains('tkcopy')) b.textContent = TK_COPY;
    }, 1300);
  });
}, true);

/* ---- how it looks ----
   The phrase is this file's own; the block wears the code cell's clothes and
   those live with the cell. What is left here is the block with no cell
   loaded at all. */
addCSS('ticks', `
/* a phrase in backticks — sized off the writing around it, so it sits on the line */
.tick{font-family:var(--mono);font-size:.88em;background:rgba(127,127,127,.16);
  border:1px solid rgba(127,127,127,.22);border-radius:4px;padding:.06em .35em;
  white-space:pre-wrap;word-break:break-word;-webkit-user-select:text;user-select:text}
/* a fenced block: a bar with the language and the copy button, then the code */
.tickblk{display:block;max-width:100%;margin:.5em 0;border:1px solid var(--line);border-radius:8px;
  background:rgba(127,127,127,.10);overflow:hidden;font-family:var(--mono);font-size:.86em;
  text-align:left;text-transform:none;letter-spacing:normal;font-weight:400;font-style:normal;
  -webkit-user-select:text;user-select:text}
.tkbar{display:flex;align-items:center;gap:.5em;padding:.25em .3em .25em .55em;
  border-bottom:1px solid var(--line);background:rgba(127,127,127,.12);
  font-size:.78em;letter-spacing:.08em;text-transform:uppercase;color:var(--soft)}
.tklang{flex:1;min-width:0;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}
.tkcopy{flex:none;border:0;background:transparent;color:var(--soft);font:inherit;letter-spacing:.04em;
  cursor:pointer;padding:.15em .4em;border-radius:5px}
.tkcopy:hover{color:var(--ink);background:rgba(127,127,127,.2)}
.tkcopy.did{color:var(--accent)}
.tkpre{margin:0;padding:.5em .6em;white-space:pre;overflow-x:auto;line-height:1.45;color:var(--ink)}
/* handwriting on a highlighter runs inline: a block inside one takes what it needs */
.st-marker .tickblk{display:inline-block;vertical-align:top;margin:.2em 0}
@media print{ .tkcopy{display:none} }
`);
