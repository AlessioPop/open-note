/* Open Note — lib/marks.js
   the marks writing wears: # a heading, - a bullet, - [ ] a task, --- a rule,
   **bold**, *italic*, and -> an arrow

   The same bargain latex.js and ticks.js made, for the shape of a page of
   writing. What is stored is what you typed — the hashes, the dashes and the
   brackets — and it is compiled into markup when you leave the box and taken
   apart again when you come back to it, so there is never a second copy of
   anything to keep in step, and a heading, a list or a ticked task survives a
   backup, an export and a print as the line that made it.

   Three levels of heading, as markdown has them: `# ` a heading, `## ` a
   sub-heading, `### ` the step under that; four or more hashes are still a
   step-three heading rather than nothing at all. `---` alone on a line is a
   rule across the writing. `- ` opens a bullet and `- [ ] ` a task with a box
   to tick; whitespace in front of either is how deep it sits, and a nested
   bullet carries a hairline down from the one it belongs to. Inside a line,
   `**two stars**` are bold and `*one*` is italic, and `->` is an arrow. The
   line marks must open the line — a `#` in the middle of a sentence is a hash,
   and `#1` is a number — and emphasis wants its stars against the writing, so
   `2 * 3 * 4` is arithmetic and stays as it is.

   Marks compile BEFORE ticks and maths — richify() in lib/ticks.js settles the
   order — so a heading or a bullet may hold a formula or a phrase of code,
   while a `#` or an `->` standing inside a fence or a formula is left where it
   is. And a heading takes the size and weight of a heading but keeps the face
   of the box it is in: a heading in handwriting is still handwriting.

   What ⏎ and ⇥ do while a list is being typed is here too, and what ⌃B and ⌃I
   do to whatever is picked out, written the way mathpad's rules are — over
   (text, offset), with no DOM in sight, so the harness can drive them without a
   caret. The wiring is chrome/markpad.js. */

/* ---- the lines worth compiling ----
   Reported the way tickHits() reports backticks: an offset, the line it ends
   at, and whether there is a line ending to take with it. */
const MK_HEAD = /^(#{1,6})([ \t\u00a0]+)/;
const MK_RULE = /^-{3,}[ \t\u00a0]*$/;
const MK_LIST = /^([ \t\u00a0]*)-([ \t\u00a0]+)(\[([ xX\u00a0])\](?:[ \t\u00a0]|$))?/;
const MK_DEEP = 6;                                 // as far in as a bullet may sit
/* a browser's editor swaps a space for a non-breaking one wherever it thinks
   the space might collapse, so the indent has to read either as an indent */
const MK_SPACE = c => c === ' ' || c === '\u00a0';

/* how deep an indent is: a tab is one step, and so is every two spaces */
function mkDepth(ind){
  let d = 0, sp = 0;
  for(const c of ind || ''){
    if(c === '\t'){ d++; sp = 0; }
    else if(MK_SPACE(c) && ++sp === 2){ d++; sp = 0; }
  }
  return Math.min(d, MK_DEEP);
}
/* one step back out — a tab, a pair of spaces, or whatever single space is left */
function mkLess(ind){
  if(ind.slice(-1) === '\t') return ind.slice(0, -1);
  if(MK_SPACE(ind.slice(-1)) && MK_SPACE(ind.slice(-2, -1))) return ind.slice(0, -2);
  return ind.slice(0, -1);
}

/* what an offset is standing inside and may not be claimed from. Line marks
   only care about a fenced block — a line inside one is code. An arrow cares
   about any closed run of backticks, since `a -> b` is code being quoted. */
function mkSeal(s, ticks){
  const math  = (typeof mathScan === 'function' ? mathScan(s) : []).filter(r => r.shut);
  const fence = (typeof tickScan === 'function' ? tickScan(s) : [])
                  .filter(r => r.shut && (ticks || r.blk));
  return at => math.some(m => at > m.a && at < m.b) ||
               fence.some(f => at > f.a && at < f.b);
}

function markHits(s){
  const out = [];
  const sealed = mkSeal(s, false);
  let i = 0;
  for(;;){
    const nl = s.indexOf('\n', i), end = nl < 0 ? s.length : nl;
    const line = s.slice(i, end);
    if(!sealed(i)){
      const h = MK_HEAD.exec(line), l = h ? null : MK_LIST.exec(line);
      if(h && line.slice(h[0].length).trim())
        out.push({ kind: 'head', at: i, end, nl: nl >= 0,
                   pre: h[0], lvl: Math.min(h[1].length, 3) });
      else if(MK_RULE.test(line))
        out.push({ kind: 'rule', at: i, end, nl: nl >= 0, src: line });
      else if(l && line.slice(l[0].length).trim())
        out.push({ kind: 'li', at: i, end, nl: nl >= 0, pre: l[0], ind: l[1],
                   task: !!l[3], done: (l[4] || '').toLowerCase() === 'x',
                   dep: mkDepth(l[1]) });
    }
    if(nl < 0) break;
    i = nl + 1;
  }
  return out;
}

/* ---- the line a caret is standing on ----
   The one thing ⏎ and ⇥ need to know. `li` is null when the line is not a
   list — then neither key has anything to say and the box carries on as it
   always did. */
function markLine(s, off){
  const at = s.lastIndexOf('\n', off - 1) + 1;
  const nl = s.indexOf('\n', off);
  const end = nl < 0 ? s.length : nl;
  const line = s.slice(at, end);
  const m = mkSeal(s, false)(off) ? null : MK_LIST.exec(line);
  return { at, end, line, li: m && {
    pre: m[0], ind: m[1], task: !!m[3], done: (m[4] || '').toLowerCase() === 'x',
    body: line.slice(m[0].length) } };
}
/* what ⏎ does on a list line: the next one, already marked. An empty item is
   how a list ends — it steps back out a level, and out of the list altogether
   from the left-hand margin. */
function markEnter(s, off){
  const L = markLine(s, off);
  if(!L.li) return null;
  if(off < L.at + L.li.pre.length) return null;      // still inside the marker: a plain ⏎
  if(!L.li.body.trim()){
    if(!L.li.ind) return { from: L.at, to: L.end, text: '', caret: 0 };
    const back = mkLess(L.li.ind) + '- ' + (L.li.task ? '[ ] ' : '');
    return { from: L.at, to: L.end, text: back, caret: back.length };
  }
  /* a ticked task makes an unticked one — the next thing to do, not another done thing */
  const next = '\n' + L.li.ind + '- ' + (L.li.task ? '[ ] ' : '');
  return { from: off, to: off, text: next, caret: next.length };
}
/* what ⇥ does on a list line: one step in, ⇧⇥ one step back. The caret keeps
   its place in the writing rather than jumping to the marker. */
function markTab(s, off, back){
  const L = markLine(s, off);
  if(!L.li) return null;
  const ind = L.li.ind;
  /* `raw`: this one is written into the box by hand rather than through the
     editor's own insertText, which is free to turn whitespace it is handed into
     whatever it thinks will survive — and a step that came back as a space is
     not a step */
  if(back){
    const less = mkLess(ind);
    if(less === ind) return null;
    const cut = ind.length - less.length;
    return { from: L.at, to: L.at + ind.length, text: less, raw: true,
             caret: Math.max(less.length, off - L.at - cut) };
  }
  if(mkDepth(ind) >= MK_DEEP) return null;
  return { from: L.at, to: L.at, text: '\t', raw: true, caret: off - L.at + 1 };
}

/* ---- the stars inside a line ----
   A run of one, two or three stars, closed by a run of the same length on the
   same line, with writing rather than a space against each of them: that last
   rule is what keeps `2 * 3 * 4` arithmetic. A run standing inside a formula or
   any run of backticks is that language's own — `a**b` is a power in half the
   languages there are. */
function emphHits(s){
  const out = [];
  const sealed = mkSeal(s, true);
  let i = 0;
  while(i < s.length){
    if(s[i] !== '*'){ i++; continue; }
    let n = 0;
    while(s[i + n] === '*') n++;
    const o = i + n;
    if(n > 3 || sealed(i) || o >= s.length || /\s/.test(s[o])){ i += n; continue; }
    let j = o, c = -1;
    while(j < s.length && s[j] !== '\n'){          // the closer is on this line or nowhere
      if(s[j] !== '*'){ j++; continue; }
      let m = 0;
      while(s[j + m] === '*') m++;
      if(m === n && j > o && !/\s/.test(s[j - 1])){ c = j; break; }
      j += m;
    }
    if(c < 0 || sealed(c)){ i += n; continue; }
    out.push({ at: i, end: c + n, n, mk: s.slice(i, i + n) });
    i = c + n;
  }
  return out;
}
/* what ⌃B and ⌃I do to what is picked out: the stars go round it, or come off
   again if they are already there — inside or outside what was picked, since
   both are ways of saying the same thing. With nothing picked out the pair is
   written and the caret parked in the middle of it, the way a $ pairs itself. */
function markWrap(s, a, b, mk){
  const n = mk.length;
  if(mkSeal(s, true)(a)) return null;              // inside code or a formula: not ours
  if(a === b) return { from: a, to: a, text: mk + mk, caret: n };
  if(s.slice(a, b).indexOf('\n') >= 0) return null;   // emphasis is a thing inside one line
  if(s.slice(a - n, a) === mk && s.slice(b, b + n) === mk)
    return { from: a - n, to: b + n, text: s.slice(a, b), caret: 0, pick: [a - n, b - n] };
  if(b - a > 2 * n && s.slice(a, a + n) === mk && s.slice(b - n, b) === mk)
    return { from: a, to: b, text: s.slice(a + n, b - n), caret: 0, pick: [a, b - 2 * n] };
  return { from: a, to: b, text: mk + s.slice(a, b) + mk, caret: n, pick: [a + n, b + n] };
}

/* ---- the front and the back of what the range brought back ----
   The marker itself and the line ending are the mark's, not the writing's: the
   block makes its own break, and a `\n` left inside it would show as an empty
   line under the heading. Both go into the attribute instead, so coming back to
   edit gives them straight back. */
function mkTexts(el){
  const out = [], w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  for(let t = w.nextNode(); t; t = w.nextNode()) out.push(t);
  return out;
}
function mkEatFront(el, n){
  for(const t of mkTexts(el)){
    if(n <= 0) break;
    const take = Math.min(n, t.nodeValue.length);
    t.nodeValue = t.nodeValue.slice(take);
    n -= take;
    if(!t.nodeValue) t.remove();
  }
}
function mkEatEnd(el, n){
  const t = mkTexts(el);
  for(let i = t.length - 1; i >= 0 && n > 0; i--){
    const take = Math.min(n, t[i].nodeValue.length);
    t[i].nodeValue = t[i].nodeValue.slice(0, t[i].nodeValue.length - take);
    n -= take;
    if(!t[i].nodeValue) t[i].remove();
  }
}
function mkEatBack(el){
  for(;;){
    let z = el.lastChild;
    while(z && z.lastChild) z = z.lastChild;
    if(!z) return;
    /* the empty half of a text node the range split: nothing, and in the way */
    if(z.nodeType === 3 && !z.nodeValue){ z.remove(); continue; }
    if(z.nodeType === 3 && z.nodeValue.slice(-1) === '\n'){
      z.nodeValue = z.nodeValue.slice(0, -1);
      if(!z.nodeValue) z.remove();
    } else if(z.nodeName === 'BR') z.remove();
    return;
  }
}

/* ---- compiled, and back again ---- */
function markNode(hit, frag, ate){
  if(hit.kind === 'rule'){
    const hr = document.createElement('hr');       // the dashes were the whole line
    hr.className = 'mkrule';
    hr.setAttribute('data-rule', hit.src);
    if(ate) hr.setAttribute('data-nl', '');
    return hr;
  }
  const d = document.createElement('div');
  const li = hit.kind === 'li';
  d.className = li ? 'mkli mkd' + hit.dep + (hit.task ? ' mktask' : '') + (hit.done ? ' done' : '')
                   : 'mkh mkh' + hit.lvl;
  d.setAttribute(li ? 'data-li' : 'data-head', hit.pre);   // the marker, exactly as typed
  if(ate) d.setAttribute('data-nl', '');
  d.appendChild(frag);
  mkEatFront(d, hit.pre.length);
  if(ate) mkEatBack(d);
  if(li && hit.task){                              // the box is the mark's, not the writing's
    const b = document.createElement('span');
    b.className = 'mkbox';
    b.setAttribute('role', 'checkbox');
    b.setAttribute('aria-checked', hit.done ? 'true' : 'false');
    b.title = 'Tick this off';
    d.insertBefore(b, d.firstChild);
  }
  return d;
}
function mkEmphNode(hit, frag){
  const e = document.createElement(hit.n === 1 ? 'i' : 'b');
  e.className = 'mke' + (hit.n === 1 ? ' mki' : hit.n === 2 ? ' mkb' : ' mkb mki');
  e.setAttribute('data-emph', hit.mk);             // the stars, exactly as typed
  e.appendChild(frag);
  mkEatFront(e, hit.n);
  mkEatEnd(e, hit.n);
  return e;
}
function mkArrow(){
  const a = document.createElement('span');
  a.className = 'mkarw';
  a.setAttribute('data-arw', '->');
  /* drawn, not typed: an arrow glyph is whatever the fallback face has, which in
     a serif or a handwriting box is a stranger. This one is the line-icon set's
     hand — one stroke and a head, in the ink around it — and it sits on the
     middle of the writing rather than up near the cap line */
  a.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
    'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<path d="M3.4 12h16"/><path d="M14.3 6.9l5.1 5.1-5.1 5.1"/></svg>';
  return a;
}
/* the line marks, back to front so earlier offsets hold. The flatten and the
   offsets are latex.js's — one text box, one way of reading it. */
function mkLines(root){
  const flat = mathFlat(root);
  const hits = markHits(flat.s);
  if(!hits.length) return;
  for(let i = hits.length - 1; i >= 0; i--){
    const h = hits[i];
    const a = mathSpot(flat.nodes, h.at);
    if(!a) continue;
    const r = document.createRange();
    try{ r.setStart(a[0], a[1]); }catch(e){ continue; }
    let ate = false;
    if(h.nl){                                      // the line's ending goes with the line
      const g = mathSpot(flat.nodes, h.end + 1);
      if(g){ try{ r.setEnd(g[0], g[1]); ate = true; }catch(e){} }
    }
    if(!ate){
      const b = mathSpot(flat.nodes, h.end);
      if(!b) continue;
      try{ r.setEnd(b[0], b[1]); }catch(e){ continue; }
    }
    r.insertNode(markNode(h, r.extractContents(), ate));
  }
}
/* the stars, once the lines are settled — a heading or a bullet may hold a bold
   phrase, and cutting the line out from under one first would move the ground */
function mkEmph(root){
  const flat = mathFlat(root);
  if(flat.s.indexOf('*') < 0) return;
  const hits = emphHits(flat.s);
  for(let i = hits.length - 1; i >= 0; i--){
    const h = hits[i];
    const a = mathSpot(flat.nodes, h.at), b = mathSpot(flat.nodes, h.end);
    if(!a || !b) continue;
    const r = document.createRange();
    try{ r.setStart(a[0], a[1]); r.setEnd(b[0], b[1]); }catch(e){ continue; }
    r.insertNode(mkEmphNode(h, r.extractContents()));
  }
}
/* the arrows, in a pass of their own once the lines are settled: an arrow sits
   inside a heading or a bullet, and compiling it first would move the ground
   under the line the heading is still to be cut from. */
function mkArrows(root){
  const flat = mathFlat(root);
  const s = flat.s;
  if(s.indexOf('->') < 0) return;
  const sealed = mkSeal(s, true);
  const at = [];
  for(let i = s.indexOf('->'); i >= 0; i = s.indexOf('->', i + 2))
    if(!sealed(i)) at.push(i);
  for(let k = at.length - 1; k >= 0; k--){
    const a = mathSpot(flat.nodes, at[k]), b = mathSpot(flat.nodes, at[k] + 2);
    if(!a || !b) continue;
    const r = document.createRange();
    try{ r.setStart(a[0], a[1]); r.setEnd(b[0], b[1]); }catch(e){ continue; }
    r.deleteContents();
    r.insertNode(mkArrow());
  }
}
/* compile every mark sitting in this element's text, in place */
function markify(root){
  if(!root) return root;
  const all = root.textContent || '';
  if(all.indexOf('#') < 0 && all.indexOf('-') < 0 && all.indexOf('*') < 0) return root;
  mkLines(root);
  mkEmph(root);
  mkArrows(root);
  return root;
}
/* put the hashes, the dashes and the brackets back, ready to be edited. Last of
   the three, so whatever a heading held is plain writing again by the time it
   is unwrapped. */
function unmarkify(root){
  if(!root) return root;
  root.querySelectorAll('[data-arw]').forEach(n =>
    n.replaceWith(document.createTextNode(n.getAttribute('data-arw') || '->')));
  root.querySelectorAll('[data-emph]').forEach(n => {
    const f = document.createDocumentFragment(), mk = n.getAttribute('data-emph') || '*';
    f.appendChild(document.createTextNode(mk));
    while(n.firstChild) f.appendChild(n.firstChild);
    f.appendChild(document.createTextNode(mk));
    n.replaceWith(f);
  });
  root.querySelectorAll('[data-rule]').forEach(n =>
    n.replaceWith(document.createTextNode((n.getAttribute('data-rule') || '---') +
                                          (n.hasAttribute('data-nl') ? '\n' : ''))));
  root.querySelectorAll('[data-li]').forEach(n => {
    n.querySelectorAll('.mkbox').forEach(b => b.remove());   // the box was never writing
    const f = document.createDocumentFragment();
    f.appendChild(document.createTextNode(n.getAttribute('data-li') || '- '));
    while(n.firstChild) f.appendChild(n.firstChild);
    if(n.hasAttribute('data-nl')) f.appendChild(document.createTextNode('\n'));
    n.replaceWith(f);
  });
  root.querySelectorAll('[data-head]').forEach(n => {
    const f = document.createDocumentFragment();
    f.appendChild(document.createTextNode(n.getAttribute('data-head') || '# '));
    while(n.firstChild) f.appendChild(n.firstChild);
    if(n.hasAttribute('data-nl')) f.appendChild(document.createTextNode('\n'));
    n.replaceWith(f);
  });
  root.normalize();
  return root;
}

/* ---- ticking a task off ----
   The box is not writing, so it is not edited: it is clicked, and what changes
   is the one bracket in the source the line was compiled from. The box it sits
   in is then told the way a keystroke tells it — every writing surface saves
   itself on `input` — so nothing here needs to know whose writing this is.
   Delegated, because these come and go with every rebuild of a page. */
function markTick(li){
  const pre = li.getAttribute('data-li') || '';
  if(!/\[[ xX\u00a0]\]/.test(pre)) return;
  const done = !li.classList.contains('done');
  li.setAttribute('data-li', pre.replace(/\[[ xX\u00a0]\]/, done ? '[x]' : '[ ]'));
  li.classList.toggle('done', done);
  const box = li.querySelector('.mkbox');
  if(box) box.setAttribute('aria-checked', done ? 'true' : 'false');
  const surface = li.closest('.txt,.dtxt,.dot');
  if(surface) surface.dispatchEvent(new Event('input', { bubbles: true }));
  if(typeof SND === 'object' && SND.tick) SND.tick();
}
/* the pointer is caught in the capture phase: the item underneath would
   otherwise take it as the start of a drag before the click ever landed */
document.addEventListener('pointerdown', e => {
  if(e.target.closest && e.target.closest('.mkbox')){ e.stopPropagation(); e.preventDefault(); }
}, true);
document.addEventListener('click', e => {
  const b = e.target.closest && e.target.closest('.mkbox');
  if(!b) return;
  const li = b.closest('[data-li]');
  if(!li || !li.closest('.txt,.dtxt,.dot')) return;
  e.stopPropagation(); e.preventDefault();
  markTick(li);
}, true);
document.addEventListener('dblclick', e => {
  if(e.target.closest && e.target.closest('.mkbox')) e.stopPropagation();
}, true);

/* ---- how it looks ----
   Sized in `em`, so a heading is a heading of whatever it is written in, and
   the family is the box's own — the step is size and weight, never a different
   face. The bullets are drawn rather than typed for the same reason: a dot is a
   dot in a font that has no glyph for one. */
addCSS('marks', `
.mkh{display:block;font-weight:700;line-height:1.16;margin:.55em 0 .2em;text-transform:none}
.mkh:first-child{margin-top:0}
.mkh1{font-size:1.7em;letter-spacing:-.005em}
.mkh2{font-size:1.34em}
.mkh3{font-size:1.12em}
/* a rule across the writing, fading out at both ends. Its thickness is the
   sheet's, not the screen's — a hairline drawn in css pixels all but vanishes
   on a sheet that has been zoomed out */
hr.mkrule{display:block;border:0;margin:.8em 0;
  height:max(1px,calc(var(--scale)*1.4px));
  background:linear-gradient(90deg,transparent,
    color-mix(in srgb,var(--ink) 30%,transparent) 10%,
    color-mix(in srgb,var(--ink) 30%,transparent) 90%,transparent)}
/* a bullet, and the hairline that says where a nested one came from. The line
   is painted as the row's own background — one layer per level above it, each
   the width of a hairline and none of them tall enough to stop — so a run of
   nested rows draws one unbroken line down from the bullet they belong to,
   which is why the rows are spaced with padding rather than margin. Six flat
   layers rather than one repeating gradient: a gradient that has to repeat on
   a fractional step drops stripes when the sheet is scaled. */
.mkli{--mkd:0;--mkin:1.15em;--mkbar:max(1px,calc(var(--scale)*1px));
  --mkg:color-mix(in srgb,var(--ink) 20%,transparent);
  --b1:0;--b2:0;--b3:0;--b4:0;--b5:0;--b6:0;
  position:relative;display:block;line-height:1.4;padding:.09em 0 .09em calc((var(--mkd) + 1)*var(--mkin));
  background-repeat:no-repeat;
  background-image:linear-gradient(var(--mkg),var(--mkg)),linear-gradient(var(--mkg),var(--mkg)),
    linear-gradient(var(--mkg),var(--mkg)),linear-gradient(var(--mkg),var(--mkg)),
    linear-gradient(var(--mkg),var(--mkg)),linear-gradient(var(--mkg),var(--mkg));
  background-size:var(--b1) 100%,var(--b2) 100%,var(--b3) 100%,
    var(--b4) 100%,var(--b5) 100%,var(--b6) 100%;
  background-position:calc(var(--mkin)*.42) 0,calc(var(--mkin)*1.42) 0,calc(var(--mkin)*2.42) 0,
    calc(var(--mkin)*3.42) 0,calc(var(--mkin)*4.42) 0,calc(var(--mkin)*5.42) 0}
.mkd1{--mkd:1;--b1:var(--mkbar)}
.mkd2{--mkd:2;--b1:var(--mkbar);--b2:var(--mkbar)}
.mkd3{--mkd:3;--b1:var(--mkbar);--b2:var(--mkbar);--b3:var(--mkbar)}
.mkd4{--mkd:4;--b1:var(--mkbar);--b2:var(--mkbar);--b3:var(--mkbar);--b4:var(--mkbar)}
.mkd5{--mkd:5;--b1:var(--mkbar);--b2:var(--mkbar);--b3:var(--mkbar);--b4:var(--mkbar);--b5:var(--mkbar)}
.mkd6{--mkd:6;--b1:var(--mkbar);--b2:var(--mkbar);--b3:var(--mkbar);--b4:var(--mkbar);--b5:var(--mkbar);--b6:var(--mkbar)}
.mkli::before{content:"";position:absolute;width:.28em;height:.28em;border-radius:50%;
  left:calc(var(--mkd)*var(--mkin) + var(--mkin)*.42 - .14em);top:calc(.09em + .7em - .14em);
  background:currentColor;opacity:.65}
.mkli:not(.mkd0)::before{background:transparent;opacity:.5;
  box-shadow:inset 0 0 0 var(--mkbar) currentColor}
.mktask::before{display:none}
/* the box: absolutely placed, so a line struck through does not run over it */
.mkbox{position:absolute;width:.74em;height:.74em;border-radius:.16em;cursor:pointer;
  left:calc(var(--mkd)*var(--mkin) + var(--mkin)*.42 - .37em);top:calc(.09em + .7em - .37em);
  box-shadow:inset 0 0 0 var(--mkbar) currentColor;opacity:.55;
  display:grid;place-items:center;-webkit-user-select:none;user-select:none}
.mkbox:hover{opacity:.9}
.mktask.done .mkbox{background:var(--accent2);box-shadow:none;opacity:1}
.mktask.done .mkbox::after{content:"✓";color:#fff;font-family:var(--mono);font-weight:700;font-size:.58em;line-height:1}
.mktask.done{text-decoration:line-through;opacity:.55}
/* bold and italic. A relative weight rather than a number: it is a step up from
   whatever the box is set in, so a heading that is already heavy gets heavier */
.mkb{font-weight:bolder}
.mki{font-style:italic}
/* an arrow written as two keystrokes, drawn at the height of the writing */
.mkarw{display:inline-block;width:1em;height:1em;margin:0 .08em;vertical-align:middle;
  -webkit-user-select:none;user-select:none}
.mkarw svg{display:block;width:100%;height:100%}
/* handwriting on a highlighter runs inline: a mark inside one takes what it needs */
.st-marker .mkh,.st-marker .mkli{display:inline-block;vertical-align:top}
.st-marker hr.mkrule{display:inline-block;width:100%;vertical-align:middle}
@media print{ .mkbox{cursor:default} }
`);
