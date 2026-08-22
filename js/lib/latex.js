/* Open Note — lib/latex.js
   LaTeX to MathML — no library, no download */

/* ================= LaTeX → MathML =================
   $$…$$ typed in any text box is compiled when you leave the box. A small
   hand-written TeX subset is turned into MathML and the browser lays it out —
   no library, works offline, and it survives into print and exported books
   as plain markup. The source stays in the item, so it is always editable. */
const MMLNS = 'http://www.w3.org/1998/Math/MathML';
const TEX_MI = {                                   /* letter-like → <mi> */
  alpha:'α',beta:'β',gamma:'γ',delta:'δ',epsilon:'ϵ',varepsilon:'ε',zeta:'ζ',eta:'η',theta:'θ',vartheta:'ϑ',
  iota:'ι',kappa:'κ',lambda:'λ',mu:'μ',nu:'ν',xi:'ξ',pi:'π',varpi:'ϖ',rho:'ρ',varrho:'ϱ',sigma:'σ',varsigma:'ς',
  tau:'τ',upsilon:'υ',phi:'ϕ',varphi:'φ',chi:'χ',psi:'ψ',omega:'ω',
  Gamma:'Γ',Delta:'Δ',Theta:'Θ',Lambda:'Λ',Xi:'Ξ',Pi:'Π',Sigma:'Σ',Upsilon:'Υ',Phi:'Φ',Psi:'Ψ',Omega:'Ω',
  ell:'ℓ',hbar:'ℏ',imath:'ı',jmath:'ȷ',aleph:'ℵ',wp:'℘',Re:'ℜ',Im:'ℑ',
  infty:'∞',partial:'∂',nabla:'∇',emptyset:'∅',varnothing:'∅'
};
const TEX_MO = {                                   /* operators & relations → <mo> */
  times:'×',div:'÷',pm:'±',mp:'∓',cdot:'⋅',ast:'∗',star:'⋆',circ:'∘',bullet:'∙',odot:'⊙',
  le:'≤',leq:'≤',ge:'≥',geq:'≥',ne:'≠',neq:'≠',equiv:'≡',approx:'≈',cong:'≅',sim:'∼',simeq:'≃',
  propto:'∝',ll:'≪',gg:'≫',prec:'≺',succ:'≻',
  in:'∈',notin:'∉',ni:'∋',subset:'⊂',supset:'⊃',subseteq:'⊆',supseteq:'⊇',
  cup:'∪',cap:'∩',setminus:'∖',oplus:'⊕',ominus:'⊖',otimes:'⊗',
  wedge:'∧',land:'∧',vee:'∨',lor:'∨',neg:'¬',lnot:'¬',forall:'∀',exists:'∃',nexists:'∄',
  to:'→',rightarrow:'→',longrightarrow:'⟶',Rightarrow:'⇒',implies:'⟹',leftarrow:'←',gets:'←',Leftarrow:'⇐',
  leftrightarrow:'↔',Leftrightarrow:'⇔',iff:'⟺',mapsto:'↦',uparrow:'↑',downarrow:'↓',
  ldots:'…',dots:'…',cdots:'⋯',vdots:'⋮',ddots:'⋱',
  mid:'∣',parallel:'∥',perp:'⊥',top:'⊤',bot:'⊥',angle:'∠',degree:'°',prime:'′',
  therefore:'∴',because:'∵',colon:':',bmod:'mod'
};
const TEX_BIG = { sum:'∑',prod:'∏',coprod:'∐',bigcup:'⋃',bigcap:'⋂',bigoplus:'⨁',bigotimes:'⨂',
  bigvee:'⋁',bigwedge:'⋀',int:'∫',iint:'∬',iiint:'∭',oint:'∮' };
const TEX_INT = { int:1, iint:1, iiint:1, oint:1 };  /* integrals keep their limits on the side */
const TEX_FN = ('arccos arcsin arctan arg cos cosh cot coth csc deg det dim exp gcd hom inf ker lg lim ' +
  'liminf limsup ln log max min Pr sec sin sinh sup tan tanh').split(' ');
const TEX_FN_LIM = { lim:1,liminf:1,limsup:1,max:1,min:1,sup:1,inf:1,det:1,gcd:1,Pr:1 };
const TEX_ACC = { hat:'ˆ',widehat:'^',check:'ˇ',tilde:'˜',widetilde:'~',acute:'´',grave:'`',
  dot:'˙',ddot:'¨',breve:'˘',bar:'‾',vec:'→',mathring:'˚' };
const TEX_FENCE = { '(':'(',')':')','[':'[',']':']','{':'{','}':'}','|':'∣','/':'/',backslash:'\\',
  langle:'⟨',rangle:'⟩',lfloor:'⌊',rfloor:'⌋',lceil:'⌈',rceil:'⌉',vert:'|',Vert:'‖',uparrow:'↑',downarrow:'↓' };
const TEX_SPC = { ',':'.167em', ':':'.222em', ';':'.278em', '!':'-.167em', ' ':'.25em',
  quad:'1em', qquad:'2em', enspace:'.5em', thinspace:'.167em' };
const TEX_ESC = { '%':'%','$':'$','&':'&','#':'#','_':'_','{':'{','}':'}' };
const TEX_ENV = { matrix:['',''], pmatrix:['(',')'], bmatrix:['[',']'], Bmatrix:['{','}'],
  vmatrix:['|','|'], Vmatrix:['‖','‖'], cases:['{',''], aligned:['',''], align:['',''],
  gathered:['',''], gather:['',''], array:['',''], smallmatrix:['',''] };
const TEX_VAR = {
  mathbb:  { at:0x1D538, ex:{ C:'ℂ',H:'ℍ',N:'ℕ',P:'ℙ',Q:'ℚ',R:'ℝ',Z:'ℤ' } },
  mathcal: { at:0x1D49C, ex:{ B:'ℬ',E:'ℰ',F:'ℱ',H:'ℋ',I:'ℐ',L:'ℒ',M:'ℳ',R:'ℛ',e:'ℯ',g:'ℊ',o:'ℴ' } },
  mathfrak:{ at:0x1D504, ex:{ C:'ℭ',H:'ℌ',I:'ℑ',R:'ℜ',Z:'ℨ' } }
};
const texHas = (o, k) => typeof o[k] === 'string';
const texOwn = (o, k) => Object.prototype.hasOwnProperty.call(o, k) ? o[k] : null;
function texEl(name, kids, attrs){
  const n = document.createElementNS(MMLNS, name);
  if(attrs) for(const k in attrs) n.setAttribute(k, attrs[k]);
  (kids || []).forEach(k => n.appendChild(typeof k === 'string' ? document.createTextNode(k) : k));
  return n;
}
function texVarChar(kind, ch){
  const m = TEX_VAR[kind];
  if(m.ex[ch]) return m.ex[ch];
  if(ch >= 'A' && ch <= 'Z') return String.fromCodePoint(m.at + ch.charCodeAt(0) - 65);
  if(ch >= 'a' && ch <= 'z') return String.fromCodePoint(m.at + 26 + ch.charCodeAt(0) - 97);
  return ch;
}
function texTok(src){
  const out = []; let i = 0;
  while(i < src.length){
    const c = src[i];
    if(c === '\\'){ const m = /^\\([a-zA-Z]+|[\s\S])/.exec(src.slice(i)); out.push({ t:'cs', v:m[1] }); i += m[0].length; }
    else if(c === '%'){ while(i < src.length && src[i] !== '\n') i++; }        // TeX comment
    else if(/\s/.test(c)){ out.push({ t:'ws' }); while(i < src.length && /\s/.test(src[i])) i++; }
    else if(c >= '0' && c <= '9'){ const m = /^[0-9]+(?:\.[0-9]+)?/.exec(src.slice(i)); out.push({ t:'num', v:m[0] }); i += m[0].length; }
    else { out.push({ t:'ch', v:c }); i++; }
  }
  return out;
}
/* compile one formula; throws an Error with a readable message if it can't */
function texCompile(src, display){
  const toks = texTok(src);
  let p = 0, big = 0;                                // big: 2 = limits above/below, 1 = on the side
  const bad = m => { throw new Error(m); };
  const sk = () => { while(toks[p] && toks[p].t === 'ws') p++; };
  const cur = () => { sk(); return toks[p]; };
  const isCh = (t, v) => !!t && t.t === 'ch' && t.v === v;
  const isCs = (t, v) => !!t && t.t === 'cs' && t.v === v;
  const row = ns => ns.length === 1 ? ns[0] : texEl('mrow', ns);
  const some = ns => row(ns.length ? ns : [texEl('mrow', [])]);

  function list(stop){                               // atoms until } or a caller's boundary
    const out = [];
    for(;;){
      const t = cur();
      if(!t || isCh(t, '}') || (stop && stop(t))) break;
      out.push(atom());
    }
    return out;
  }
  function braced(){ p++; const ns = list(); if(!isCh(cur(), '}')) bad('a { is never closed'); p++; return some(ns); }
  function group(what){                              // one argument: {…} or a single base
    const t = cur();
    if(!t) bad('\\' + what + ' needs something after it');
    if(isCh(t, '{')) return braced();
    return base();                                   // not atom(): x_0^1 is one sub and one sup
  }
  function raw(){                                    // argument as plain text (\text, \begin, …)
    sk();
    const t = toks[p];
    if(!t) return '';
    if(!isCh(t, '{')){ p++; return t.v || ' '; }
    p++;
    let d = 1, s = '';
    while(p < toks.length){
      const k = toks[p];
      if(isCh(k, '{')) d++;
      if(isCh(k, '}') && !--d){ p++; return s; }
      s += k.t === 'ws' ? ' ' : k.t === 'cs' ? (texHas(TEX_ESC, k.v) ? TEX_ESC[k.v] : k.v) : k.v;
      p++;
    }
    bad('a { is never closed');
  }
  function fence(who){
    const t = cur();
    if(!t) bad('\\' + who + ' needs a bracket after it');
    p++;
    if(t.t === 'cs' && t.v === '|') return '‖';
    if(t.t === 'ch' && t.v === '.') return '';       // \left. — invisible
    const k = t.v;
    if(texHas(TEX_FENCE, k)) return TEX_FENCE[k];
    if(t.t === 'ch') return k;
    bad('\\' + who + ' cannot use \\' + k);
  }
  function fenced(){
    const l = fence('left');
    const ns = list(t => isCs(t, 'right'));
    if(!isCs(cur(), 'right')) bad('\\left has no matching \\right');
    p++;
    const r = fence('right');
    const kids = [];
    if(l) kids.push(texEl('mo', [l], { fence:'true', stretchy:'true' }));
    kids.push(some(ns));
    if(r) kids.push(texEl('mo', [r], { fence:'true', stretchy:'true' }));
    return texEl('mrow', kids);
  }
  function env(){
    const name = raw(), spec = texOwn(TEX_ENV, name);
    if(!spec) bad('unknown environment ' + name);
    if(name === 'array') raw();                      // eat the column spec
    const stop = t => isCs(t, 'end') || isCs(t, '\\') || isCh(t, '&');
    const rows = [[]];
    for(;;){
      rows[rows.length - 1].push(some(list(stop)));
      const t = cur();
      if(isCh(t, '&')){ p++; continue; }
      if(isCs(t, '\\')){ p++; if(isCs(cur(), 'end')) break; rows.push([]); continue; }
      if(isCs(t, 'end')) break;
      bad('\\begin{' + name + '} has no \\end');
    }
    p++;
    const close = raw();
    if(close !== name) bad('\\end{' + close + '} does not close \\begin{' + name + '}');
    const align = name === 'cases' ? 'left' : /^(aligned|align)$/.test(name) ? 'right left' : 'center';
    const tbl = texEl('mtable', rows.map(r => texEl('mtr', r.map(c => texEl('mtd', [c])))), { columnalign: align });
    if(!spec[0] && !spec[1]) return tbl;
    const kids = [];
    if(spec[0]) kids.push(texEl('mo', [spec[0]], { fence:'true', stretchy:'true' }));
    kids.push(tbl);
    if(spec[1]) kids.push(texEl('mo', [spec[1]], { fence:'true', stretchy:'true' }));
    return texEl('mrow', kids);
  }
  function scripts(b, lim){
    let sub = null, sup = null;
    for(;;){
      const t = cur();
      if(isCh(t, '_')){ if(sub) bad('two subscripts in a row'); p++; sub = group('_'); }
      else if(isCh(t, '^')){ if(sup) bad('two superscripts in a row'); p++; sup = group('^'); }
      else if(isCh(t, "'")){
        let n = 0;
        while(isCh(cur(), "'")){ p++; n++; }
        if(sup) bad('two superscripts in a row');
        sup = texEl('mo', [n === 1 ? '′' : n === 2 ? '″' : '‴']);
      }
      else break;
    }
    if(!sub && !sup) return b;
    const u = lim === 2 && display;
    if(sub && sup) return texEl(u ? 'munderover' : 'msubsup', [b, sub, sup]);
    if(sub) return texEl(u ? 'munder' : 'msub', [b, sub]);
    return texEl(u ? 'mover' : 'msup', [b, sup]);
  }
  function atom(){
    const b = base();
    let lim = big;
    for(;;){
      const t = cur();
      if(isCs(t, 'limits')){ lim = 2; p++; }
      else if(isCs(t, 'nolimits')){ lim = 0; p++; }
      else break;
    }
    return scripts(b, lim);
  }
  function base(){
    big = 0;
    const t = cur();
    if(!t) bad('the formula stops too early');
    if(t.t === 'num'){ p++; return texEl('mn', [t.v]); }
    if(t.t === 'ch'){
      const c = t.v;
      if(c === '{') return braced();
      if(c === '}') bad('a } with no { to close');
      if(c === '&') bad('& only works inside \\begin{…}');
      if(c === '_' || c === '^') bad('nothing before the ' + c);
      p++;
      if(/[a-zA-Z]/.test(c)) return texEl('mi', [c]);
      if(c === '~') return texEl('mspace', [], { width:'.25em' });
      if(c === '-') return texEl('mo', ['−']);
      if(c === '*') return texEl('mo', ['∗']);
      /* only \left…\right grows a bracket, so plain ones must say so */
      if('()[]|'.indexOf(c) >= 0) return texEl('mo', [c], { stretchy:'false' });
      return texEl('mo', [c]);
    }
    const v = t.v; p++;
    if(texHas(TEX_SPC, v)) return texEl('mspace', [], { width: TEX_SPC[v] });
    if(texHas(TEX_ESC, v)) return texEl('mo', [TEX_ESC[v]], { stretchy:'false' });
    if(v === 'frac' || v === 'dfrac' || v === 'tfrac' || v === 'cfrac'){
      const f = texEl('mfrac', [group(v), group(v)]);
      return v === 'frac' ? f : texEl('mstyle', [f], { displaystyle: v === 'dfrac' || v === 'cfrac' ? 'true' : 'false' });
    }
    if(v === 'binom' || v === 'dbinom' || v === 'tbinom')
      return texEl('mrow', [texEl('mo', ['('], { fence:'true', stretchy:'true' }),
        texEl('mfrac', [group(v), group(v)], { linethickness:'0' }),
        texEl('mo', [')'], { fence:'true', stretchy:'true' })]);
    if(v === 'sqrt'){
      if(isCh(cur(), '[')){
        p++;
        const n = some(list(t2 => isCh(t2, ']')));
        if(!isCh(cur(), ']')) bad('\\sqrt[ is never closed');
        p++;
        return texEl('mroot', [group(v), n]);
      }
      return texEl('msqrt', [group(v)]);
    }
    if(texHas(TEX_ACC, v))
      return texEl('mover', [group(v), texEl('mo', [TEX_ACC[v]], { stretchy: v === 'widehat' || v === 'widetilde' ? 'true' : 'false' })], { accent:'true' });
    if(v === 'overline')  return texEl('mover',  [group(v), texEl('mo', ['‾'], { stretchy:'true' })]);
    if(v === 'underline') return texEl('munder', [group(v), texEl('mo', ['_'],  { stretchy:'true' })]);
    if(v === 'overbrace') return texEl('mover',  [group(v), texEl('mo', ['⏞'], { stretchy:'true' })]);
    if(v === 'underbrace')return texEl('munder', [group(v), texEl('mo', ['⏟'], { stretchy:'true' })]);
    if(/^(text|textrm|textnormal|mbox|textbf|textit)$/.test(v)){
      const s = raw().replace(/^ | $/g, '\u00a0');   // keep the spaces at the edges
      return texEl('mtext', [s], v === 'textbf' ? { style:'font-weight:700' } : v === 'textit' ? { style:'font-style:italic' } : null);
    }
    if(v === 'mathrm' || v === 'operatorname') return texEl('mi', [raw()], { mathvariant:'normal' });
    if(v === 'mathbf' || v === 'boldsymbol')   return texEl('mi', [raw()], { mathvariant:'normal', style:'font-weight:700' });
    if(v === 'mathit')  return texEl('mi', [raw()], { style:'font-style:italic' });
    if(v === 'mathsf')  return texEl('mi', [raw()], { mathvariant:'normal', style:'font-family:var(--body),sans-serif' });
    if(v === 'mathtt')  return texEl('mi', [raw()], { mathvariant:'normal', style:'font-family:var(--mono),monospace' });
    if(texOwn(TEX_VAR, v)) return texEl('mi', [raw().split('').map(c => texVarChar(v, c)).join('')], { mathvariant:'normal' });
    if(v === 'left')  return fenced();
    if(v === 'right') bad('\\right with no \\left');
    if(v === 'begin') return env();
    if(v === 'end')   bad('\\end with no \\begin');
    if(v === '\\')    bad('a line break only works between rows');
    if(texHas(TEX_BIG, v)){ big = TEX_INT[v] ? 1 : 2; return texEl('mo', [TEX_BIG[v]], { largeop:'true', movablelimits:'false' }); }
    if(TEX_FN.indexOf(v) >= 0){ big = TEX_FN_LIM[v] ? 2 : 0; return texEl('mi', [v], { mathvariant:'normal' }); }
    if(texHas(TEX_MI, v)) return texEl('mi', [TEX_MI[v]], { mathvariant: v.length > 1 && /^[A-Z]/.test(v) ? 'normal' : null });
    if(texHas(TEX_MO, v)) return texEl('mo', [TEX_MO[v]]);
    if(v === '|') return texEl('mo', ['‖'], { stretchy:'false' });   // \| is the norm bar
    if(texHas(TEX_FENCE, v)) return texEl('mo', [TEX_FENCE[v]], { stretchy:'false' });
    if(/^(displaystyle|textstyle|scriptstyle|nonumber|notag|hspace|phantom)$/.test(v)) return texEl('mrow', []);
    bad('\\' + v + ' is not one I know');
  }

  const rows = [list(t => isCs(t, '\\'))];           // \\ stacks display maths onto more lines
  while(isCs(cur(), '\\')){ p++; rows.push(list(t => isCs(t, '\\'))); }
  if(cur()) bad('a } with no { to close');
  if(!rows[0].length && rows.length === 1) bad('the formula is empty');
  const body = rows.length > 1
    ? texEl('mtable', rows.map(r => texEl('mtr', [texEl('mtd', [some(r)])])))
    : some(rows[0]);
  return texEl('math', [body], display ? { display:'block' } : null);
}

/* $$…$$ and \[…\] set on their own line; $…$ and \(…\) run inside the text.
   A bare $…$ only counts when it carries a TeX signal, so prices stay prices. */
const MATH_RE = /\$\$([\s\S]+?)\$\$|\\\[([\s\S]+?)\\\]|\\\(([\s\S]+?)\\\)|\$([^$\n]+?)\$/g;
function mathHits(s){
  const out = [];
  let m;
  MATH_RE.lastIndex = 0;
  while((m = MATH_RE.exec(s))){
    const body = m[1] != null ? m[1] : m[2] != null ? m[2] : m[3] != null ? m[3] : m[4];
    if(m[4] != null && !/[\\^_{}]/.test(body)) continue;
    out.push({ at: m.index, len: m[0].length, src: m[0], body: body, disp: m[1] != null || m[2] != null });
  }
  return out;
}
function mathNode(hit){
  const box = document.createElement('span');
  box.className = 'math' + (hit.disp ? ' dsp' : '');
  box.setAttribute('data-tex', hit.src);
  box.contentEditable = 'false';
  try{ box.appendChild(texCompile(hit.body, hit.disp)); }
  catch(e){
    box.className += ' bad';
    box.textContent = hit.src;
    box.title = (e && e.message) || 'this formula does not compile';
  }
  return box;
}
/* ---- a box read as one string, and the way back ----
   A text box is a tree; a formula is a run of characters that pays the tree no
   attention at all. These four flatten one to the other and back, and both the
   compiler below and the editor in chrome/mathpad.js work in those offsets. A
   <br> counts as one newline, and maths already compiled as one space — its
   source is on the element, not in the text. */
function mathFlat(root){
  const nodes = [];
  let s = '';
  (function walk(n){
    for(let c = n.firstChild; c; c = c.nextSibling){
      if(c.nodeType === 3){ nodes.push({ n: c, at: s.length }); s += c.nodeValue; }
      else if(c.nodeType === 1){
        if(c.hasAttribute('data-tex')){ s += ' '; continue; }   // already compiled
        const br = /^(BR|DIV|P|LI)$/.test(c.tagName);
        if(br) s += '\n';
        walk(c);
        if(br && c.tagName !== 'BR') s += '\n';
      }
    }
  })(root);
  return { s, nodes };
}
/* the text node an offset falls in — the later one, where two of them meet */
function mathSpot(nodes, off){
  for(let i = nodes.length - 1; i >= 0; i--)
    if(off >= nodes[i].at && off <= nodes[i].at + nodes[i].n.nodeValue.length)
      return [nodes[i].n, off - nodes[i].at];
  return null;
}
/* where a caret standing at (node, off) lands in that string */
function mathFlatOff(root, node, off){
  let s = 0, got = -1;
  (function walk(n){
    for(let i = 0, c = n.firstChild; ; i++, c = c && c.nextSibling){
      if(got < 0 && n === node && i === off) got = s;           // the gap before child i
      if(!c) break;
      if(c.nodeType === 3){
        if(got < 0 && c === node) got = s + Math.min(off, c.nodeValue.length);
        s += c.nodeValue.length;
      } else if(c.nodeType === 1){
        if(c.hasAttribute('data-tex')){ s += 1; continue; }
        const br = /^(BR|DIV|P|LI)$/.test(c.tagName);
        if(br) s += 1;
        walk(c);
        if(br && c.tagName !== 'BR') s += 1;
      }
    }
  })(root);
  return got < 0 ? s : got;
}
/* …and the position that offset names, preferring a text node to the gap
   beside it, so a caret put there is a caret you can type at */
function mathFlatPos(root, off){
  let s = 0, got = null;
  (function walk(n){
    for(let i = 0, c = n.firstChild; ; i++, c = c && c.nextSibling){
      if(!got && s === off && !(c && c.nodeType === 3)) got = [n, i];
      if(!c) break;
      if(c.nodeType === 3){
        const L = c.nodeValue.length;
        if(!got && off >= s && off <= s + L) got = [c, off - s];
        s += L;
      } else if(c.nodeType === 1){
        if(c.hasAttribute('data-tex')){ s += 1; continue; }
        const br = /^(BR|DIV|P|LI)$/.test(c.tagName);
        if(br) s += 1;
        walk(c);
        if(br && c.tagName !== 'BR') s += 1;
      }
    }
  })(root);
  return got || [root, root.childNodes.length];
}

/* ---- every delimiter in a string, closed or not ----
   mathHits() reports the formulas worth compiling; this reports where the
   delimiters are, which is what a caret needs to know it is inside one. */
function mathScan(s){
  const out = [];
  let i = 0;
  while(i < s.length){
    const c = s[i];
    if(c === '\\' && (s[i + 1] === '(' || s[i + 1] === '[')){
      const shut = s[i + 1] === '(' ? '\\)' : '\\]';
      const j = s.indexOf(shut, i + 2);
      out.push({ a: i, o: i + 2, c: j < 0 ? s.length : j, b: j < 0 ? s.length : j + 2,
                 open: 2, close: 2, shut: j >= 0, disp: s[i + 1] === '[' });
      i = j < 0 ? s.length : j + 2;
    } else if(c === '$'){
      const two = s[i + 1] === '$', n = two ? 2 : 1;
      const j = s.indexOf(two ? '$$' : '$', i + n);
      out.push({ a: i, o: i + n, c: j < 0 ? s.length : j, b: j < 0 ? s.length : j + n,
                 open: n, close: n, shut: j >= 0, disp: two });
      i = j < 0 ? s.length : j + n;
    } else if(c === '\\') i += 2;                    // \$ is a dollar sign, not a delimiter
    else i++;
  }
  return out;
}
/* the formula an offset is standing in — o…c is its body */
function mathRegion(s, off){
  for(const r of mathScan(s))
    if(off >= r.o && off <= r.c) return r;
  return null;
}

/* compile every formula sitting in this element's text, in place */
function mathify(root){
  if(!root) return root;
  const all = root.textContent || '';
  if(all.indexOf('$') < 0 && all.indexOf('\\[') < 0 && all.indexOf('\\(') < 0) return root;
  const flat = mathFlat(root);
  const hits = mathHits(flat.s);
  if(!hits.length) return root;
  const spot = off => mathSpot(flat.nodes, off);
  for(let i = hits.length - 1; i >= 0; i--){         // back to front, so earlier offsets hold
    const a = spot(hits[i].at), b = spot(hits[i].at + hits[i].len);
    if(!a || !b) continue;
    const r = document.createRange();
    try{ r.setStart(a[0], a[1]); r.setEnd(b[0], b[1]); }catch(e){ continue; }
    r.deleteContents();
    r.insertNode(mathNode(hits[i]));
  }
  return root;
}
/* put the LaTeX source back, ready to be edited */
function unmathify(root){
  if(!root) return root;
  root.querySelectorAll('[data-tex]').forEach(n =>
    n.replaceWith(document.createTextNode(n.getAttribute('data-tex') || '')));
  root.normalize();
  return root;
}

/* ---- how it looks ---- */
addCSS('latex', `
/* compiled LaTeX — $$…$$ in any text box */
.math{font-family:"Latin Modern Math","STIX Two Math","Cambria Math","Noto Sans Math",math,serif;font-style:normal;font-weight:400;letter-spacing:normal;text-transform:none;-webkit-user-select:none;user-select:none}
.math math{font-size:1.05em}
.math.dsp{display:block;text-align:center;margin:.4em 0}
.math.bad{font-family:var(--mono);font-size:.78em;letter-spacing:0;color:var(--accent);border-bottom:1px dotted var(--accent);cursor:help;-webkit-user-select:text;user-select:text}
`);
