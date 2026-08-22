/* Open Note — items/code.js
   a terminal-style code cell — display only, coloured the way an editor would.

   Nothing runs and nothing is downloaded: the highlighter below is a single
   scanner driven by one small table per language (comments, strings, keyword
   sets, a few extra patterns), and the colours are the familiar editor schemes
   written as CSS variables. The source itself is stored verbatim in `it.code`
   and escaped on the way to the page, never the other way round. */

/* ================= the languages ================= */
const CD_S = s => new Set(s ? s.split(' ') : []);
function cdLang(name, d){
  d.name = name;
  d.fl = CD_S(d.fl); d.kw = CD_S(d.kw); d.ty = CD_S(d.ty); d.cn = CD_S(d.cn);
  d.bi = d.bi ? CD_S(d.bi) : null;
  d.dFn = d.dFn ? CD_S(d.dFn) : null; d.dTy = d.dTy ? CD_S(d.dTy) : null;
  d.q = d.q || ['"', "'"];
  return d;
}
const CD_WORD = /[A-Za-z_][A-Za-z0-9_]*/y;
const CD_WORD$ = /[A-Za-z_$][A-Za-z0-9_$]*/y;          // js and ts allow $ in a name
const CD_NUM = /(?:0[xX][0-9a-fA-F_]+|0[bB][01_]+|0[oO][0-7_]+|\d[\d_]*(?:\.[\d_]+)?(?:[eE][+-]?\d+)?|\.\d[\d_]*(?:[eE][+-]?\d+)?)\w*/y;
const CD_OPS = '+-*/%=<>!&|^~?';

/* Token kinds, shared by every language and coloured by the scheme:
   cm comment · st string · es escape · nm number · kw keyword · fl control flow
   ty type · fn function · cn constant · pp attribute/preprocessor · vr name · op operator.

   A language says: lc line comments, bc block comments, q quote chars, tq
   triple quotes, sp string-prefix words (r b f @…), spre a prefix that is not a
   word ($@" in C#), ipPre prefix that turns {…} into code, ipQ the quote that
   always interpolates ${…}, rawQ quotes with no escapes, mlq strings that run
   over lines, dq2 doubling the quote to escape it, strVar $names inside "…",
   ci case-insensitive, pas Pascal-case names are types, ex its own patterns,
   dFn/dTy the word after these is a function/type, ind what Tab inserts. */
const CD_LANGS = {
  python: cdLang('Python', {
    lc: ['#'], tq: true, sp: /^[rbufRBUF]{1,2}$/, ipPre: /f/i, pas: true, ind: '    ',
    ex: [[/@[A-Za-z_][\w.]*/y, 'pp']],
    fl: 'if elif else for while try except finally with break continue return yield raise pass match case assert import from',
    kw: 'def class lambda as global nonlocal del async await and or not in is',
    cn: 'True False None self cls NotImplemented Ellipsis __name__ __main__ __file__ __doc__',
    ty: 'int float complex str bool bytes bytearray list dict set tuple frozenset object type range slice super Exception BaseException ValueError TypeError KeyError IndexError AttributeError RuntimeError StopIteration OSError ZeroDivisionError',
    dFn: 'def', dTy: 'class'
  }),
  js: cdLang('JavaScript', {
    lc: ['//'], bc: [['/*', '*/']], q: ['"', "'", '`'], ipQ: '`', idRe: CD_WORD$, pas: true, ind: '  ',
    fl: 'if else for while do switch case default break continue return try catch finally throw yield await import export from',
    kw: 'function var let const class extends new delete typeof instanceof in of this super async static get set void debugger with as',
    cn: 'true false null undefined NaN Infinity globalThis arguments',
    ty: 'Array Object String Number Boolean Function Symbol BigInt Math JSON Promise RegExp Date Map Set WeakMap WeakSet Error TypeError RangeError Proxy Reflect Intl',
    dFn: 'function', dTy: 'class extends new instanceof'
  }),
  ts: null,           // filled in below, so the dropdown keeps this order
  c: cdLang('C', {
    lc: ['//'], bc: [['/*', '*/']], pas: true, ind: '    ',
    ex: [[/(?<=#\s*include\s*)<[^>\n]*>/y, 'st'], [/#\s*[A-Za-z]\w*/y, 'pp'], [/[A-Za-z_]\w*_t\b/y, 'ty']],
    fl: 'if else for while do switch case default break continue return goto',
    kw: 'struct enum union typedef sizeof extern static inline volatile register auto const restrict signed unsigned',
    ty: 'void char short int long float double _Bool bool FILE va_list',
    cn: 'NULL true false EOF stdin stdout stderr errno',
    dTy: 'struct enum union'
  }),
  cpp: null,
  cs: cdLang('C#', {
    lc: ['//'], bc: [['/*', '*/']], tq: true, pas: true, ind: '    ',
    spre: /[$@]{1,2}(?=")/y, ipPre: /\$/, dq2: 'raw',
    ex: [[/#\s*[A-Za-z]\w*/y, 'pp']],
    fl: 'if else for foreach while do switch case default break continue return try catch finally throw goto yield when using',
    kw: 'namespace class struct interface enum record delegate event public private protected internal static readonly const var new void async await override virtual abstract sealed partial get set init add remove where is as typeof nameof sizeof lock out ref in params base this operator implicit explicit checked unchecked fixed unsafe extern volatile global required with value',
    ty: 'int uint long ulong short ushort byte sbyte float double decimal bool char string object dynamic nint nuint',
    cn: 'null true false',
    dTy: 'class struct interface enum namespace new record'
  }),
  rust: cdLang('Rust', {
    lc: ['//'], bc: [['/*', '*/']], q: ['"'], mlq: true, sp: /^b$/, pas: true, ind: '    ',
    ex: [
      [/r(#*)"[\s\S]*?"\1/y, 'st'],                    // raw strings, hashes and all
      [/b?'(?:\\.|[^'\\\n])'/y, 'st'],                 // a char — before the lifetimes
      [/#!?\[[^\]\n]*\]/y, 'pp'],                      // #[derive(Debug)]
      [/'[A-Za-z_]\w*/y, 'pp'],                        // 'a
      [/[A-Za-z_]\w*!(?=\s*[({[])/y, 'fn']             // println!
    ],
    fl: 'if else match loop while for break continue return in await yield',
    kw: 'fn let mut pub use mod struct enum impl trait where unsafe async move ref crate super dyn static const type as extern',
    cn: 'Some None Ok Err true false self Self',
    ty: 'i8 i16 i32 i64 i128 isize u8 u16 u32 u64 u128 usize f32 f64 bool char str String Vec Option Result Box Rc Arc Cell RefCell HashMap HashSet BTreeMap Cow Path PathBuf',
    dFn: 'fn', dTy: 'struct enum trait impl mod type union use'
  }),
  go: cdLang('Go', {
    lc: ['//'], bc: [['/*', '*/']], q: ['"', "'", '`'], rawQ: '`', pas: true, ind: '\t',
    fl: 'if else for range switch case default break continue return goto fallthrough select go defer',
    kw: 'func package import var const type struct interface map chan',
    cn: 'nil true false iota',
    ty: 'int int8 int16 int32 int64 uint uint8 uint16 uint32 uint64 uintptr float32 float64 complex64 complex128 string bool byte rune error any comparable',
    dFn: 'func', dTy: 'type struct interface map chan'
  }),
  java: cdLang('Java', {
    lc: ['//'], bc: [['/*', '*/']], tq: true, pas: true, ind: '    ',
    ex: [[/@[A-Za-z_][\w.]*/y, 'pp']],
    fl: 'if else for while do switch case default break continue return try catch finally throw assert yield',
    kw: 'public private protected class interface enum extends implements static final void new import package abstract synchronized volatile transient native strictfp instanceof this super throws var record sealed permits',
    cn: 'null true false',
    ty: 'int long short byte float double boolean char String Object Integer Long Short Byte Float Double Boolean Character CharSequence List Map Set ArrayList HashMap HashSet Optional Stream Iterable Runnable Thread Exception RuntimeException',
    dTy: 'class interface enum extends implements new throws'
  }),
  gd: cdLang('GDScript', {
    lc: ['#'], tq: true, pas: true, ind: '\t',
    ex: [[/@[A-Za-z_]\w*/y, 'pp'], [/[$%][A-Za-z_/][\w/]*/y, 'vr']],
    fl: 'if elif else for while match break continue pass return await',
    kw: 'func class class_name extends var const signal enum static breakpoint preload assert and or not in is as void',
    cn: 'true false null self PI TAU INF NAN',
    ty: 'int float bool String StringName Array Dictionary Variant Signal Callable Vector2 Vector2i Vector3 Vector3i Vector4 Rect2 Transform2D Transform3D Basis Quaternion Color NodePath RID Node Node2D Node3D Control Sprite2D Sprite3D Area2D Area3D RigidBody2D RigidBody3D CharacterBody2D CharacterBody3D AnimationPlayer Timer Label Button PackedScene Resource Texture2D AudioStreamPlayer',
    dFn: 'func signal', dTy: 'class class_name extends'
  }),
  bash: cdLang('Shell', {
    lc: ['#'], q: ['"', "'"], rawQ: "'", mlq: true, ind: '  ',
    strVar: /\$\{[^}\n]*\}|\$[A-Za-z_]\w*|\$[0-9@#?*!$]/y,
    ex: [
      [/\$\{[^}\n]*\}|\$[A-Za-z_]\w*|\$[0-9@#?*!$]/y, 'vr'],
      [/(?<![\w"'\-\]])-{1,2}[A-Za-z][\w-]*/y, 'cn']   // flags read like a terminal
    ],
    fl: 'if then else elif fi for in do done while until case esac function select',
    kw: 'local export readonly declare unset shift return exit break continue set trap eval exec source alias sudo',
    cn: 'true false',
    bi: 'echo printf read cd ls cp mv rm mkdir rmdir touch cat grep egrep sed awk find sort uniq head tail wc chmod chown curl wget tar zip unzip ssh scp git make gcc python python3 pip pip3 npm npx node cargo go docker kubectl systemctl apt dnf pacman brew kill ps df du date sleep which test tee xargs cut tr basename dirname',
    dFn: 'function'
  }),
  sql: cdLang('SQL', {
    ci: true, lc: ['--'], bc: [['/*', '*/']], q: ["'", '"', '`'], dq2: 'always', ind: '  ',
    kw: 'select insert update delete merge create drop alter truncate from where into values set join left right inner outer full cross on as order group by having limit offset union all distinct exists in is like ilike between case when then else end and or not if begin commit rollback transaction with recursive table view index database schema primary key foreign references constraint unique check default cascade add column returning explain grant revoke using natural asc desc nulls first last over partition window',
    cn: 'null true false current_date current_time current_timestamp',
    ty: 'int integer bigint smallint tinyint decimal numeric float real double precision varchar nvarchar char text boolean bool date time timestamp timestamptz interval blob bytea json jsonb uuid serial bigserial money xml array'
  })
};
CD_LANGS.ts = Object.assign({}, CD_LANGS.js, {
  name: 'TypeScript',
  kw: new Set([...CD_LANGS.js.kw, 'interface', 'type', 'enum', 'namespace', 'declare', 'abstract', 'implements', 'readonly', 'public', 'private', 'protected', 'satisfies', 'keyof', 'infer', 'is', 'asserts', 'module', 'override', 'accessor']),
  ty: new Set([...CD_LANGS.js.ty, 'string', 'number', 'boolean', 'object', 'symbol', 'bigint', 'any', 'unknown', 'never', 'Record', 'Partial', 'Readonly', 'Pick', 'Omit', 'Required', 'Exclude', 'Extract', 'ReturnType', 'Awaited']),
  dTy: new Set([...CD_LANGS.js.dTy, 'interface', 'implements', 'type'])
});
CD_LANGS.cpp = Object.assign({}, CD_LANGS.c, {
  name: 'C++',
  fl: new Set([...CD_LANGS.c.fl, 'try', 'catch', 'throw', 'co_return', 'co_await', 'co_yield']),
  kw: new Set([...CD_LANGS.c.kw, 'class', 'public', 'private', 'protected', 'template', 'typename', 'namespace', 'using', 'new', 'delete', 'virtual', 'override', 'final', 'friend', 'operator', 'constexpr', 'consteval', 'constinit', 'mutable', 'noexcept', 'explicit', 'typeid', 'decltype', 'concept', 'requires', 'this']),
  ty: new Set([...CD_LANGS.c.ty, 'string', 'vector', 'array', 'map', 'set', 'pair', 'tuple', 'unique_ptr', 'shared_ptr', 'weak_ptr', 'optional', 'variant', 'function', 'wchar_t', 'char8_t', 'char16_t', 'char32_t']),
  cn: new Set(['NULL', 'nullptr', 'true', 'false', 'stdin', 'stdout', 'stderr']),
  dTy: new Set(['struct', 'enum', 'union', 'class', 'typename', 'new'])
});

/* ================= the scanner ================= */
/* One pass over the source, appending escaped HTML into `out`. Order matters:
   a language's own patterns, then comments, then strings, numbers, words, and
   operator runs; anything else is plain. `prev` carries the last word across
   spaces only, so `def name` and `class Name` can colour the name. */
function cdScan(src, L, out){
  src = String(src);
  const n = src.length;
  let i = 0, plain = '', prev = '';
  const flushP = () => { if(plain){ out.push(esc(plain)); plain = ''; } };
  const push = (k, s) => { if(!s) return; flushP(); out.push('<span class="tk-' + k + '">' + esc(s) + '</span>'); };

  /* one string literal, from prefix and opening quote to wherever it ends —
     an unterminated single-line string stops at the newline, so half-typed
     code doesn't paint the rest of the cell orange */
  const str = (start, qi, prefix, q) => {
    const raw = /[rR@]/.test(prefix) || (L.rawQ ? L.rawQ.indexOf(q) >= 0 : false);
    let ml = !!L.mlq, close = q, j = qi + 1;
    if(L.tq && src[qi + 1] === q && src[qi + 2] === q){ close = q + q + q; ml = true; j = qi + 3; }
    if(q === '`' || prefix.indexOf('@') >= 0) ml = true;
    const brace = !!(L.ipPre && prefix && L.ipPre.test(prefix));     // f"…{x}"  $"…{x}"
    const dollar = L.ipQ === q;                                      // `…${x}`
    const d2 = L.dq2 === 'always' || (L.dq2 === 'raw' && raw);
    let seg = src.slice(start, j);
    const emit = () => { if(seg){ push('st', seg); seg = ''; } };
    while(j < n){
      const c = src[j];
      if(d2 && c === q && src[j + 1] === q && close === q){ seg += q + q; j += 2; continue; }
      if(src.startsWith(close, j)){ seg += close; j += close.length; emit(); return j; }
      if(c === '\n' && !ml) break;
      if(!raw && c === '\\' && j + 1 < n){ emit(); push('es', src.substr(j, 2)); j += 2; continue; }
      if(brace || dollar){
        if(brace && (c === '{' || c === '}') && src[j + 1] === c){ seg += c + c; j += 2; continue; }
        if(brace ? c === '{' : (c === '$' && src[j + 1] === '{')){
          emit();
          const oL = brace ? 1 : 2;
          push('op', src.substr(j, oL));
          let d = 1, k = j + oL;
          while(k < n){ const cc = src[k]; if(cc === '{') d++; else if(cc === '}' && !--d) break; k++; }
          cdScan(src.slice(j + oL, k), L, out);       // the hole holds real code
          if(k < n){ push('op', '}'); k++; }
          j = k; continue;
        }
      }
      if(L.strVar && !raw && q === '"'){
        L.strVar.lastIndex = j;
        const m = L.strVar.exec(src);
        if(m && m.index === j){ emit(); push('vr', m[0]); j += m[0].length; continue; }
      }
      seg += c; j++;
    }
    emit(); return j;
  };

  outer: while(i < n){
    const ch = src[i];
    if(L.ex) for(const [re, kind] of L.ex){
      re.lastIndex = i;
      const m = re.exec(src);
      if(m && m.index === i && m[0]){ push(kind, m[0]); i += m[0].length; prev = ''; continue outer; }
    }
    if(L.lc){
      const s = L.lc.find(s => src.startsWith(s, i));
      if(s){ let j = src.indexOf('\n', i); if(j < 0) j = n; push('cm', src.slice(i, j)); i = j; prev = ''; continue; }
    }
    if(L.bc){
      const b = L.bc.find(b => src.startsWith(b[0], i));
      if(b){ let j = src.indexOf(b[1], i + b[0].length); j = j < 0 ? n : j + b[1].length; push('cm', src.slice(i, j)); i = j; prev = ''; continue; }
    }
    if(L.spre){
      L.spre.lastIndex = i;
      const m = L.spre.exec(src);
      if(m && m.index === i){ i = str(i, i + m[0].length, m[0], src[i + m[0].length]); prev = ''; continue; }
    }
    if(L.q.indexOf(ch) >= 0){ i = str(i, i, '', ch); prev = ''; continue; }
    if(/[0-9]/.test(ch) || (ch === '.' && /[0-9]/.test(src[i + 1] || ''))){
      CD_NUM.lastIndex = i;
      const m = CD_NUM.exec(src);
      if(m && m.index === i){ push('nm', m[0]); i += m[0].length; prev = ''; continue; }
    }
    const wre = L.idRe || CD_WORD;
    wre.lastIndex = i;
    const m = wre.exec(src);
    if(m && m.index === i){
      const w = m[0], end = i + w.length;
      if(L.sp && L.sp.test(w) && L.q.indexOf(src[end]) >= 0){ i = str(i, end, w, src[end]); prev = ''; continue; }
      const key = L.ci ? w.toLowerCase() : w;
      let k;
      if(L.fl.has(key)) k = 'fl';
      else if(L.kw.has(key)) k = 'kw';
      else if(L.ty.has(key)) k = 'ty';
      else if(L.cn.has(key)) k = 'cn';
      else if(L.bi && L.bi.has(key)) k = 'fn';
      else if(L.dTy && L.dTy.has(prev)) k = 'ty';
      else if(L.dFn && L.dFn.has(prev)) k = 'fn';
      else {
        let j = end;
        while(j < n && (src[j] === ' ' || src[j] === '\t')) j++;
        if(src[j] === '(') k = 'fn';
        else if(src[j] === ':' && src[j + 1] === ':') k = 'ty';
        else if(L.pas && /^[A-Z]/.test(w) && /[a-z]/.test(w)) k = 'ty';
        else if(/^[A-Z][A-Z0-9_]+$/.test(w)) k = 'cn';
        else k = 'vr';
      }
      push(k, w); prev = key; i = end; continue;
    }
    if(CD_OPS.indexOf(ch) >= 0){
      let j = i + 1;
      while(j < n && CD_OPS.indexOf(src[j]) >= 0) j++;
      push('op', src.slice(i, j)); i = j; prev = ''; continue;
    }
    plain += ch; i++;
    if(ch !== ' ' && ch !== '\t') prev = '';
  }
  flushP();
}

function cdRender(ced, it){
  const L = CD_LANGS[it.lang] || CD_LANGS.python;
  const out = [];
  cdScan(it.code || '', L, out);
  /* a trailing empty line needs a <br> to exist on screen, and for the caret */
  ced.innerHTML = out.join('') + (/\n$/.test(it.code || '') ? '<br>' : '');
  /* a long one shows a band of itself and scrolls, unless it was told to stand tall */
  const bx = ced.closest('.cbx');
  if(bx) bx.classList.toggle('clip', !it.tall && (it.code || '').split('\n').length > CD_CLIP);
}

/* ================= the colour schemes ================= */
const CD_SCHEMES = ['auto', 'dark', 'light', 'monokai', 'dracula', 'solar'];
const CD_SCH_NAME = { auto: 'Theme', dark: 'Dark', light: 'Light', monokai: 'Monokai', dracula: 'Dracula', solar: 'Solarized' };
const CD_CLIP = 16;                    // a cell longer than this shows a band of itself
const CD_TAG = { python: 'PY', js: 'JS', ts: 'TS', c: 'C', cpp: 'C++', cs: 'C#',
                 rust: 'RS', go: 'GO', java: 'JAVA', gd: 'GD', bash: 'SH', sql: 'SQL' };

/* The Theme scheme mixes its terminal out of the book's own ink and paper. A
   dark paper flips the recipe (class .cdk) — measured, because the paper can
   be overridden to any colour, exactly as the charts do it. */
function cdDarkPaper(){
  const v = getComputedStyle(document.body).getPropertyValue('--paper').trim();
  let m, r, g, b;
  if((m = v.match(/^#([0-9a-f]{6})\b/i))){ const x = parseInt(m[1], 16); r = x >> 16 & 255; g = x >> 8 & 255; b = x & 255; }
  else if((m = v.match(/rgba?\(\s*(\d+)[ ,]+(\d+)[ ,]+(\d+)/))){ r = +m[1]; g = +m[2]; b = +m[3]; }
  else return false;
  const L = [r, g, b].map(x => { x /= 255; return x <= 0.04045 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); });
  return 0.2126 * L[0] + 0.7152 * L[1] + 0.0722 * L[2] < 0.25;
}
/* the theme lands as attributes on <body>; cells on the Theme scheme follow */
(function(){
  let raf = 0;
  const kick = () => {
    if(raf) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      const dk = cdDarkPaper();
      document.querySelectorAll('.cbx[data-sch="auto"]').forEach(bx => bx.classList.toggle('cdk', dk));
    });
  };
  addEventListener('DOMContentLoaded', () =>
    new MutationObserver(kick).observe(document.body, { attributes: true, attributeFilter: ['style', 'data-theme'] }));
})();

/* ================= what a key does inside code =================
   One rule table, used twice: by the cell's own editor below, and by a fenced
   block written inside a sentence (chrome/tickpad.js). Written the way the
   maths rules are — over the writing and the selection in it, with no DOM in
   sight — so the two are typed exactly the same way and the harness can drive
   them without a caret.

   The answer replaces [from, to) with `text` and then puts the caret `caret`
   characters into what was written; `pick` instead picks out that pair of
   absolute offsets, which is how a re-indented block stays selected for the
   next ⇥. `null` means the key was not ours. */
const CD_PAIR = { '(': ')', '[': ']', '{': '}' };
const cdLineStart = (s, off) => s.lastIndexOf('\n', Math.max(0, off - 1)) + 1;
const cdLineEnd = (s, off) => { const i = s.indexOf('\n', off); return i < 0 ? s.length : i; };
/* one step of indent off the front of a line: a tab, or up to a level of spaces */
function cdUnindent(line, ind){
  if(line[0] === '\t') return 1;
  const w = ind === '\t' ? 4 : ind.length;
  let n = 0;
  while(n < w && line[n] === ' ') n++;
  return n;
}
function cdKey(s, a, b, e, L){
  const one = a === b;                               // nothing picked out
  const nxt = one ? (s[a] || '') : '';
  const prv = one && a > 0 ? s[a - 1] : '';
  const ind = L.ind || '    ';
  const q = L.q || ['"', "'"];
  const okNext = !nxt || ' \t\n)]}>,;:.'.indexOf(nxt) >= 0;

  if(e.key === 'Enter'){
    const ls = cdLineStart(s, a);
    const keep = (s.slice(ls, a).match(/^[ \t]*/) || [''])[0];        // a new line keeps its indent
    if(one && CD_PAIR[prv] && nxt === CD_PAIR[prv])                   // …and opens a block out
      return { from: a, to: b, text: '\n' + keep + ind + '\n' + keep, caret: 1 + keep.length + ind.length };
    return { from: a, to: b, text: '\n' + keep, caret: 1 + keep.length };
  }
  if(e.key === 'Tab'){
    /* ⇧⇥, or ⇥ over lines, moves whole lines rather than writing anything */
    if(e.shiftKey || s.slice(a, b).indexOf('\n') >= 0){
      const ls = cdLineStart(s, a), le = cdLineEnd(s, b);
      const lines = s.slice(ls, le).split('\n');
      let first = 0, all = 0;
      const out = lines.map((ln, i) => {
        if(e.shiftKey){
          const cut = cdUnindent(ln, ind);
          if(i === 0) first = cut;
          all += cut;
          return ln.slice(cut);
        }
        if(!ln.trim() && lines.length > 1) return ln;                 // a blank line stays blank
        if(i === 0) first = ind.length;
        all += ind.length;
        return ind + ln;
      }).join('\n');
      if(out === s.slice(ls, le)) return { from: a, to: a, text: '', caret: 0 };
      const move = e.shiftKey ? -1 : 1;
      return { from: ls, to: le, text: out,
               pick: one ? null : [Math.max(ls, a + move * first), Math.max(ls, b + move * all)],
               caret: Math.max(0, a - ls + move * first) };
    }
    return { from: a, to: b, text: ind, caret: ind.length };
  }
  if(!one && (CD_PAIR[e.key] || q.indexOf(e.key) >= 0)){              // wrap what is picked out
    const close = CD_PAIR[e.key] || e.key;
    const t = e.key + s.slice(a, b) + close;
    return { from: a, to: b, text: t, caret: t.length - 1 };
  }
  if(!one) return null;
  if(CD_PAIR[e.key])
    return okNext ? { from: a, to: a, text: e.key + CD_PAIR[e.key], caret: 1 } : null;
  if((e.key === ')' || e.key === ']' || e.key === '}') && nxt === e.key)
    return { from: a, to: a, text: '', caret: 1 };                    // step over the one already there
  if(q.indexOf(e.key) >= 0){
    if(nxt === e.key) return { from: a, to: a, text: '', caret: 1 };
    if(okNext && !/[\w"'`]/.test(prv)) return { from: a, to: a, text: e.key + e.key, caret: 1 };
    return null;
  }
  if(e.key === 'Backspace' && a > 0 &&
     (CD_PAIR[prv] === nxt || (prv === nxt && q.indexOf(prv) >= 0)))  // an empty pair goes as one
    return { from: a - 1, to: a + 1, text: '', caret: 0 };
  return null;
}

/* ================= the editor ================= */
/* Reading the text back out of the contenteditable, by walking it. Not
   innerText: the browser keeps a padding <br> at the end of an editable box (so
   the last line can be clicked into), innerText reads that as a newline, and a
   newline that was never typed comes back one taller on every keystroke \u2014 the
   cell just keeps growing. The walker counts a <br> as the newline it shows as
   and then takes the very last one back off, whether the browser put it there
   or the renderer below did. */
function cdText(ed){
  let s = '';
  (function walk(n){
    for(const c of n.childNodes){
      if(c.nodeType === 3) s += c.nodeValue;
      else if(c.nodeName === 'BR') s += '\n';
      else {
        if(/^(DIV|P|PRE|LI)$/.test(c.nodeName) && s && !s.endsWith('\n')) s += '\n';
        walk(c);
      }
    }
  })(ed);
  if(ed.lastChild && ed.lastChild.nodeName === 'BR' && s.endsWith('\n')) s = s.slice(0, -1);
  return s.replace(/\u00a0/g, ' ').replace(/\r/g, '');
}

/* the caret, as a plain character offset — measured before a re-colour and put
   back after, so the spans can be rebuilt under it mid-keystroke */
function cdOffOf(root, node, k){                 // absolute offset of one range boundary
  let off = 0, found = false;
  (function walk(nd){
    if(found) return;
    if(nd === node && nd.nodeType === 3){ off += k; found = true; return; }
    if(nd.nodeType === 3){ off += nd.nodeValue.length; return; }
    if(nd.nodeName === 'BR'){ if(nd === node) found = true; else off += 1; return; }
    const kids = nd.childNodes;
    for(let i = 0; i < kids.length; i++){
      if(nd === node && i === k){ found = true; return; }
      walk(kids[i]);
      if(found) return;
    }
    if(nd === node) found = true;
  })(root);
  return found ? off : -1;
}
function cdCaretOff(root){
  const sel = getSelection();
  if(!sel.rangeCount) return -1;
  const r = sel.getRangeAt(0);
  if(!root.contains(r.endContainer)) return -1;
  return cdOffOf(root, r.endContainer, r.endOffset);
}
function cdPointAt(root, off){                   // …and back: an offset as [node, k]
  let found = null;
  (function walk(nd){
    if(found) return;
    if(nd.nodeType === 3){
      if(off <= nd.nodeValue.length) found = [nd, off];
      else off -= nd.nodeValue.length;
      return;
    }
    if(nd.nodeName === 'BR'){ if(off <= 0) found = [nd, -1]; else off -= 1; return; }
    for(const c of nd.childNodes){ walk(c); if(found) return; }
  })(root);
  return found;
}
function cdSetCaret(root, off){
  const r = document.createRange();
  const p = cdPointAt(root, off);
  if(!p){ r.selectNodeContents(root); r.collapse(false); }
  else if(p[1] < 0){ r.setStartBefore(p[0]); r.collapse(true); }
  else { r.setStart(p[0], p[1]); r.collapse(true); }
  const sel = getSelection();
  sel.removeAllRanges(); sel.addRange(r);
}
function cdSelectSpan(root, a, b){
  const pa = cdPointAt(root, a), pb = cdPointAt(root, b);
  if(!pa || !pb) return;
  const r = document.createRange();
  if(pa[1] < 0) r.setStartBefore(pa[0]); else r.setStart(pa[0], pa[1]);
  if(pb[1] < 0) r.setEndBefore(pb[0]); else r.setEnd(pb[0], pb[1]);
  const sel = getSelection();
  sel.removeAllRanges(); sel.addRange(r);
}
/* an edit out of cdKey(), written into the box: what it replaces is picked out
   first and the browser's own insertText does the writing, so undo still works
   and the `input` the cell listens on still fires. Then the caret goes back —
   or the block stays picked out, ready for the next ⇥. */
function cdPut(root, k){
  if(k.from !== k.to) cdSelectSpan(root, k.from, k.to);
  else cdSetCaret(root, k.from);
  try{
    if(k.text) document.execCommand('insertText', false, k.text);
    else if(k.from !== k.to) document.execCommand('delete');
  }catch(e){}
  if(k.pick) cdSelectSpan(root, k.pick[0], k.pick[1]);
  else cdSetCaret(root, k.from + (k.caret || 0));
}

/* a caret that lands under the fold of a clipped window is scrolled back in */
function cdSeeCaret(el){
  const w = el.querySelector('.cwin'), sel = getSelection();
  if(!w || w.scrollHeight <= w.clientHeight || !sel.rangeCount) return;
  const r = sel.getRangeAt(0).getBoundingClientRect();
  if(!r || (!r.top && !r.bottom)) return;
  const b = w.getBoundingClientRect();
  if(r.bottom > b.bottom - 4) w.scrollTop += r.bottom - b.bottom + 24;
  else if(r.top < b.top + 4) w.scrollTop -= b.top - r.top + 24;
}

function cdEdit(el, it){
  const ced = el.querySelector('.ced');
  if(!ced || el.classList.contains('editing')) return;
  el.classList.add('editing');
  try { ced.contentEditable = 'plaintext-only'; }       // keeps rich paste out by itself
  catch(e){ ced.contentEditable = 'true'; }             // older engines: handlers below cover it
  ced.focus();
  cdSetCaret(ced, (it.code || '').length + 1);
}

function cdCopy(text, btn){
  copyText(text, () => {
    btn.classList.add('did'); SND.tick();
    clearTimeout(btn._t);
    btn._t = setTimeout(() => btn.classList.remove('did'), 1300);
  });
}

/* ================= the item ================= */
defineItem('code', {
  add: { code: base => ({ ...base, type: 'code', w: 56, fs: 13, code: '', lang: 'python', sch: 'auto' }) },
  sizeable: true,
  html: (it, c) => {
    const lang = CD_LANGS[it.lang] ? it.lang : 'python';
    const pick = c.live
      ? '<span class="clwrap"><select class="clang" title="Language">' +
          Object.keys(CD_LANGS).map(k =>
            '<option value="' + k + '"' + (k === lang ? ' selected' : '') + '>' + esc(CD_LANGS[k].name) + '</option>').join('') +
        '</select></span>'
      : '<span class="clang">' + esc(CD_LANGS[lang].name) + '</span>';
    return '<div class="body cbx' + (it.nw ? ' nw' : '') + '" data-sch="' + esc(it.sch || 'auto') + '">' +
      '<div class="cbar"><span class="cdots"><i></i><i></i><i></i></span>' + pick +
      (c.live ? '<button class="ccopy" title="Copy the code">' + icn('copy') + '<span class="cok">copied</span></button>' : '') +
      '</div><pre class="cwin"><code class="ced" spellcheck="false" data-ph="write some code…"></code></pre></div>';
  },
  mount(el, it){
    const bx = el.querySelector('.cbx');
    if((it.sch || 'auto') === 'auto') bx.classList.toggle('cdk', cdDarkPaper());
    cdRender(el.querySelector('.ced'), it);
  },
  tools(mk, it, el, page){
    mk('◑', 'Colour scheme — ' + CD_SCH_NAME[it.sch || 'auto'], b => {
      it.sch = CD_SCHEMES[(CD_SCHEMES.indexOf(it.sch || 'auto') + 1) % CD_SCHEMES.length];
      const bx = el.querySelector('.cbx');
      bx.dataset.sch = it.sch;
      bx.classList.toggle('cdk', it.sch === 'auto' && cdDarkPaper());
      b.title = 'Colour scheme — ' + CD_SCH_NAME[it.sch];
      queueSave(page.id); SND.tick();
    });
    mk('⏎', 'Wrap long lines / let them run', () => {
      it.nw = !it.nw;
      el.querySelector('.cbx').classList.toggle('nw', !!it.nw);
      queueSave(page.id);
    });
    mk(it.tall ? '⊟' : '⊞', 'A long cell shows a band of itself — show the whole thing / clip it back', b => {
      it.tall = !it.tall;
      b.textContent = it.tall ? '⊟' : '⊞';
      cdRender(el.querySelector('.ced'), it);
      queueSave(page.id);
    });
  },
  wire(el, it, page){
    const ced = el.querySelector('.ced');
    el.addEventListener('dblclick', e => {
      if(e.target.closest('.cbar') || e.target.closest('.tools')) return;
      e.stopPropagation();
      cdEdit(el, it);
    });
    ced.addEventListener('pointerdown', e => { if(el.classList.contains('editing')) e.stopPropagation(); });
    /* the wheel reads a clipped cell without picking it up; Ctrl+wheel stays the desk's zoom */
    el.addEventListener('wheel', e => {
      if(e.ctrlKey || e.metaKey) return;
      const w = el.querySelector('.cwin');
      if(!w || !(e.target.closest && e.target.closest('.cwin'))) return;
      const canY = w.scrollHeight > w.clientHeight, canX = w.scrollWidth > w.clientWidth;
      if(!canY && !canX) return;
      e.preventDefault(); e.stopPropagation();
      if(canY) w.scrollTop += wheelPx(e);
      if(canX) w.scrollLeft += e.deltaX;
    }, { passive: false });
    /* every keystroke recolours in place — the caret is measured, the spans
       rebuilt, the caret put back */
    ced.addEventListener('input', () => {
      const off = cdCaretOff(ced);
      it.code = cdText(ced);
      cdRender(ced, it);
      if(off >= 0) cdSetCaret(ced, off);
      cdSeeCaret(el);
      queueSave(page.id); SND.scratch();
    });
    /* Everything a key does in here is cdKey() above — Enter keeping the
       indent, ⇥ and ⇧⇥ moving it, and the brackets and quotes that close
       themselves. All this does is measure the selection, hand it over, and
       write back what comes out. */
    ced.addEventListener('keydown', e => {
      if(!el.classList.contains('editing')) return;
      if(e.key === 'Escape'){ e.stopPropagation(); ced.blur(); return; }
      if(e.ctrlKey || e.metaKey || e.altKey) return;
      const sel = getSelection();
      if(!sel.rangeCount) return;
      const r = sel.getRangeAt(0);
      const a = cdOffOf(ced, r.startContainer, r.startOffset);
      const b = cdOffOf(ced, r.endContainer, r.endOffset);
      if(a < 0 || b < a) return;
      const ed = cdKey(it.code || '', a, b, e, CD_LANGS[it.lang] || CD_LANGS.python);
      if(!ed) return;
      e.preventDefault();
      cdPut(ced, ed);
      cdSeeCaret(el);
    });
    ced.addEventListener('paste', e => {
      e.preventDefault();
      const t = e.clipboardData ? e.clipboardData.getData('text/plain') : '';
      if(t) document.execCommand('insertText', false, t.replace(/\r\n?/g, '\n'));
    });
    ced.addEventListener('blur', () => {
      el.classList.remove('editing');
      ced.contentEditable = 'false';
      it.code = cdText(ced);
      cdRender(ced, it);
      queueSave(page.id);
    });
    const sel = el.querySelector('select.clang');
    if(sel){
      sel.addEventListener('pointerdown', e => e.stopPropagation());
      sel.addEventListener('click', e => e.stopPropagation());
      sel.addEventListener('change', () => { it.lang = sel.value; cdRender(ced, it); queueSave(page.id); SND.tick(); });
    }
    const cp = el.querySelector('.ccopy');
    if(cp){
      cp.addEventListener('pointerdown', e => { e.stopPropagation(); e.preventDefault(); });
      cp.addEventListener('click', e => { e.stopPropagation(); cdCopy(it.code || '', cp); });
    }
  },
  after(it, el){ if(el) cdEdit(el, it); },
  /* filed into a folder it wears a little terminal with its language on the tag */
  fileable: true,
  icon(it){
    return svgIcon('<rect class="cgw" x="6" y="6" width="84" height="114" rx="8"/>' +
      '<path class="cgb" d="M6 33 V14 a8 8 0 0 1 8-8 H82 a8 8 0 0 1 8 8 V33 Z"/>' +
      '<circle class="cgd1" cx="17" cy="20" r="3.4"/><circle class="cgd2" cx="27" cy="20" r="3.4"/>' +
      '<circle class="cgd3" cx="37" cy="20" r="3.4"/>' +
      '<path class="cgp" d="M18 52 L34 65 L18 78 M42 78 H62" fill="none"/>' +
      extBand(CD_TAG[it.lang] || 'CODE'));
  },
  label: it => (CD_LANGS[it.lang] || CD_LANGS.python).name + ' snippet',
  meta: it => ((it.code || '').split('\n').length) + ' lines',
  open(it){
    const v = $('#fview');
    const body = winShell(v, entryName(it), entryMeta(it),
      [{ a: 'copy', g: '⧉', t: 'Copy the code' }, CLOSE_BTN], 'cpview');
    const out = [];
    cdScan(it.code || '', CD_LANGS[it.lang] || CD_LANGS.python, out);
    body.innerHTML = '<pre class="cvpre">' + out.join('') + '</pre>';
    winActs(v, a => {
      if(a === 'close') closeViewer();
      else cdCopy(it.code || '', v.querySelector('.fbtns button[data-a=copy]'));
    });
  },
  peek(it){
    const lines = String(it.code || '').split('\n'), out = [];
    cdScan(lines.slice(0, 12).join('\n'), CD_LANGS[it.lang] || CD_LANGS.python, out);
    return '<div class="sheetbox cpeek"><pre>' + out.join('') +
      (lines.length > 12 ? '\n<span class="more">⋯ ' + (lines.length - 12) + ' more lines</span>' : '') +
      '</pre></div>';
  },
  css: `
/* the cell — VS Code Dark+ is the base every scheme overrides */
.cbx{overflow:hidden;border-radius:.5em;box-shadow:0 6px 16px rgba(0,0,0,.3);font-size:calc(var(--fs,13)*var(--scale)*1px);
  --c-bg:#1e1e1e;--c-fg:#d4d4d4;--c-bar:#2d2d30;--c-sel:#264f78;
  --c-cm:#6a9955;--c-st:#ce9178;--c-es:#d7ba7d;--c-nm:#b5cea8;--c-kw:#569cd6;--c-fl:#c586c0;
  --c-ty:#4ec9b0;--c-fn:#dcdcaa;--c-cn:#4fc1ff;--c-pp:#c586c0;--c-vr:#9cdcfe;--c-op:#d4d4d4}
.item.sel .cbx.cbx{box-shadow:0 0 0 1px var(--accent2),0 6px 16px rgba(0,0,0,.3)}
.cbx[data-sch=light]{--c-bg:#ffffff;--c-fg:#1f1f1f;--c-bar:#ececec;--c-sel:#add6ff;
  --c-cm:#008000;--c-st:#a31515;--c-es:#ee0000;--c-nm:#098658;--c-kw:#0000ff;--c-fl:#af00db;
  --c-ty:#267f99;--c-fn:#795e26;--c-cn:#0070c1;--c-pp:#af00db;--c-vr:#001080;--c-op:#1f1f1f}
.cbx[data-sch=monokai]{--c-bg:#272822;--c-fg:#f8f8f2;--c-bar:#1d1e19;--c-sel:#49483e;
  --c-cm:#75715e;--c-st:#e6db74;--c-es:#ae81ff;--c-nm:#ae81ff;--c-kw:#f92672;--c-fl:#f92672;
  --c-ty:#66d9ef;--c-fn:#a6e22e;--c-cn:#ae81ff;--c-pp:#a6e22e;--c-vr:#f8f8f2;--c-op:#f92672}
.cbx[data-sch=dracula]{--c-bg:#282a36;--c-fg:#f8f8f2;--c-bar:#1e1f29;--c-sel:#44475a;
  --c-cm:#6272a4;--c-st:#f1fa8c;--c-es:#ff79c6;--c-nm:#bd93f9;--c-kw:#ff79c6;--c-fl:#ff79c6;
  --c-ty:#8be9fd;--c-fn:#50fa7b;--c-cn:#bd93f9;--c-pp:#ff79c6;--c-vr:#f8f8f2;--c-op:#ff79c6}
.cbx[data-sch=solar]{--c-bg:#fdf6e3;--c-fg:#657b83;--c-bar:#eee8d5;--c-sel:#d8d2c0;
  --c-cm:#93a1a1;--c-st:#2aa198;--c-es:#dc322f;--c-nm:#d33682;--c-kw:#859900;--c-fl:#859900;
  --c-ty:#b58900;--c-fn:#268bd2;--c-cn:#cb4b16;--c-pp:#cb4b16;--c-vr:#657b83;--c-op:#657b83}
/* Theme: the terminal mixed from the book's own ink and paper; a dark paper
   (.cdk, measured) goes deeper than the paper instead of lighter than the ink */
.cbx[data-sch=auto]{--c-bg:color-mix(in srgb,var(--ink) 88%,var(--paper));
  --c-fg:color-mix(in srgb,var(--paper) 82%,#fff);
  --c-bar:color-mix(in srgb,var(--ink) 76%,var(--paper))}
.cbx[data-sch=auto].cdk{--c-bg:color-mix(in srgb,var(--paper) 46%,#000);
  --c-fg:color-mix(in srgb,var(--ink) 88%,#fff);
  --c-bar:color-mix(in srgb,var(--paper) 68%,#000)}
/* the bar */
.cbar{display:flex;align-items:center;gap:.55em;padding:.42em .75em;background:var(--c-bar);color:var(--c-fg)}
.cdots{display:flex;gap:.38em;margin-right:auto}
.cdots i{width:.68em;height:.68em;border-radius:50%;background:#ff5f57}
.cdots i:nth-child(2){background:#febc2e}
.cdots i:nth-child(3){background:#28c840}
.clwrap{display:flex;align-items:center}
.clwrap::after{content:"▾";font-size:.7em;opacity:.55;margin-left:.25em;pointer-events:none}
.cbx .clang{appearance:none;background:transparent;border:0;padding:0;margin:0;outline:none;
  color:color-mix(in srgb,var(--c-fg) 78%,var(--c-bar));font-family:var(--mono);font-size:.78em;letter-spacing:.03em}
.cbx select.clang{cursor:pointer}
.cbx select.clang option{background:var(--c-bar);color:var(--c-fg)}
.ccopy{display:flex;align-items:center;gap:.4em;background:transparent;border:0;padding:.18em .35em;border-radius:.35em;
  color:color-mix(in srgb,var(--c-fg) 78%,var(--c-bar));font-family:var(--mono);font-size:.78em;cursor:pointer}
.ccopy:hover{background:color-mix(in srgb,var(--c-fg) 14%,transparent);color:var(--c-fg)}
.ccopy .ic{width:1.25em;height:1.25em}
.ccopy .cok{display:none}
.ccopy.did{color:#2ea043}
.ccopy.did .cok{display:inline}
/* the window */
.cwin{margin:0;padding:.7em .9em;background:var(--c-bg);min-height:2.4em;white-space:pre-wrap;overflow-wrap:break-word;overflow:hidden;
  scrollbar-width:thin;scrollbar-color:color-mix(in srgb,var(--c-fg) 32%,transparent) transparent}
.cbx.nw .cwin{white-space:pre;overflow-x:auto}
/* a long cell shows a band of itself; the wheel and its own scrollbar read the rest */
.cbx.clip .cwin{max-height:27em;overflow-y:auto}
.ced{display:block;outline:none;font-family:var(--mono);color:var(--c-fg);line-height:1.55;tab-size:4;caret-color:var(--c-fg);min-height:1.55em}
.ced:empty::before{content:attr(data-ph);opacity:.45}
.ced::selection,.ced ::selection{background:var(--c-sel)}
.editing .cwin{cursor:text}
.editing .ced{user-select:text}
/* the tokens — they only ever sit inside a .cbx or a .cpeek, which hold the variables */
.tk-cm{color:var(--c-cm);font-style:italic}
.tk-st{color:var(--c-st)}
.tk-es{color:var(--c-es)}
.tk-nm{color:var(--c-nm)}
.tk-kw{color:var(--c-kw)}
.tk-fl{color:var(--c-fl)}
.tk-ty{color:var(--c-ty)}
.tk-fn{color:var(--c-fn)}
.tk-cn{color:var(--c-cn)}
.tk-pp{color:var(--c-pp)}
.tk-vr{color:var(--c-vr)}
.tk-op{color:var(--c-op)}
/* the ctrl+hover peek and the folder viewer — always the dark scheme, over the desk */
.peek .sheetbox.cpeek,.fbody.cpview{--c-cm:#6a9955;--c-st:#ce9178;--c-es:#d7ba7d;--c-nm:#b5cea8;
  --c-kw:#569cd6;--c-fl:#c586c0;--c-ty:#4ec9b0;--c-fn:#dcdcaa;--c-cn:#4fc1ff;--c-pp:#c586c0;
  --c-vr:#9cdcfe;--c-op:#d4d4d4}
.peek .sheetbox.cpeek{height:auto;max-height:290px;overflow:hidden;background:#1e1e1e;padding:8px}
.cpeek pre{margin:0;font-family:var(--mono);font-size:10px;line-height:1.5;color:#d4d4d4;
  white-space:pre-wrap;overflow-wrap:break-word}
.cpeek .more{font-style:normal;opacity:.55}
/* the window a filed snippet opens into — sized to the code, not to a document */
.fview .fwin.w-cpview{width:min(760px,92vw);height:auto;max-height:min(940px,88vh)}
.fview .fbody.cpview{background:#1e1e1e;overflow:auto;padding:0;
  scrollbar-width:thin;scrollbar-color:rgba(212,212,212,.32) transparent}
.cvpre{margin:0;padding:14px 16px;font-family:var(--mono);font-size:12.5px;line-height:1.55;color:#d4d4d4;
  white-space:pre-wrap;overflow-wrap:break-word}
.fbtns button.did{color:#2ea043}
/* its glyph in a folder — a little terminal with the language on the tag */
.cgw{fill:#22262b;stroke:rgba(0,0,0,.45);stroke-width:2}
.cgb{fill:rgba(255,255,255,.08)}
.cgd1{fill:#ff5f57}.cgd2{fill:#febc2e}.cgd3{fill:#28c840}
.cgp{stroke:#4ec9b0;stroke-width:6;stroke-linecap:round;stroke-linejoin:round}
`
});

/* ================= the same cell, inside a sentence =================
   ```fenced``` code written in a text box is this feature's trade too: the
   scanner colours it, the schemes below dress it, and cdKey() above says what
   ⇥ or a bracket does while it is being written. lib/ticks.js finds the fences
   and hands them here — a language is named the way it is everywhere else, by
   the word after the opening fence.

   The one thing a fence does not carry is the cell's own toolbar: its language
   is the word you typed, and its colours are the note's rather than its own,
   since a paragraph with three code blocks in three different schemes reads as
   a mess. `◑` on the bar cycles that one setting for the whole note. */
const CD_ALIAS = {
  py:'python', python:'python', py3:'python', python3:'python',
  js:'js', javascript:'js', jsx:'js', mjs:'js', cjs:'js', node:'js',
  ts:'ts', typescript:'ts', tsx:'ts',
  c:'c', h:'c', cpp:'cpp', 'c++':'cpp', cc:'cpp', cxx:'cpp', hpp:'cpp',
  cs:'cs', csharp:'cs', 'c#':'cs', dotnet:'cs',
  rust:'rust', rs:'rust', go:'go', golang:'go', java:'java',
  gd:'gd', gdscript:'gd', godot:'gd',
  sh:'bash', bash:'bash', shell:'bash', zsh:'bash', console:'bash', terminal:'bash',
  sql:'sql', psql:'sql', mysql:'sql', sqlite:'sql'
};
/* the word after the fence → one of CD_LANGS, or '' for a block of plain text */
const cdLangKey = w => CD_ALIAS[String(w || '').toLowerCase().replace(/^\.+/, '')] || '';
/* …and the table a fence is *typed* under: an unnamed block still wants its
   brackets closing, so it borrows the cell's own default */
const cdFenceLang = w => CD_LANGS[cdLangKey(w)] || CD_LANGS.python;

/* every fence in the note wears the same scheme, kept on the sheet itself */
const cdFenceSch = () => { const p = sheet(); return (p && p.csch) || 'auto'; };
function cdFenceDress(bx){
  const sch = cdFenceSch();
  bx.dataset.sch = sch;
  bx.classList.toggle('cdk', sch === 'auto' && cdDarkPaper());
  const b = bx.querySelector('.csch');
  if(b) b.title = 'Colour scheme — ' + CD_SCH_NAME[sch] + ', for every code block in this note';
}
function cdFenceCycle(){
  const p = sheet();
  if(!p) return;
  p.csch = CD_SCHEMES[(CD_SCHEMES.indexOf(p.csch || 'auto') + 1) % CD_SCHEMES.length];
  document.querySelectorAll('.cbx.cfence').forEach(cdFenceDress);
  queueSave(p.id); SND.tick();
}
/* The picker only appears where picking can be *kept*: the language is the word
   after the opening fence, so changing it rewrites the writing itself, and only
   a box that stores what it holds as rich text can take that back. Everywhere
   else — a caption, a table cell — the language is a label, and typing the word
   after the fence is how it is set. */
const CD_FENCE_BOX = '.txt,.dtxt,.dot';
/* one fenced block, built the way the cell is built — but without the cell's
   traffic lights: three dots on every block in a paragraph is decoration the
   third time you see it */
function cdFenceNode(hit, live, box){
  const key = cdLangKey(hit.lang), L = key ? CD_LANGS[key] : null;
  const out = [];
  if(L) cdScan(hit.code, L, out); else out.push(esc(hit.code));
  const pick = live && box && box.closest && box.closest(CD_FENCE_BOX)
    ? '<span class="clwrap"><select class="clang" title="Language — what it is coloured as">' +
        '<option value=""' + (L ? '' : ' selected') + '>Plain</option>' +
        Object.keys(CD_LANGS).map(k => '<option value="' + k + '"' + (k === key ? ' selected' : '') +
          '>' + esc(CD_LANGS[k].name) + '</option>').join('') +
      '</select></span>'
    : '<span class="clang">' + esc(L ? L.name : (hit.lang || 'code')) + '</span>';
  const d = document.createElement('div');
  d.className = 'cbx cfence';
  d.setAttribute('data-tick', hit.src);
  d.contentEditable = 'false';
  d.innerHTML = '<div class="cbar">' + pick +
    (live ? '<button class="csch" type="button">◑</button>' +
            '<button class="ccopy" type="button" title="Copy the code">' +
            icn('copy') + '<span class="cok">copied</span></button>' : '') +
    '</div><pre class="cwin"><code class="ced">' + out.join('') + '</code></pre>';
  cdFenceDress(d);
  return d;
}
defineCodePen({ node: cdFenceNode, lang: cdFenceLang, key: cdKey, cycle: cdFenceCycle });

addCSS('codefence', `
/* a cell in a sentence: the same terminal, sized off the writing around it
   rather than off an item's own --fs, and never wider than the paragraph */
.cbx.cfence{display:block;max-width:100%;margin:.5em 0;font-size:.86em;
  text-align:left;text-transform:none;letter-spacing:normal;font-weight:400;font-style:normal;
  -webkit-user-select:text;user-select:text;box-shadow:0 3px 10px rgba(0,0,0,.22)}
.cbx.cfence .cbar{padding:.3em .5em .3em .7em}
/* no traffic lights on a fence: the language takes the left of the bar */
.cbx.cfence .clang,.cbx.cfence .clwrap{margin-right:auto}
.cbx.cfence .cwin{padding:.55em .75em;min-height:0}
.cbx.cfence .ced{white-space:pre-wrap;overflow-wrap:break-word}
.csch{background:transparent;border:0;padding:.1em .35em;border-radius:.35em;cursor:pointer;
  color:color-mix(in srgb,var(--c-fg) 78%,var(--c-bar));font-family:var(--mono);font-size:.9em}
.csch:hover{background:color-mix(in srgb,var(--c-fg) 14%,transparent);color:var(--c-fg)}
/* handwriting on a highlighter runs inline: a block inside one takes what it needs */
.st-marker .cbx.cfence{display:inline-block;vertical-align:top}
@media print{ .cbx.cfence .csch,.cbx.cfence .ccopy{display:none} }
`);

/* its own drawings, and its tile on the Write shelf */
defineIcon('codecell', '<rect x="3.5" y="4.5" width="17" height="15" rx="2"/><path d="M3.5 8.5h17"/><path d="M7 12l2.5 2L7 16M11.5 16h4"/>');
defineIcon('copy', '<rect x="9" y="9" width="10.5" height="11" rx="2"/><path d="M6 15H5.5A1.5 1.5 0 0 1 4 13.5v-8A1.5 1.5 0 0 1 5.5 4h8A1.5 1.5 0 0 1 15 5.5V6"/>');
defineTool({ kind: 'code', cat: 'write', label: 'Code', icon: 'codecell', order: 17,
  hint: 'A terminal-style code cell — coloured like VS Code, in your pick of language' });
