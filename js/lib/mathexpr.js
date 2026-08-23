/* Open Note — lib/mathexpr.js
   the expression compiler — what a plot, a matrix cell, a window box and a
   formula node all read with

   "3sin(2x)/x" comes in as text and goes out as a function. Nothing is ever
   eval'd, and a typo comes back as a sentence rather than an exception. The
   parser builds a small tree first and compiles that, because the same tree is
   what says *what kind* of thing was typed — a curve, an equation in x and y,
   a region, a polar curve, a list of points — and what writes it out again as
   LaTeX for the panel beside the plot. One grammar, three back ends: a real
   evaluator, a complex one, and the typesetter. No DOM in here. */

const MX_FN = {
  sin:Math.sin, cos:Math.cos, tan:Math.tan, asin:Math.asin, acos:Math.acos, atan:Math.atan,
  sinh:Math.sinh, cosh:Math.cosh, tanh:Math.tanh, sqrt:Math.sqrt, cbrt:Math.cbrt,
  abs:Math.abs, exp:Math.exp, ln:Math.log, log:Math.log10, log2:Math.log2, log10:Math.log10,
  floor:Math.floor, ceil:Math.ceil, round:Math.round, sign:Math.sign, sgn:Math.sign,
  min:Math.min, max:Math.max, hypot:Math.hypot, atan2:Math.atan2, pow:Math.pow,
  mod:(a, b) => ((a % b) + b) % b,
  /* the complex ones, seen from the real line */
  re:a => a, im:() => 0, arg:a => a < 0 ? Math.PI : a === 0 ? NaN : 0, conj:a => a
};
const MX_CONST = { pi:Math.PI, tau:Math.PI * 2, e:Math.E, phi:(1 + Math.sqrt(5)) / 2 };
const MX_SIGNS = { '−':'-', '–':'-', '—':'-', '·':'*', '×':'*', '∗':'*', '÷':'/', '⁄':'/' };
/* letters a keyboard or a palette might offer instead of the word */
const MX_ALIAS = { 'θ':'theta', 'ϑ':'theta', 'π':'pi', 'τ':'tau', 'φ':'phi', 'ϕ':'phi' };
const MX_RELS = { '<=':'<=', '>=':'>=', '=<':'<=', '=>':'>=', '==':'=', '≤':'<=', '≥':'>=', '<':'<', '>':'>', '=':'=' };
/* the letters that stand for something: x and y on the plane, t along a
   parametric curve, θ round a polar one, r and z only ever on the left of an = */
const MX_VARS = { x:1, y:1, t:1, theta:1, r:1, z:1 };
const MX_TEX_FN = { sin:1, cos:1, tan:1, sinh:1, cosh:1, tanh:1, exp:1, ln:1, log:1, arg:1, min:1, max:1 };
const MX_TEX_ARC = { asin:'arcsin', acos:'arccos', atan:'arctan' };

/* ---- the tree ---- */
function mxParse(src){
  const S = String(src == null ? '' : src);
  const ts = [];
  for(let i = 0; i < S.length;){
    const c = S[i];
    if(c === ' ' || c === '\t' || c === '\n'){ i++; continue; }
    if((c >= '0' && c <= '9') || c === '.'){
      const m = /^(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?/.exec(S.slice(i));
      if(!m) throw '"' + S.slice(i, i + 4) + '" is not a number I can read';
      ts.push({ t:'num', v:parseFloat(m[0]) }); i += m[0].length; continue;
    }
    if(/[a-zA-Z]/.test(c)){
      const m = /^[a-zA-Z][a-zA-Z0-9]*/.exec(S.slice(i));
      ts.push({ t:'name', v:m[0] }); i += m[0].length; continue;
    }
    if(MX_ALIAS[c]){ ts.push({ t:'name', v:MX_ALIAS[c] }); i++; continue; }
    const two = S.slice(i, i + 2);
    if(MX_RELS[two]){ ts.push({ t:'rel', v:MX_RELS[two] }); i += 2; continue; }
    if(MX_RELS[c]){ ts.push({ t:'rel', v:MX_RELS[c] }); i++; continue; }
    const k = MX_SIGNS[c] || c;
    if('+-*/^%(),|{}'.indexOf(k) >= 0){ ts.push({ t:k }); i++; continue; }
    throw '"' + c + '" is not something I can read';
  }
  ts.push({ t:'end' });

  let p = 0, bars = 0;
  const vars = {};
  const at = () => ts[p].t;
  const eat = t => at() === t ? (p++, true) : false;
  /* what can start an atom — a "|" only when there isn't one open already,
     so the closing bar of |x| isn't read as the start of another one */
  const opens = () => at() === 'num' || at() === 'name' || at() === '(' || (at() === '|' && !bars);

  function top(){
    if(eat('{')){
      const items = [];
      if(!eat('}')){
        for(;;){ items.push(sum()); if(!eat(',')) break; }
        if(!eat('}')) throw 'a "{" is missing its "}"';
      }
      return { o:'list', items };
    }
    const a = sum();
    if(at() !== 'rel') return a;
    const r1 = ts[p++].v, b = sum();
    if(at() !== 'rel') return { o:'rel', r:r1, a, b };
    const r2 = ts[p++].v, c = sum();
    if(at() === 'rel') throw 'three comparisons in a row is one too many';
    const less = r => r === '<' || r === '<=';
    if(r1 === '=' || r2 === '=' || less(r1) !== less(r2)) throw 'a chain of comparisons has to run one way — 0 < y < x';
    return { o:'chain', r1, r2, a, b, c };
  }
  function sum(){
    let v = term();
    for(;;){
      if(eat('+')) v = { o:'+', a:v, b:term() };
      else if(eat('-')) v = { o:'-', a:v, b:term() };
      else return v;
    }
  }
  function term(){
    let v = unary();
    for(;;){
      if(eat('*')) v = { o:'*', a:v, b:unary() };
      else if(eat('/')) v = { o:'/', a:v, b:unary() };
      else if(eat('%')) v = { o:'%', a:v, b:unary() };
      else if(opens()) v = { o:'*', a:v, b:unary(), j:1 };   /* 2x, 3sin(x), (x+1)(x-1) */
      else return v;
    }
  }
  function unary(){
    if(eat('-')) return { o:'neg', a:unary() };
    if(eat('+')) return unary();
    return power();
  }
  function power(){
    const b = atom();
    if(eat('^')) return { o:'^', a:b, b:unary() };       /* right to left */
    return b;
  }
  function atom(){
    const t = ts[p++];
    if(t.t === 'num') return { o:'num', v:t.v };
    if(t.t === '('){
      const a = sum();
      if(eat(',')){                                       /* (cos t, sin t) — a point, or a curve of them */
        const b = sum();
        if(!eat(')')) throw 'a "(" is missing its ")"';
        return { o:'pair', a, b };
      }
      if(!eat(')')) throw 'a "(" is missing its ")"';
      return a;
    }
    if(t.t === '|'){
      bars++;
      const a = sum();
      bars--;
      if(!eat('|')) throw 'a "|" is missing its partner';
      return { o:'abs', a };
    }
    if(t.t === 'name'){
      const n = t.v, l = n.toLowerCase();
      if(eat('(')){
        const a = [];
        if(!eat(')')){
          for(;;){ a.push(sum()); if(!eat(',')) break; }
          if(!eat(')')) throw n + '( is missing its ")"';
        }
        if(!MX_FN[l]) throw n + ' is not a function I know';
        return { o:'call', f:l, a };
      }
      if(l === 'i') return { o:'i' };
      if(MX_CONST[l] != null) return { o:'const', n:l, v:MX_CONST[l] };
      if(MX_VARS[l]){ vars[l] = 1; return { o:'var', n:l }; }
      if(MX_FN[l]) throw n + ' wants its argument in brackets — ' + l + '(x)';
      if(l.length > 1 && l.split('').every(ch => MX_VARS[ch] || ch === 'i'))
        throw n + ' is not something I know — write ' + l.split('').join('·');
      throw n + ' is not something I know';
    }
    if(t.t === 'rel') throw 'a comparison belongs between two things';
    if(t.t === ')' || t.t === '}') throw 'a "' + t.t + '" with nothing open before it';
    throw 'that expression stops in the middle';
  }
  if(at() === 'end') return { ast:null, vars };
  const ast = top();
  if(at() !== 'end') throw 'there is something left over at the end';
  return { ast, vars };
}

/* ---- what was typed ----
   Every expression is one of a few shapes, and the shape is read off the tree
   once and handed to whoever asked. The rules are deliberately plain. */
function mxWalk(n, f){
  if(!n) return;
  f(n);
  if(n.o === 'call'){ n.a.forEach(k => mxWalk(k, f)); return; }
  if(n.a) mxWalk(n.a, f); if(n.b) mxWalk(n.b, f); if(n.c) mxWalk(n.c, f);
  if(n.items) n.items.forEach(k => mxWalk(k, f));
}
function mxVarsOf(n){
  const v = {};
  mxWalk(n, k => { if(k.o === 'var') v[k.n] = 1; });
  return v;
}
const mxOnly = (v, allowed) => Object.keys(v).every(k => allowed.indexOf(k) >= 0);
const mxIsVar = (n, name) => n && n.o === 'var' && n.n === name;
function mxComplexIn(n){
  let c = false;
  mxWalk(n, k => { if(k.o === 'i' || (k.o === 'call' && /^(re|im|arg|conj)$/.test(k.f))) c = true; });
  return c;
}
function mxClassify(ast){
  const out = { kind:'blank', rel:null, strict:false, chain:1, vars:{}, complex:false, err:null };
  if(!ast) return out;
  out.vars = mxVarsOf(ast);
  out.complex = mxComplexIn(ast);
  const V = out.vars, has = k => !!V[k];
  const strictOf = r => r === '<' || r === '>';
  /* a pair anywhere but on its own — or in a list of them — is a mistake */
  let stray = false;
  const fine = k => k === ast || (ast.o === 'rel' && k === ast.b && mxIsVar(ast.a, 'z')) ||
                    (ast.o === 'list' && ast.items.indexOf(k) >= 0);
  mxWalk(ast, k => {
    if(k.o === 'pair' && !fine(k)) stray = true;
    if(k.o === 'list' && k !== ast) stray = true;
  });
  if(stray) return mxBad(out, 'a pair of coordinates stands on its own — (cos(t), sin(t))');

  if(ast.o === 'list'){
    if(Object.keys(V).length) return mxBad(out, 'a list holds numbers, not functions — {1+i, 2, 3-2i}');
    out.kind = 'points'; return out;
  }
  if(ast.o === 'pair'){
    if(!Object.keys(V).length){ out.kind = 'points'; return out; }
    if(mxOnly(V, ['t'])){ out.kind = 'param'; return out; }
    return mxBad(out, 'a curve of points runs on t — (cos(t), sin(t))');
  }
  if(ast.o === 'chain'){
    out.kind = 'ineq'; out.chain = 2; out.rel = ast.r1; out.strict = strictOf(ast.r1) || strictOf(ast.r2);
    if(out.complex) return mxBad(out, 'a region has to be real');
    if(!mxOnly(V, ['x', 'y'])) return mxBad(out, 'a region is drawn in x and y');
    out.sub = 'implicit';
    return out;
  }
  if(ast.o === 'rel'){
    out.rel = ast.r; out.strict = strictOf(ast.r);
    const eq = ast.r === '=';
    const lhs = ast.a, rhs = ast.b;
    /* y = f(x), x = g(y) — and the same the other way about */
    const sideOf = (v, other) => {
      if(mxIsVar(lhs, v) && !mxVarsOf(rhs)[v] && mxOnly(mxVarsOf(rhs), [other])) return 'ab';
      if(mxIsVar(rhs, v) && !mxVarsOf(lhs)[v] && mxOnly(mxVarsOf(lhs), [other])) return 'ba';
      return '';
    };
    const ey = sideOf('y', 'x'), ex = !ey && sideOf('x', 'y');
    if(ey || ex){
      out.kind = eq ? (ey ? 'expy' : 'expx') : 'ineq';
      out.sub = ey ? 'expy' : 'expx';
      out.flip = (ey || ex) === 'ba';                    /* the variable is on the right */
      if(!eq && out.complex) return mxBad(out, 'a region has to be real');
      return out;
    }
    if(eq && mxIsVar(lhs, 'r')){
      if(!mxOnly(mxVarsOf(rhs), ['theta'])) return mxBad(out, 'r runs on θ — r = cos(2θ)');
      if(out.complex) return mxBad(out, 'a polar curve has to be real');
      out.kind = 'polar'; return out;
    }
    if(eq && mxIsVar(lhs, 'z')){
      if(!mxOnly(mxVarsOf(rhs), ['t'])) return mxBad(out, 'z runs on t — z = e^(i t)');
      out.kind = 'param'; out.z = rhs.o !== 'pair'; return out;
    }
    if(has('r') || has('z')) return mxBad(out, (has('r') ? 'r' : 'z') + ' goes on the left, on its own — ' + (has('r') ? 'r = cos(2θ)' : 'z = e^(i t)'));
    if(!mxOnly(V, ['x', 'y'])) return mxBad(out, 'an equation is drawn in x and y');
    if(out.complex) return mxBad(out, (eq ? 'an equation' : 'a region') + ' in x and y has to be real');
    out.kind = eq ? 'implicit' : 'ineq'; out.sub = 'implicit';
    return out;
  }
  /* no comparison at all: a function of x, a polar radius, one complex
     number, or a mistake */
  if(!Object.keys(V).length && out.complex){ out.kind = 'points'; return out; }
  if(mxOnly(V, ['x'])){ out.kind = 'expy'; return out; }
  if(mxOnly(V, ['theta'])){ out.kind = 'polar'; if(out.complex) return mxBad(out, 'a polar curve has to be real'); return out; }
  if(mxOnly(V, ['t'])) return mxBad(out, 't on its own draws nothing — (x(t), y(t))');
  if(has('r')) return mxBad(out, 'r goes on the left, on its own — r = cos(2θ)');
  if(has('z')) return mxBad(out, 'z goes on the left, on its own — z = e^(i t)');
  return mxBad(out, 'an expression in x and y wants an =, a < or a >');
}
function mxBad(out, msg){ out.kind = 'bad'; out.err = msg; return out; }

/* ---- the real evaluator ----
   A tree becomes a closure of (x, y, t): t is both the parameter of a curve
   and the angle of a polar one, since nothing sensible uses both. */
function mxReal(n){
  switch(n.o){
    case 'num': { const v = n.v; return () => v; }
    case 'const': { const v = n.v; return () => v; }
    case 'i': return () => NaN;
    case 'var': return n.n === 'x' ? x => x : n.n === 'y' ? (x, y) => y
                     : n.n === 't' || n.n === 'theta' ? (x, y, t) => t : () => NaN;
    case 'neg': { const a = mxReal(n.a); return (x, y, t) => -a(x, y, t); }
    case 'abs': { const a = mxReal(n.a); return (x, y, t) => Math.abs(a(x, y, t)); }
    case '+': { const a = mxReal(n.a), b = mxReal(n.b); return (x, y, t) => a(x, y, t) + b(x, y, t); }
    case '-': { const a = mxReal(n.a), b = mxReal(n.b); return (x, y, t) => a(x, y, t) - b(x, y, t); }
    case '*': { const a = mxReal(n.a), b = mxReal(n.b); return (x, y, t) => a(x, y, t) * b(x, y, t); }
    case '/': { const a = mxReal(n.a), b = mxReal(n.b); return (x, y, t) => a(x, y, t) / b(x, y, t); }
    case '%': { const a = mxReal(n.a), b = mxReal(n.b); return (x, y, t) => a(x, y, t) % b(x, y, t); }
    case '^': { const a = mxReal(n.a), b = mxReal(n.b); return (x, y, t) => Math.pow(a(x, y, t), b(x, y, t)); }
    case 'call': {
      const f = MX_FN[n.f], as = n.a.map(mxReal);
      if(as.length === 1){ const a = as[0]; return (x, y, t) => f(a(x, y, t)); }
      if(as.length === 2){ const a = as[0], b = as[1]; return (x, y, t) => f(a(x, y, t), b(x, y, t)); }
      return (x, y, t) => f.apply(null, as.map(a => a(x, y, t)));
    }
    case 'pair': case 'list': case 'rel': case 'chain': throw 'that is not a number';
  }
  throw 'that expression stops in the middle';
}

/* ---- the complex one ----
   The same tree evaluated over pairs [re, im]. Only built when i, re, im, arg
   or conj appear, so the real line stays as quick as it was. */
const cx = (re, im) => [re, im || 0];
const cxMul = (a, b) => [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]];
const cxDiv = (a, b) => { const d = b[0] * b[0] + b[1] * b[1]; return [(a[0] * b[0] + a[1] * b[1]) / d, (a[1] * b[0] - a[0] * b[1]) / d]; };
const cxAbs = a => Math.hypot(a[0], a[1]);
const cxArg = a => Math.atan2(a[1], a[0]);
const cxExp = a => { const m = Math.exp(a[0]); return [m * Math.cos(a[1]), m * Math.sin(a[1])]; };
const cxLn = a => [Math.log(cxAbs(a)), cxArg(a)];
const cxPow = (a, b) => {
  if(a[0] === 0 && a[1] === 0) return b[0] === 0 && b[1] === 0 ? [1, 0] : [0, 0];
  if(b[1] === 0 && a[1] === 0 && (a[0] > 0 || Number.isInteger(b[0]))) return [Math.pow(a[0], b[0]), 0];
  return cxExp(cxMul(b, cxLn(a)));
};
const cxSqrt = a => { const m = cxAbs(a), re = Math.sqrt((m + a[0]) / 2), im = Math.sqrt((m - a[0]) / 2); return [re, a[1] < 0 ? -im : im]; };
const CX_FN = {
  re:a => [a[0], 0], im:a => [a[1], 0], abs:a => [cxAbs(a), 0], arg:a => [cxArg(a), 0], conj:a => [a[0], -a[1]],
  exp:cxExp, ln:cxLn, log:a => { const l = cxLn(a); return [l[0] / Math.LN10, l[1] / Math.LN10]; },
  sqrt:cxSqrt, pow:cxPow,
  sin:a => [Math.sin(a[0]) * Math.cosh(a[1]), Math.cos(a[0]) * Math.sinh(a[1])],
  cos:a => [Math.cos(a[0]) * Math.cosh(a[1]), -Math.sin(a[0]) * Math.sinh(a[1])],
  tan:a => cxDiv(CX_FN.sin(a), CX_FN.cos(a)),
  sinh:a => [Math.sinh(a[0]) * Math.cos(a[1]), Math.cosh(a[0]) * Math.sin(a[1])],
  cosh:a => [Math.cosh(a[0]) * Math.cos(a[1]), Math.sinh(a[0]) * Math.sin(a[1])],
  tanh:a => cxDiv(CX_FN.sinh(a), CX_FN.cosh(a))
};
function mxComplex(n){
  switch(n.o){
    case 'num': { const v = [n.v, 0]; return () => v; }
    case 'const': { const v = [n.v, 0]; return () => v; }
    case 'i': { const v = [0, 1]; return () => v; }
    case 'var': return n.n === 'x' ? x => [x, 0] : n.n === 'y' ? (x, y) => [y, 0]
                     : n.n === 't' || n.n === 'theta' ? (x, y, t) => [t, 0] : () => [NaN, 0];
    case 'neg': { const a = mxComplex(n.a); return (x, y, t) => { const v = a(x, y, t); return [-v[0], -v[1]]; }; }
    case 'abs': { const a = mxComplex(n.a); return (x, y, t) => [cxAbs(a(x, y, t)), 0]; }
    case '+': { const a = mxComplex(n.a), b = mxComplex(n.b); return (x, y, t) => { const p = a(x, y, t), q = b(x, y, t); return [p[0] + q[0], p[1] + q[1]]; }; }
    case '-': { const a = mxComplex(n.a), b = mxComplex(n.b); return (x, y, t) => { const p = a(x, y, t), q = b(x, y, t); return [p[0] - q[0], p[1] - q[1]]; }; }
    case '*': { const a = mxComplex(n.a), b = mxComplex(n.b); return (x, y, t) => cxMul(a(x, y, t), b(x, y, t)); }
    case '/': { const a = mxComplex(n.a), b = mxComplex(n.b); return (x, y, t) => cxDiv(a(x, y, t), b(x, y, t)); }
    case '^': { const a = mxComplex(n.a), b = mxComplex(n.b); return (x, y, t) => cxPow(a(x, y, t), b(x, y, t)); }
    case '%': { const a = mxComplex(n.a), b = mxComplex(n.b); return (x, y, t) => [a(x, y, t)[0] % b(x, y, t)[0], 0]; }
    case 'call': {
      const as = n.a.map(mxComplex), cf = CX_FN[n.f], rf = MX_FN[n.f];
      if(cf && as.length === 1){ const a = as[0]; return (x, y, t) => cf(a(x, y, t)); }
      if(cf && as.length === 2){ const a = as[0], b = as[1]; return (x, y, t) => cf(a(x, y, t), b(x, y, t)); }
      /* the rest only make sense on the real line: floor, min, atan2… */
      return (x, y, t) => {
        const vs = as.map(a => a(x, y, t));
        return vs.every(v => Math.abs(v[1]) < 1e-12) ? [rf.apply(null, vs.map(v => v[0])), 0] : [NaN, NaN];
      };
    }
  }
  throw 'that expression stops in the middle';
}

/* ---- LaTeX, from the same tree ----
   so the panel's picture can never disagree with the compiler about what
   3sin(2x)/x means */
const MX_PREC = { rel:0, chain:0, '+':1, '-':1, '*':2, '/':2, '%':2, neg:3, '^':4 };
const mxPrec = n => MX_PREC[n.o] != null ? MX_PREC[n.o] : 5;
function mxNumTex(v){
  if(!Number.isFinite(v)) return '?';
  let s = String(v);
  const m = /^(-?[\d.]+)e([+-]?\d+)$/.exec(s);
  if(m) s = m[1] + '\\times 10^{' + m[2].replace('+', '') + '}';
  return s;
}
function mxTex(n){
  if(!n) return '';
  const wrap = (k, p) => mxPrec(k) < p ? '\\left(' + mxTex(k) + '\\right)' : mxTex(k);
  switch(n.o){
    case 'num': return mxNumTex(n.v);
    case 'const': return n.n === 'pi' ? '\\pi' : n.n === 'tau' ? '\\tau' : n.n === 'phi' ? '\\varphi' : 'e';
    case 'i': return 'i';
    case 'var': return n.n === 'theta' ? '\\theta' : n.n;
    case 'neg': return '-' + wrap(n.a, 3);
    case 'abs': return '\\left|' + mxTex(n.a) + '\\right|';
    case '+': return wrap(n.a, 1) + ' + ' + wrap(n.b, 2);
    case '-': return wrap(n.a, 1) + ' - ' + wrap(n.b, 2);
    case '*': {
      /* 2x stays 2x; 2·3 and x·2 need the dot or they read as one number */
      const a = wrap(n.a, 2), b = wrap(n.b, 3);
      const dot = !n.j || (n.b.o === 'num' || n.b.o === 'neg') || (n.a.o === 'num' && n.b.o === 'num');
      return a + (dot ? ' \\cdot ' : ' ') + b;
    }
    case '/': return '\\frac{' + mxTex(n.a) + '}{' + mxTex(n.b) + '}';
    case '%': return wrap(n.a, 2) + ' \\bmod ' + wrap(n.b, 3);
    case '^': {
      /* sin(x)^2 must not come out as sin x² — a call is bracketed as a base
         unless it draws its own brackets */
      const own = n.a.o === 'abs' || (n.a.o === 'call' && /^(sqrt|cbrt|abs|floor|ceil)$/.test(n.a.f));
      const base = own || (n.a.o !== 'call' && mxPrec(n.a) >= 5) ? mxTex(n.a) : '\\left(' + mxTex(n.a) + '\\right)';
      return base + '^{' + mxTex(n.b) + '}';
    }
    case 'call': {
      const f = n.f, args = n.a.map(mxTex);
      if(f === 'sqrt') return '\\sqrt{' + args[0] + '}';
      if(f === 'cbrt') return '\\sqrt[3]{' + args[0] + '}';
      if(f === 'abs') return '\\left|' + args[0] + '\\right|';
      if(f === 'exp') return 'e^{' + args[0] + '}';
      if(f === 'log10') return '\\log_{10}\\left(' + args[0] + '\\right)';
      if(f === 'log2') return '\\log_{2}\\left(' + args[0] + '\\right)';
      if(f === 'floor') return '\\lfloor ' + args[0] + ' \\rfloor';
      if(f === 'ceil') return '\\lceil ' + args[0] + ' \\rceil';
      if(f === 'pow') return '\\left(' + args[0] + '\\right)^{' + args[1] + '}';
      const name = MX_TEX_ARC[f] ? '\\' + MX_TEX_ARC[f] : MX_TEX_FN[f] ? '\\' + f : '\\operatorname{' + f + '}';
      /* sin x and sin 2x read fine bare; anything with an operator in it wants brackets */
      const bare = args.length === 1 && (n.a[0].o === 'var' || n.a[0].o === 'num' || n.a[0].o === 'const' ||
        (n.a[0].o === '*' && n.a[0].j && mxPrec(n.a[0].a) >= 5 && mxPrec(n.a[0].b) >= 5));
      return name + (bare ? ' ' + args[0] : '\\left(' + args.join(',\\ ') + '\\right)');
    }
    case 'pair': return '\\left(' + mxTex(n.a) + ',\\ ' + mxTex(n.b) + '\\right)';
    case 'list': return '\\{' + n.items.map(mxTex).join(',\\ ') + '\\}';
    case 'rel': return mxTex(n.a) + ' ' + (n.r === '<=' ? '\\le' : n.r === '>=' ? '\\ge' : n.r) + ' ' + mxTex(n.b);
    case 'chain': {
      const r = k => k === '<=' ? '\\le' : k === '>=' ? '\\ge' : k;
      return mxTex(n.a) + ' ' + r(n.r1) + ' ' + mxTex(n.b) + ' ' + r(n.r2) + ' ' + mxTex(n.c);
    }
  }
  return '';
}

/* ---- the front door ----
   {fn, err, usesX} is what everything that reads a function of x has always
   been handed, and still is. The rest is for the plot. */
const MX_MEMO = new Map();
function mxCompile(src){
  const key = String(src == null ? '' : src);
  const hit = MX_MEMO.get(key);
  if(hit) return hit;
  let out;
  try{
    const P = mxParse(key), ast = P.ast;
    const K = mxClassify(ast);
    out = { fn:null, err:K.err, usesX:!!K.vars.x, ast, kind:K.kind, rel:K.rel, strict:K.strict,
            chain:K.chain, sub:K.sub || null, flip:!!K.flip, z:!!K.z, vars:K.vars, complex:K.complex, ev:null, evc:null };
    if(ast && !K.err){
      /* what to evaluate: the side that isn't the bare variable, or the tree */
      out.ev = mxReal(ast.o === 'rel' || ast.o === 'chain' || ast.o === 'pair' || ast.o === 'list' ? { o:'num', v:NaN } : ast);
      if(K.kind === 'expy' || K.kind === 'expx'){
        const body = ast.o === 'rel' ? (K.flip ? ast.a : ast.b) : ast;
        out.ev = mxReal(body);
        if(K.complex) out.evc = mxComplex(body);
        if(K.kind === 'expy'){ const f = out.ev; out.fn = x => f(x, 0, 0); out.fn(1); }
      }
      else if(K.kind === 'polar'){ out.ev = mxReal(ast.o === 'rel' ? ast.b : ast); }
      else if(K.kind === 'param'){
        const body = ast.o === 'rel' ? ast.b : ast;
        if(body.o === 'pair'){ out.evx = mxReal(body.a); out.evy = mxReal(body.b); }
        else out.evc = mxComplex(body);                 /* z = e^(it): the point is (re, im) */
      }
      else if(K.kind === 'points'){
        const items = ast.o === 'pair' ? [ast] : ast.o === 'list' ? ast.items : [ast];
        out.pts = items.map(k => {
          if(k.o === 'pair') return [mxReal(k.a)(0, 0, 0), mxReal(k.b)(0, 0, 0)];
          const v = mxComplex(k)(0, 0, 0); return [v[0], v[1]];
        }).filter(q => Number.isFinite(q[0]) && Number.isFinite(q[1]));
      }
      else if(K.kind === 'implicit' || K.kind === 'ineq'){
        /* a margin: positive inside, zero on the line. a < b means b − a > 0 */
        const less = r => r === '<' || r === '<=';
        const diff = (a, b) => mxReal({ o:'-', a, b });
        if(ast.o === 'chain'){
          const F1 = less(ast.r1) ? diff(ast.b, ast.a) : diff(ast.a, ast.b);
          const F2 = less(ast.r2) ? diff(ast.c, ast.b) : diff(ast.b, ast.c);
          out.ev = (x, y, t) => Math.min(F1(x, y, t), F2(x, y, t));
        } else {
          out.ev = ast.r === '=' ? diff(ast.b, ast.a) : less(ast.r) ? diff(ast.b, ast.a) : diff(ast.a, ast.b);
        }
        if(K.sub === 'expy' || K.sub === 'expx'){
          const body = K.flip ? ast.a : ast.b;            /* the curve the region leans on */
          out.evb = mxReal(body);
          /* which side: y < f(x) is the part below the curve */
          const v = K.flip ? ast.b : ast.a;              /* the bare variable */
          out.below = (v === ast.a) === less(ast.r);
        }
      }
      out.tex = mxTex(ast);
    }
    else if(ast) out.tex = mxTex(ast);
  }catch(err){
    out = { fn:null, err:String(err), usesX:false, ast:null, kind:'bad', rel:null, strict:false,
            chain:1, sub:null, flip:false, z:false, vars:{}, complex:false, ev:null, evc:null };
  }
  if(MX_MEMO.size > 400) MX_MEMO.clear();
  MX_MEMO.set(key, out);
  return out;
}
/* a function of x and nothing else — what a formula node wants */
function mxFn(src){
  const c = mxCompile(src);
  if(c.err) return { fn:null, err:c.err, usesX:false };
  if(!c.ast) return { fn:null, err:null, usesX:false };
  if(!c.fn) return { fn:null, err:c.kind === 'expx' ? 'x is the one that varies here — write it in x'
                                  : c.rel ? 'that is an equation, not a function of x'
                                  : 'only x varies here', usesX:false };
  return { fn:c.fn, err:null, usesX:c.usesX };
}
/* a cell of a matrix: a constant expression like -1, 1/2 or sqrt(2)/2 */
function mxNum(src){
  const c = mxCompile(src);
  if(Object.keys(c.vars).length) return { v:null, err:(c.usesX ? 'x' : Object.keys(c.vars)[0]) + ' has no value in a matrix' };
  if(c.err) return { v:null, err:c.err };
  if(!c.ast) return { v:null, err:'that box is empty' };
  if(c.rel || c.kind === 'param') return { v:null, err:'a box holds a number, not an equation' };
  if(c.complex || c.kind === 'points') return { v:null, err:'a box holds one real number' };
  let v; try{ v = c.ev(0, 0, 0); }catch(e){ v = NaN; }
  return Number.isFinite(v) ? { v, err:null } : { v:null, err:'that does not come out as a number' };
}
