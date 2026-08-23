/* Open Note — chrome/mathpad.js
   writing maths: what a $ does, what the list under the caret offers, and the
   formula typeset while it is still being typed.

   Everything a writing box does *while* maths is being written lives here.
   Three things, one panel:

     $     pairs itself — $|$ — and a second $ inside that pair opens it out
           into a display block on three lines, the caret on the middle one. A
           ` pairs itself the same way, by the rules in lib/ticks.js — the pad
           itself stays out of it, since code is not typeset.
     \…    a list of every command the compiler knows, narrowed as the letters
           come in, walked with ↑ ↓ and taken with ⏎ or ⇥. \frac arrives as
           \frac{}{} with the caret in the first pair, and ⇥ walks the rest.
     the panel typesets the formula the caret is standing in on every
           keystroke, so the answer is on screen before the box is left.

   Which boxes get all this is the registry's business — defineMathBox(). The
   rules themselves are plain functions over (text, offset) with no DOM in
   sight, which is what makes them checkable: a headless browser never gives
   the caret focus, so the harness drives the rules rather than the keyboard. */

/* ================= the rules =================
   All of these take the box's writing flattened to one string and an offset in
   it, and answer in the same terms: replace [from, to) with `text`, then put
   the caret `caret` characters into what was written. */
const MPAD_MARK = '\u0001';                  // where the caret lands in a snippet

/* what typing a $ does */
function mpadDollar(s, off){
  const b1 = s[off - 1], b2 = s[off - 2], a1 = s[off], a2 = s[off + 1];
  /* inside a code fence nothing is maths, so nothing pairs */
  if(tickInFence(s, off)) return { from: off, to: off, text: '$', caret: 1 };
  /* the second $ inside the pair the first one made: open it out onto three
     lines, and take the line to itself if there is writing either side */
  if(b1 === '$' && a1 === '$' && b2 !== '$' && a2 !== '$'){
    const ls = s.lastIndexOf('\n', off - 2) + 1, le = s.indexOf('\n', off + 1);
    const pre  = s.slice(ls, off - 1).trim() ? '\n' : '';
    const post = s.slice(off + 1, le < 0 ? s.length : le).trim() ? '\n' : '';
    return { from: off - 1, to: off + 1, text: pre + '$$\n\n$$' + post, caret: pre.length + 3 };
  }
  /* the closer is already there: step over it rather than adding another */
  if(a1 === '$') return { from: off, to: off, text: '', caret: a2 === '$' ? 2 : 1 };
  /* well inside a formula, a $ is a $ — pairing it would cut the formula in two */
  const r = mathRegion(s, off);
  if(r && r.shut && off > r.o && off < r.c) return { from: off, to: off, text: '$', caret: 1 };
  return { from: off, to: off, text: '$$', caret: 1 };
}

/* the \command being typed, if that is what is happening. \begin{ and \end{
   are asking a different question, so they say so. */
function mpadWord(s, off){
  const env = /\\(begin|end)\{([a-zA-Z]*)$/.exec(s.slice(0, off));
  if(env) return { kind:'env', at: off - env[2].length, word: env[2], of: env[1] };
  let i = off;
  while(i > 0 && /[a-zA-Z]/.test(s[i - 1])) i--;
  if(s[i - 1] !== '\\') return null;
  return { kind:'cs', at: i - 1, word: s.slice(i, off), of: '' };
}

/* the next empty {} or [] after the caret, still inside this formula — where ⇥
   goes once a snippet has landed */
function mpadSlot(s, off, end){
  for(let i = off; i < end - 1; i++)
    if((s[i] === '{' && s[i + 1] === '}') || (s[i] === '[' && s[i + 1] === ']')) return i + 1;
  return -1;
}

/* a snippet split into what is written and where the caret goes: the mark if
   it carries one, else the first empty pair of brackets, else the end */
function mpadCut(ins){
  const m = ins.indexOf(MPAD_MARK);
  if(m >= 0) return { text: ins.slice(0, m) + ins.slice(m + 1), caret: m };
  const a = ins.indexOf('{}'), b = ins.indexOf('[]');
  const at = a < 0 ? b : b < 0 ? a : Math.min(a, b);
  return { text: ins, caret: at < 0 ? ins.length : at + 1 };
}

/* The formula the caret is in, for the editor's purposes rather than the
   compiler's: an empty pair the caret was just dropped into is a formula too,
   and one still missing its closer is not. */
function mpadRegion(s, off){
  if(s[off - 1] === '$' && s[off] === '$' && s[off - 2] !== '$' && s[off + 1] !== '$')
    return { a: off - 1, o: off, c: off, b: off + 1, open:1, close:1, shut:true, disp:false };
  const r = mathRegion(s, off);
  return r && r.shut ? r : null;
}

/* ================= what the list offers =================
   The commands that take an argument are written out; everything else is read
   off the compiler's own tables, so a symbol added there is offered here
   without anyone remembering to. `rank` is only a nudge for the order the list
   comes in before enough letters have been typed to settle it. */
const MPAD_SNIP = [
  { ins:'\\frac{}{}',        hint:'fraction',      pv:'\\frac{a}{b}',              rank:1 },
  { ins:'\\sqrt{}',          hint:'square root',   pv:'\\sqrt{x}',                 rank:2 },
  { ins:'\\sqrt[]{}',        hint:'nth root',      pv:'\\sqrt[3]{x}',              rank:21 },
  { ins:'\\sum_{}^{}',       hint:'sum',           pv:'\\sum_{i=1}^{n}',           rank:3 },
  { ins:'\\int_{}^{}',       hint:'integral',      pv:'\\int_{a}^{b}',             rank:4 },
  { ins:'\\prod_{}^{}',      hint:'product',       pv:'\\prod_{i=1}^{n}',          rank:16 },
  { ins:'\\lim_{ \\to }',    hint:'limit',         pv:'\\lim_{x \\to 0}',          rank:6 },
  { ins:'\\left(' + MPAD_MARK + '\\right)', hint:'grown brackets', pv:'\\left(\\frac{a}{b}\\right)', rank:7 },
  { ins:'\\left[' + MPAD_MARK + '\\right]', hint:'grown brackets', pv:'\\left[\\frac{a}{b}\\right]', rank:24 },
  { ins:'\\left\\{' + MPAD_MARK + '\\right\\}', hint:'grown braces', pv:'\\left\\{x\\right\\}', rank:25 },
  { ins:'\\left|' + MPAD_MARK + '\\right|', hint:'grown bars', pv:'\\left|\\frac{a}{b}\\right|', rank:26 },
  { ins:'\\text{}',          hint:'words',         pv:'\\text{if }x',              rank:8 },
  { ins:'\\begin{}',         hint:'environment',   pv:'\\begin{pmatrix}a\\\\b\\end{pmatrix}', rank:9 },
  { ins:'\\binom{}{}',       hint:'binomial',      pv:'\\binom{n}{k}',             rank:17 },
  { ins:'\\dfrac{}{}',       hint:'big fraction',  pv:'\\dfrac{a}{b}',             rank:18 },
  { ins:'\\tfrac{}{}',       hint:'small fraction',pv:'\\tfrac{a}{b}',             rank:19 },
  { ins:'\\cfrac{}{}',       hint:'stacked fraction', pv:'\\cfrac{a}{b}',          rank:20 },
  { ins:'\\overline{}',      hint:'overline',      pv:'\\overline{AB}',            rank:22 },
  { ins:'\\underline{}',     hint:'underline',     pv:'\\underline{AB}',           rank:23 },
  { ins:'\\overbrace{}',     hint:'brace over',    pv:'\\overbrace{a+b}',          rank:27 },
  { ins:'\\underbrace{}',    hint:'brace under',   pv:'\\underbrace{a+b}',         rank:28 },
  { ins:'\\operatorname{}',  hint:'named operator',pv:'\\operatorname{sgn}',       rank:29 },
  { ins:'\\rm{}',            hint:'upright',       pv:'\\rm{d}x',                  rank:15 },
  { ins:'\\mathbf{}',        hint:'bold',          pv:'\\mathbf{v}',               rank:15 },
  { ins:'\\mathit{}',        hint:'italic',        pv:'\\mathit{x}',               rank:31 },
  { ins:'\\mathsf{}',        hint:'sans serif',    pv:'\\mathsf{T}',               rank:32 },
  { ins:'\\mathtt{}',        hint:'typewriter',    pv:'\\mathtt{x}',               rank:33 },
  { ins:'\\boldsymbol{}',    hint:'bold',          pv:'\\boldsymbol{\\omega}',     rank:34 }
];
/* the greek letters out of TEX_MI, which is otherwise a bag of odd symbols */
const MPAD_GREEK = /^(alpha|beta|gamma|delta|epsilon|varepsilon|zeta|eta|theta|vartheta|iota|kappa|lambda|mu|nu|xi|pi|varpi|rho|varrho|sigma|varsigma|tau|upsilon|phi|varphi|chi|psi|omega|Gamma|Delta|Theta|Lambda|Xi|Pi|Sigma|Upsilon|Phi|Psi|Omega)$/;
const MPAD_REL = ' le leq ge geq ne neq equiv approx cong sim simeq propto ll gg prec succ in notin ni ' +
  'subset supset subseteq supseteq mid parallel perp ';
const mpadKind = k => /arrow|^(to|gets|mapsto|iff|implies)$/.test(k) ? 'arrow'
  : MPAD_REL.indexOf(' ' + k + ' ') >= 0 ? 'relation' : 'operator';
const MPAD_MAX = 48;                         // how far the list is worth going

let MPAD_ALL = null;
function mpadAll(){
  if(MPAD_ALL) return MPAD_ALL;
  const out = [], seen = {};
  const add = (cs, ins, hint, ch, pv, rank) => {
    if(seen[ins]) return;
    seen[ins] = 1;
    out.push({ cs, ins, lab: ins.split(MPAD_MARK).join(''), hint, ch: ch || '', pv: pv || '', rank });
  };
  MPAD_SNIP.forEach(e => add(/^\\([a-zA-Z]+)/.exec(e.ins)[1], e.ins, e.hint, '', e.pv, e.rank));
  for(const k in TEX_ACC) add(k, '\\' + k + '{}', 'accent', '', '\\' + k + '{x}', 30);
  for(const k in TEX_VAR) add(k, '\\' + k + '{}', 'letter style', '', '\\' + k + '{R}', 14);
  for(const k in TEX_BIG) add(k, '\\' + k, 'big operator', TEX_BIG[k], '', 12);
  TEX_FN.forEach(k => add(k, '\\' + k, 'function', '', '\\' + k, 11));
  for(const k in TEX_MI) add(k, '\\' + k, MPAD_GREEK.test(k) ? 'greek' : 'symbol', TEX_MI[k], '',
    MPAD_GREEK.test(k) ? 10 : 35);
  for(const k in TEX_MO) add(k, '\\' + k, mpadKind(k), TEX_MO[k], '', 36);
  for(const k in TEX_FENCE) if(/^[a-zA-Z]/.test(k)) add(k, '\\' + k, 'bracket', TEX_FENCE[k], '', 40);
  for(const k in TEX_SPC)   if(/^[a-zA-Z]/.test(k)) add(k, '\\' + k, 'space', '␣', '', 60);
  MPAD_ALL = out;
  return out;
}

/* what a half-typed word matches, best first: the ones that start with exactly
   what was typed, then the ones that start with it in any case, then the ones
   that merely carry it */
function mpadMatch(word, kind){
  if(kind === 'env'){
    const lo = word.toLowerCase(), out = [];
    for(const k in TEX_ENV)
      if(!word || k.toLowerCase().indexOf(lo) === 0)
        out.push({ cs:k, lab:k, hint:'environment', ch:'', pv:'', env:true });
    return out.sort((a, b) => a.cs.length - b.cs.length || (a.cs < b.cs ? -1 : 1)).slice(0, MPAD_MAX);
  }
  const lo = word.toLowerCase(), hit = [];
  for(const e of mpadAll()){
    const s = !word ? 0
      : e.cs.indexOf(word) === 0 ? 0
      : e.cs.toLowerCase().indexOf(lo) === 0 ? 1
      : e.cs.toLowerCase().indexOf(lo) > 0 ? 2 : -1;
    if(s >= 0) hit.push({ e, s });
  }
  hit.sort((a, b) => a.s - b.s || a.e.rank - b.e.rank || a.e.cs.length - b.e.cs.length ||
                     (a.e.cs < b.e.cs ? -1 : a.e.cs > b.e.cs ? 1 : 0));
  return hit.slice(0, MPAD_MAX).map(h => h.e);
}

/* ================= the box under the caret ================= */
const MPAD = { box:null, list:[], i:0, at:0, word:'', of:'', s:'', off:0, reg:null,
               on:false, mute:false, sig:'' };

function mpadBox(){
  const a = document.activeElement, sel = mathBoxSel();
  if(!a || !sel || !a.isContentEditable || !a.closest) return null;
  return a.closest(sel);
}
/* where the caret is, in the flattened writing — and where the other end of a
   selection is, when there is one */
function mpadCaret(box){
  const s = getSelection();
  if(!s.rangeCount) return null;
  const r = s.getRangeAt(0);
  if(!box.contains(r.startContainer) || !box.contains(r.endContainer)) return null;
  const a = mathFlatOff(box, r.startContainer, r.startOffset);
  return { a, b: r.collapsed ? a : mathFlatOff(box, r.endContainer, r.endOffset) };
}
/* replace [from, to) with `text` and leave the caret `caret` into it.
   execCommand keeps the browser's own undo — and fires the `input` the item is
   listening on to save itself — so it is tried before the hands-on path. */
function mpadPut(box, from, to, text, caret){
  const sel = getSelection(), r = document.createRange();
  const A = mathFlatPos(box, from), B = mathFlatPos(box, to);
  try{ r.setStart(A[0], A[1]); r.setEnd(B[0], B[1]); }catch(e){ return; }
  sel.removeAllRanges(); sel.addRange(r);
  if(text || from !== to){
    let done = false;
    try{ done = document.execCommand('insertText', false, text); }catch(e){}
    if(!done){
      r.deleteContents();
      if(text) r.insertNode(document.createTextNode(text));
      box.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }
  mpadTo(box, from + caret);
}
function mpadTo(box, off){
  const P = mathFlatPos(box, off), r = document.createRange(), sel = getSelection();
  try{ r.setStart(P[0], P[1]); }catch(e){ return; }
  r.collapse(true);
  sel.removeAllRanges(); sel.addRange(r);
}
/* …and the same for a run of it, which is what a re-indented block needs so
   that the next ⇥ still has it picked out */
function mpadPick(box, a, b){
  const A = mathFlatPos(box, a), B = mathFlatPos(box, b), r = document.createRange(), sel = getSelection();
  try{ r.setStart(A[0], A[1]); r.setEnd(B[0], B[1]); }catch(e){ return mpadTo(box, b); }
  sel.removeAllRanges(); sel.addRange(r);
}

/* ================= the panel ================= */
function mpadEl(){
  let d = $('#mathpad');
  if(d) return d;
  d = document.createElement('div');
  d.id = 'mathpad';
  d.className = 'mathpad glass';
  d.innerHTML = '<div class="mppv"></div><div class="mpmsg"></div><ul class="mplist"></ul>';
  document.body.appendChild(d);
  /* the panel is never focused — the caret it is describing must stay put */
  d.addEventListener('pointerdown', e => e.preventDefault());
  d.addEventListener('click', e => {
    const li = e.target.closest('li');
    if(!li) return;
    MPAD.i = +li.dataset.i;
    mpadTake();
  });
  return d;
}
/* the formula as it stands. A half-typed command does not compile, so the last
   one that did stays on screen, dimmed, with what is wrong under it — the
   picture flickering between a fraction and an error on every letter is worse
   than useless. */
function mpadDraw(body, disp){
  const el = mpadEl(), pv = el.querySelector('.mppv'), msg = el.querySelector('.mpmsg');
  if(!body.trim()){
    pv.className = 'mppv dim';
    pv.textContent = 'nothing yet';
    msg.textContent = '';
    mpadFit();
    return;
  }
  let node = null, err = '';
  try{ node = texCompile(body, !!disp); }
  catch(e){ err = (e && e.message) || 'this formula does not compile'; }
  if(node){
    pv.className = 'mppv';
    pv.innerHTML = '';
    pv.appendChild(node);
    msg.textContent = '';
    mpadFit();
  } else if(pv.querySelector('math')){
    pv.className = 'mppv stale';                     // the last good picture, held
    msg.textContent = err;
  } else {
    pv.className = 'mppv';                           // nothing to hold yet: the message alone
    pv.textContent = '';
    msg.textContent = err;
    mpadFit();
  }
}
/* The pad is as wide as the equation in it, between a floor that keeps the list
   readable and a ceiling that keeps it off the whole desk. Measured off the
   <math> itself rather than off the scroll box, which cannot tell "the content
   is this wide" from "the box is this wide" and so could never shrink again.
   Because the pad is centred on its box, growing moves both edges by the same
   half and the middle of the picture stays exactly where it was. */
const MPAD_W = 340;
const mpadWMax = () => Math.min(860, innerWidth - 32);
function mpadFit(){
  const el = mpadEl(), m = el.querySelector('.mppv').firstElementChild;
  const need = m ? Math.ceil(m.getBoundingClientRect().width) + 36 : 0;
  el.style.width = clamp(need, Math.min(MPAD_W, mpadWMax()), mpadWMax()) + 'px';
}
function mpadRows(){
  const el = mpadEl(), ul = el.querySelector('.mplist');
  const sig = MPAD.list.map(e => e.lab).join(' ');
  if(sig !== MPAD.sig){
    MPAD.sig = sig;
    ul.innerHTML = MPAD.list.map((e, i) =>
      '<li data-i="' + i + '"><span class="mplab">' + esc(e.lab) + '</span>' +
      '<span class="mphint">' + esc(e.hint) + '</span>' +
      '<span class="mpch"></span></li>').join('');
    [...ul.children].forEach((li, i) => {
      const e = MPAD.list[i], cell = li.querySelector('.mpch');
      if(e.ch){ cell.textContent = e.ch; return; }
      if(!e.pv) return;
      if(e.node === undefined){
        try{ e.node = texCompile(e.pv, false); }catch(err){ e.node = null; }
      }
      if(e.node) cell.appendChild(e.node.cloneNode(true));
    });
  }
  [...ul.children].forEach((li, i) => li.classList.toggle('on', i === MPAD.i));
  const on = ul.children[MPAD.i];
  if(on){
    const t = on.offsetTop, b = t + on.offsetHeight;
    if(t < ul.scrollTop) ul.scrollTop = t;
    else if(b > ul.scrollTop + ul.clientHeight) ul.scrollTop = b - ul.clientHeight;
  }
  ul.style.display = MPAD.list.length ? '' : 'none';
}
/* Under the caret's line, or over it when the desk runs out underneath — but
   centred on the *box*, not on the caret. Sideways it therefore stands still
   while the line is being typed; a panel sliding a letter to the right on every
   keystroke is unreadable, which is the whole thing it is there to be. */
function mpadPlace(){
  const el = mpadEl(), sel = getSelection();
  if(!sel.rangeCount) return null;
  let r = sel.getRangeAt(0).getBoundingClientRect();
  const box = MPAD.box.getBoundingClientRect();
  if(!r || (!r.height && !r.top && !r.left)) r = box;
  const w = el.offsetWidth, h = el.offsetHeight;
  let y = r.bottom + 10;
  if(y + h > innerHeight - 8) y = Math.max(8, r.top - h - 10);
  el.style.left = clamp(box.left + box.width / 2 - w / 2, 8, Math.max(8, innerWidth - w - 8)) + 'px';
  el.style.top  = clamp(y, 8, Math.max(8, innerHeight - h - 8)) + 'px';
  return r;
}
/* back into the caret it came out of. The class only goes if it is still gone
   when the warp lands — a keystroke can bring the pad back inside a frame. */
function mpadHide(){
  if(!MPAD.on) return;
  MPAD.on = false;
  MPAD.list = []; MPAD.sig = ' none';
  const el = mpadEl();
  warpOut(el, () => { if(!MPAD.on) el.classList.remove('open'); });
}

/* everything above, answered again: which box, which formula, which word */
function mpadSync(){
  const box = mpadBox();
  if(!box || !document.contains(box)) return mpadHide();
  const c = mpadCaret(box);
  if(!c || c.a !== c.b) return mpadHide();
  const flat = mathFlat(box);
  if(tickInFence(flat.s, c.a)) return mpadHide();      // that is code, not a formula
  const reg = mpadRegion(flat.s, c.a);
  if(!reg) return mpadHide();
  if(c.a !== MPAD.off || box !== MPAD.box) MPAD.mute = false;   // a moved caret is asking again
  MPAD.box = box; MPAD.s = flat.s; MPAD.off = c.a; MPAD.reg = reg;

  const w = MPAD.mute ? null : mpadWord(flat.s, c.a);
  const was = MPAD.at + ' ' + MPAD.word + ' ' + MPAD.of;
  MPAD.at = w ? w.at : -1; MPAD.word = w ? w.word : ''; MPAD.of = w ? w.of : '';
  MPAD.list = w ? mpadMatch(w.word, w.kind) : [];
  if(was !== MPAD.at + ' ' + MPAD.word + ' ' + MPAD.of) MPAD.i = 0;
  MPAD.i = clamp(MPAD.i, 0, Math.max(0, MPAD.list.length - 1));

  const el = mpadEl();
  mpadDraw(flat.s.slice(reg.o, reg.c), reg.disp);
  mpadRows();
  if(!MPAD.on){
    MPAD.on = true;
    el.classList.add('open');
    const r = mpadPlace();
    warpIn(el, r ? r.left : 0, r ? r.bottom : 0);
  } else mpadPlace();
}
let MPAD_T = 0;
function mpadSoon(){
  if(MPAD_T) return;
  MPAD_T = requestAnimationFrame(() => { MPAD_T = 0; mpadSync(); });
}
function mpadMove(d){
  if(!MPAD.list.length) return;
  const n = MPAD.list.length;
  MPAD.i = (MPAD.i + d % n + n) % n;
  mpadRows();
}
/* take what is picked out of the list */
function mpadTake(){
  const box = MPAD.box, e = MPAD.list[MPAD.i];
  if(!box || !e || MPAD.at < 0) return;
  let from, to, ins;
  if(e.env){
    from = MPAD.at;
    to = MPAD.at + MPAD.word.length + (MPAD.s[MPAD.at + MPAD.word.length] === '}' ? 1 : 0);
    ins = MPAD.of === 'end' ? e.cs + '}'
        : e.cs + '}\n' + MPAD_MARK + '\n\\end{' + e.cs + '}';
  } else {
    from = MPAD.at;
    to = MPAD.at + MPAD.word.length + 1;             // the \ as well as the letters
    ins = e.ins;
  }
  const cut = mpadCut(ins);
  MPAD.list = []; MPAD.sig = ' none';                // the preview carries straight on
  mpadPut(box, from, to, cut.text, cut.caret);
  mpadSoon();
}

/* ================= the keyboard =================
   All of it in the capture phase: a table cell would otherwise walk its cursor
   on ↓, and a card would commit on ⏎, before the list ever saw the key. */
document.addEventListener('keydown', e => {
  if(e.ctrlKey || e.metaKey || e.altKey) return;
  if(!MPAD.on || mpadBox() !== MPAD.box) return;
  const stop = () => { e.preventDefault(); e.stopPropagation(); };
  if(MPAD.list.length){
    if(e.key === 'ArrowDown'){ stop(); return mpadMove(1); }
    if(e.key === 'ArrowUp'  ){ stop(); return mpadMove(-1); }
    if(e.key === 'PageDown' ){ stop(); return mpadMove(6); }
    if(e.key === 'PageUp'   ){ stop(); return mpadMove(-6); }
    if(e.key === 'Enter' || e.key === 'Tab'){ stop(); return mpadTake(); }
    /* the list goes; the picture stays, and a second Escape leaves the box */
    if(e.key === 'Escape'){
      stop();
      MPAD.mute = true; MPAD.list = []; MPAD.sig = ' none';
      mpadRows(); mpadPlace();
      return;
    }
  }
  /* with no list up, ⇥ walks the empty slots a snippet left behind */
  if(e.key === 'Tab' && MPAD.reg){
    const to = mpadSlot(MPAD.s, MPAD.off, MPAD.reg.c);
    if(to >= 0){ stop(); mpadTo(MPAD.box, to); mpadSoon(); }
  }
}, true);

/* $ and ` are intercepted before they are typed, so that what lands is the
   pair. The rule for each is its own — mpadDollar() here, tickTick() in
   lib/ticks.js — but putting it into the box is the same job either way. */
document.addEventListener('beforeinput', e => {
  if(e.inputType !== 'insertText' || (e.data !== '$' && e.data !== '`')) return;
  const box = mpadBox();
  if(!box) return;
  const c = mpadCaret(box);
  if(!c) return;
  e.preventDefault();
  const s = mathFlat(box).s;
  if(c.a !== c.b){                                   // a pair around what is picked
    const t = s.slice(c.a, c.b);
    mpadPut(box, c.a, c.b, e.data + t + e.data, t.length + 2);
  } else {
    const d = e.data === '$' ? mpadDollar(s, c.a) : tickTick(s, c.a);
    mpadPut(box, d.from, d.to, d.text, d.caret);
  }
  MPAD.mute = false;
  mpadSoon();
}, true);

document.addEventListener('input', () => { MPAD.mute = false; mpadSoon(); }, true);
document.addEventListener('selectionchange', mpadSoon);
document.addEventListener('focusin', () => { MPAD.mute = false; mpadSoon(); });
document.addEventListener('focusout', () => requestAnimationFrame(() => { if(!mpadBox()) mpadHide(); }));
window.addEventListener('scroll', () => { if(MPAD.on) mpadPlace(); }, true);
window.addEventListener('resize', () => { if(MPAD.on){ mpadFit(); mpadPlace(); } });
onNoteOpen(() => mpadHide());

/* ---- how it looks ---- */
addCSS('mathpad', `
/* ---------- the maths pad — what floats under the caret while maths is typed ---------- */
/* The width is mpadFit()'s to set — this is only the floor it starts at.
   Centred on its box, so the pad grows and shrinks about a point that never
   moves; a label longer than it is cut with an ellipsis rather than pushing it
   wider, since the equation is what the width is for. */
.mathpad{position:fixed;z-index:84;display:none;width:min(340px,92vw);
  border-radius:13px;padding:8px 9px;font-family:var(--mono);will-change:transform,filter,opacity}
.mathpad.open{display:block}
.mppv{min-height:2.1em;display:flex;align-items:center;justify-content:center;
  padding:5px 8px 7px;overflow-x:auto;color:#f4f5f9;
  font-family:"Latin Modern Math","STIX Two Math","Cambria Math","Noto Sans Math",math,serif}
/* never squeezed: the picture keeps its natural width, which is what mpadFit()
   measures, and only an equation past the ceiling ever scrolls */
.mppv>*{flex:none}
.mppv math{font-size:19px}
.mppv:empty{display:none}
.mppv.stale{opacity:.3}
.mppv.dim{font-family:var(--mono);font-size:9px;letter-spacing:.16em;text-transform:uppercase;
  color:rgba(233,234,239,.3)}
.mpmsg{font-size:9px;letter-spacing:.06em;color:var(--accent);text-align:center;padding:0 6px 2px}
.mpmsg:empty{display:none}
.mplist{list-style:none;margin:6px 0 0;padding:5px 0 0;max-height:214px;overflow-y:auto;
  border-top:1px solid rgba(255,255,255,.08)}
/* the two things that can scroll do it in the pad's own colours — a system
   scrollbar across a dark glass panel is a white bar and nothing else */
.mppv,.mplist{scrollbar-width:thin;scrollbar-color:rgba(255,255,255,.24) transparent}
.mppv::-webkit-scrollbar,.mplist::-webkit-scrollbar{width:8px;height:8px}
.mppv::-webkit-scrollbar-track,.mplist::-webkit-scrollbar-track{background:transparent}
.mppv::-webkit-scrollbar-thumb,.mplist::-webkit-scrollbar-thumb{
  background:rgba(255,255,255,.24);border-radius:4px}
.mplist li{display:grid;grid-template-columns:1fr auto 1.7em;gap:10px;align-items:center;
  padding:3px 7px;border-radius:7px;cursor:pointer;color:rgba(233,234,239,.78)}
.mplist li.on{background:rgba(255,255,255,.11);color:#fff}
.mplab{min-width:0;font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.mphint{font-size:8px;letter-spacing:.13em;text-transform:uppercase;opacity:.42;white-space:nowrap}
.mpch{text-align:center;font-size:13px;
  font-family:"Latin Modern Math","STIX Two Math","Cambria Math","Noto Sans Math",math,serif}
.mpch math{font-size:13px}
@media (pointer:coarse){
  .mplist{max-height:44vh}
  .mplist li{padding:7px}
}
`);
