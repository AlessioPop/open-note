/* Open Note — chrome/markdown.js
   the library's Markdown document, preview and plain-text editing tools */

let navMdId = null;
let navMdMode = 'write';
let navPreviewTimer = 0;
let navMdLine = 0, navMdSelA = 0, navMdSelB = 0;
const NAV_MD_THEMES = new Set(['canvas','graph','dark','blue','kraft']);

function navMarkdownFile(){ return navFileById(navMdId); }
function navMarkdownTheme(f){ return NAV_MD_THEMES.has(f && f.theme) ? f.theme : 'canvas'; }
function navApplyMarkdownTheme(f){
  const choice = navMarkdownTheme(f);
  $('#mdTheme').value = choice;
  const followsCanvas = choice === 'canvas' && index;
  applyThemeColors(followsCanvas ? index.theme : choice === 'canvas' ? 'graph' : choice,
    followsCanvas ? index.settings : null);
}
function navSetMarkdownTheme(theme){
  const f = navMarkdownFile(); if(!f) return;
  f.theme = NAV_MD_THEMES.has(theme) ? theme : 'canvas';
  f.updated = Date.now(); navApplyMarkdownTheme(f); queueLib();
}
/* Counted when the document opens and whenever it is renamed rather than on
   every keystroke: the outgoing side is this file's own text and costs nothing,
   but the incoming side has to read every other file in the library. */
let navMdBackCount = 0;
function navMarkdownStats(){
  const src = $('#mdSource').value || '', words = (src.trim().match(/\S+/g) || []).length;
  $('#mdWords').textContent = words + ' word' + (words === 1 ? '' : 's') +
    ' · ' + src.length.toLocaleString() + ' characters';
  const out = typeof wkScan === 'function'
    ? new Set(wkScan(src).map(h => wkKey(h.name.split('/').pop()))).size : 0;
  $('#mdLinks').textContent = out + ' link' + (out === 1 ? '' : 's') + ' out · ' +
    navMdBackCount + ' in';
}

/* ================= preview ================= */
function navMdInline(src){
  const code = [];
  let s = String(src || '').replace(/`([^`]+)`/g, (_, v) => '\u0000' + (code.push(v) - 1) + '\u0000');
  s = esc(s);
  /* [[a link to another file]] before the ordinary [label](href) rule, so the
     two never read each other's brackets — chrome/wiki.js owns the syntax */
  if(typeof wkInlineHTML === 'function') s = wkInlineHTML(s);
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, label, href) => {
    const u = href.replace(/&amp;/g, '&');
    return /^(https?:|mailto:|#)/i.test(u)
      ? '<a href="' + esc(u) + '" target="_blank" rel="noopener">' + label + '</a>' : label;
  });
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
       .replace(/__([^_]+)__/g, '<strong>$1</strong>')
       .replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>')
       .replace(/(^|[^_])_([^_]+)_/g, '$1<em>$2</em>')
       .replace(/~~([^~]+)~~/g, '<s>$1</s>');
  return s.replace(/\u0000(\d+)\u0000/g, (_, i) => {
    const value = code[+i];
    return '<code class="tick" data-tick="' + esc('`' + value + '`') + '">' + esc(value) + '</code>';
  });
}
/* A tab or every two spaces is one nesting step, matching the canvas writer.
   A list is emitted with its parent <li> left open until its children are
   closed; that small detail is what makes indentation structural rather than
   merely extra whitespace in a flat list. */
function navMdListDepth(indent){
  let depth = 0, spaces = 0;
  for(const ch of indent || ''){
    if(ch === '\t'){ depth++; spaces = 0; }
    else if(ch === ' ' && ++spaces === 2){ depth++; spaces = 0; }
  }
  return depth;
}
function navMdListItem(line){
  const m = /^([ \t]*)([-*+]|\d+[.)])\s+(?:\[([ xX])\]\s+)?(.*)$/.exec(line);
  if(!m) return null;
  const ordered = /^\d/.test(m[2]);
  return { depth:navMdListDepth(m[1]), tag:ordered ? 'ol' : 'ul',
    task:!ordered && m[3] != null, done:(m[3] || '').toLowerCase() === 'x', body:m[4] };
}
function navMarkdownHTML(source){
  const lines = String(source || '').replace(/\r\n?/g, '\n').split('\n');
  let out = '', para = [], lists = [], quote = [], code = null, lang = '', codeFrom = -1;
  const lineRun = rows => rows.map(row => '<span class="md-line" data-md-line="' + row.line + '">' +
    (navMdInline(row.text) || '<br>') + '</span>').join('<br>');
  /* A physical newline stays a newline. Markdown traditionally folds a soft
     break into a space; a notebook should not silently undo the return key. */
  const flushPara = () => { if(para.length){ out += '<p>' + lineRun(para) + '</p>'; para = []; } };
  const flushList = () => {
    while(lists.length){ const level = lists.pop(); out += '</li></' + level.tag + '>'; }
  };
  const flushQuote = () => { if(quote.length){ out += '<blockquote>' + lineRun(quote) + '</blockquote>'; quote = []; } };
  const flushAll = () => { flushPara(); flushList(); flushQuote(); };
  for(let i = 0; i < lines.length; i++){
    const line = lines[i];
    if(code !== null){
      if(/^\s*```/.test(line)){
        out += '<pre data-lang="' + esc(lang) + '" data-md-from="' + codeFrom + '" data-md-to="' + i + '"><code>' + esc(code.join('\n')) + '</code></pre>';
        code = null; lang = ''; codeFrom = -1;
      }else code.push(line);
      continue;
    }
    const fence = /^\s*```\s*([^\s]*)/.exec(line);
    if(fence){ flushAll(); code = []; lang = fence[1] || ''; codeFrom = i; continue; }
    /* A display equation opened on its own line is ONE thing: one block in the
       document and one run in the editor, exactly like a code fence. Compiling
       it as three ordinary lines is what used to let the typesetter reach
       across them and delete the very line the caret was standing on. Only a
       fence that closes counts — while `$$` is still the last thing you typed,
       the rest of the document is not an equation. */
    if(/^\s*\$\$\s*$/.test(line)){
      let shut = -1;
      for(let k = i + 1; k < lines.length; k++) if(/^\s*\$\$\s*$/.test(lines[k])){ shut = k; break; }
      if(shut > 0){
        flushAll();
        out += '<div class="md-math" data-md-from="' + i + '" data-md-to="' + shut + '">' +
          esc(lines.slice(i, shut + 1).join('\n')) + '</div>';
        i = shut; continue;
      }
    }
    if(!line.trim()){
      flushAll(); out += '<div class="md-blank md-line" data-md-line="' + i + '"><br></div>'; continue;
    }
    const h = /^(#{1,6})\s+(.+)$/.exec(line);
    if(h){ flushAll(); const n = h[1].length; out += '<h' + n + ' class="md-line" data-md-line="' + i + '">' + navMdInline(h[2]) + '</h' + n + '>'; continue; }
    if(/^\s{0,3}(?:(?:-\s*){3,}|(?:\*\s*){3,}|(?:_\s*){3,})$/.test(line)){
      flushAll(); out += '<div class="md-rule-line md-line" data-md-line="' + i + '"><hr></div>'; continue;
    }
    const q = /^\s*>\s?(.*)$/.exec(line);
    if(q){ flushPara(); flushList(); quote.push({ text:q[1], line:i }); continue; }
    const item = navMdListItem(line);
    if(item){
      flushPara(); flushQuote();
      /* Markdown cannot jump into a grandchild without a parent at the missing
         depth. Clamp that malformed indentation to the next useful level. */
      item.depth = Math.min(item.depth, lists.length);
      while(lists.length - 1 > item.depth){
        const level = lists.pop(); out += '</li></' + level.tag + '>';
      }
      if(lists.length - 1 === item.depth){
        const level = lists[lists.length - 1];
        out += '</li>';
        if(level.tag !== item.tag || level.tasks !== item.task){
          out += '</' + level.tag + '><' + item.tag + (item.task ? ' class="tasks"' : '') + '>';
          level.tag = item.tag; level.tasks = item.task;
        }
      }else{
        out += '<' + item.tag + (item.task ? ' class="tasks"' : '') + '>';
        lists.push({ tag:item.tag, tasks:item.task });
      }
      out += '<li class="md-line' + (item.task ? ' md-task' : '') + '" data-md-line="' + i + '">';
      if(item.task){
        out += '<input type="checkbox" data-md-task="' + i + '"' + (item.done ? ' checked' : '') +
          ' aria-label="Mark task ' + (item.done ? 'incomplete' : 'complete') + '"><span>' +
          navMdInline(item.body) + '</span>';
      }else out += navMdInline(item.body);
      continue;
    }
    flushList(); flushQuote(); para.push({ text:line.trim(), line:i });
  }
  if(code !== null) out += '<pre data-lang="' + esc(lang) + '" data-md-from="' + codeFrom + '" data-md-to="' + (lines.length - 1) + '"><code>' + esc(code.join('\n')) + '</code></pre>';
  flushAll();
  return out || '<div class="md-preview-empty">Nothing to preview yet.</div>';
}
function navMdLines(){ return ($('#mdSource').value || '').replace(/\r\n?/g, '\n').split('\n'); }
function navMdLineStart(line){
  const lines = navMdLines(); let at = 0;
  for(let i = 0; i < Math.min(line, lines.length); i++) at += lines[i].length + 1;
  return at;
}
function navMdLineOf(off){
  const s = $('#mdSource').value || ''; let line = 0;
  for(let i = 0; i < Math.min(off, s.length); i++) if(s[i] === '\n') line++;
  return line;
}
function navMdGrowLine(box){
  box.style.height = '0'; box.style.height = Math.max(25, box.scrollHeight) + 'px';
}
function navMdRememberEditor(box){
  if(!box) return;
  const start = navMdLineStart(+box.dataset.mdFrom || 0);
  navMdSelA = start + box.selectionStart; navMdSelB = start + box.selectionEnd;
  navMdLine = navMdLineOf(navMdSelB);
}
function navMdInstallLineEditor(preview, focus){
  const lines = navMdLines();
  navMdLine = clamp(navMdLine, 0, Math.max(0, lines.length - 1));
  let target = preview.querySelector('[data-md-line="' + navMdLine + '"]');
  if(!target){
    target = [...preview.querySelectorAll('[data-md-from][data-md-to]')].find(el =>
      navMdLine >= +el.dataset.mdFrom && navMdLine <= +el.dataset.mdTo);
  }
  if(!target) return null;
  const from = target.dataset.mdLine == null ? +target.dataset.mdFrom : +target.dataset.mdLine;
  const to = target.dataset.mdLine == null ? +target.dataset.mdTo : from;
  const box = document.createElement('textarea');
  box.className = 'md-line-editor'; box.dataset.mathpad = '';
  box.dataset.mdFrom = from; box.dataset.mdTo = to;
  box.setAttribute('aria-label', 'Active Markdown line'); box.spellcheck = true;
  box.value = lines.slice(from, to + 1).join('\n');
  const children = [...target.children].filter(el => el.matches('ul,ol'));
  target.innerHTML = ''; target.appendChild(box); children.forEach(el => target.appendChild(el));
  target.classList.add('md-active-line');
  const start = navMdLineStart(from);
  box.setSelectionRange(clamp(navMdSelA - start, 0, box.value.length),
    clamp(navMdSelB - start, 0, box.value.length));
  navMdGrowLine(box);
  if(focus) requestAnimationFrame(() => {
    if(document.contains(box)){ box.focus({ preventScroll:true });
      box.setSelectionRange(clamp(navMdSelA - start, 0, box.value.length),
        clamp(navMdSelB - start, 0, box.value.length)); }
  });
  return box;
}
function navRenderMarkdownPreview(focus){
  const preview = $('#mdPreview');
  preview.innerHTML = navMarkdownHTML($('#mdSource').value);
  const pen = typeof codePen === 'function' && codePen();
  preview.querySelectorAll('pre[data-lang]').forEach(pre => {
    const lang = pre.dataset.lang || '', code = (pre.querySelector('code') || pre).textContent || '';
    if(!pen || !pen.node) return;
    const node = pen.node({ blk:true, src:'```' + lang + '\n' + code + '\n```', lang, code }, true, preview);
    node.dataset.mdFrom = pre.dataset.mdFrom; node.dataset.mdTo = pre.dataset.mdTo;
    const scheme = node.querySelector('.csch'); if(scheme) scheme.remove();
    pre.replaceWith(node);
  });
  /* One line at a time, never the whole document: a formula compiles inside
     the line it was written on, and can no longer swallow the ones around it.
     Before the editor goes in, so the active line's source is never typeset. */
  if(typeof mathify === 'function')
    preview.querySelectorAll('.md-line,.md-math').forEach(el => mathify(el));
  if(navMdMode === 'write') navMdInstallLineEditor(preview, !!focus);
}
function navQueueMarkdownPreview(){
  if(navPreviewTimer) return;
  navPreviewTimer = requestAnimationFrame(() => { navPreviewTimer = 0; navRenderMarkdownPreview(); });
}

/* The textarea is only the active source run. Everything around it is already
   the compiled document; moving to another line seals this one immediately. */
function navMdStoreLive(box){
  const from = +box.dataset.mdFrom, to = +box.dataset.mdTo, lines = navMdLines();
  const inserted = box.value.replace(/\r\n?/g, '\n').split('\n');
  lines.splice(from, to - from + 1, ...inserted);
  $('#mdSource').value = lines.join('\n'); box.dataset.mdTo = from + inserted.length - 1;
  navMdRememberEditor(box); navMdGrowLine(box);
  const f = navMarkdownFile(); if(!f) return;
  f.content = $('#mdSource').value; f.updated = Date.now(); queueLib(); navMarkdownStats();
  navMdUndoMark();
}
function navMdOpenLine(line, caret, focus){
  const active = $('#mdPreview .md-line-editor'); if(active) navMdRememberEditor(active);
  const lines = navMdLines(); navMdLine = clamp(line, 0, Math.max(0, lines.length - 1));
  navMdSelA = navMdSelB = caret == null ? navMdLineStart(navMdLine) + (lines[navMdLine] || '').length : caret;
  navRenderMarkdownPreview(focus !== false);
}
function navMdSourceMap(line){
  const src = navMdLines()[line] || '';
  const lead = /^(?:#{1,6}\s+|\s*(?:[-*+]\s+(?:\[[ xX]\]\s+)?|\d+[.)]\s+|>\s?))/.exec(src);
  const start = lead ? lead[0].length : 0, map = [];
  for(let i = start; i < src.length;){
    const wiki = /^\[\[([^\]|\n]+?)(?:\|([^\]\n]+?))?\]\]/.exec(src.slice(i));
    if(wiki){
      const shown = wiki[2] === undefined ? wiki[1] : wiki[2];
      const at = i + 2 + (wiki[2] === undefined ? 0 : wiki[1].length + 1);
      for(let j = 0; j < shown.length; j++) map.push(at + j);
      i += wiki[0].length; continue;
    }
    const link = /^\[([^\]]+)\]\([^)]*\)/.exec(src.slice(i));
    if(link){ for(let j = 0; j < link[1].length; j++) map.push(i + 1 + j); i += link[0].length; continue; }
    if(src.slice(i, i + 2) === '**' || src.slice(i, i + 2) === '__' || src.slice(i, i + 2) === '~~'){
      i += 2; continue;
    }
    if(src[i] === '*' || src[i] === '_' || src[i] === '`'){ i++; continue; }
    map.push(i++);
  }
  map.push(src.length); return { src, map, start };
}
/* ---- where a click landed, in the source ----
   The compiled line and the line you wrote are different lengths, so a click
   has to be counted rather than measured: text counts itself, and something
   already compiled counts the whole run it was made from, because that is what
   the map underneath it is made of. `range.toString()` cannot do this — a
   typeset formula reports the two or three glyphs it drew rather than the
   `$x^2$` it was written as, and every caret after it on the line landed short
   by the difference. */
function navMdSourceLen(node){
  if(!node) return 0;
  if(node.nodeType === 3) return node.nodeValue.length;
  if(node.nodeType !== 1) return 0;
  const tex = node.getAttribute && node.getAttribute('data-tex');
  if(tex != null) return tex.length;
  let n = 0;
  for(let c = node.firstChild; c; c = c.nextSibling) n += navMdSourceLen(c);
  return n;
}
function navMdSourceBefore(root, node, offset){
  let n = 0, done = false;
  (function walk(el){
    if(done) return;
    if(el === node && el.nodeType === 1){
      for(let i = 0; i < offset && el.childNodes[i]; i++) n += navMdSourceLen(el.childNodes[i]);
      done = true; return;
    }
    for(let c = el.firstChild; c && !done; c = c.nextSibling){
      if(c === node){
        if(c.nodeType === 3) n += clamp(offset, 0, c.nodeValue.length);
        else for(let i = 0; i < offset && c.childNodes[i]; i++) n += navMdSourceLen(c.childNodes[i]);
        done = true; return;
      }
      if(c.nodeType === 3){ n += c.nodeValue.length; continue; }
      if(c.nodeType !== 1) continue;
      /* inside a formula there is nowhere finer to stand than in front of it */
      if(c.getAttribute && c.getAttribute('data-tex') != null){
        if(c.contains(node)){ done = true; return; }
        n += navMdSourceLen(c); continue;
      }
      if(c.contains(node)){ walk(c); return; }
      n += navMdSourceLen(c);
    }
  })(root);
  return n;
}
/* the line nearest the pointer, for a click that landed in the margins rather
   than on any writing — a page of paper is clickable all over */
function navMdNearestLine(e){
  let best = null, near = Infinity;
  for(const row of $('#mdPreview').querySelectorAll('[data-md-line],[data-md-from]')){
    const b = row.getBoundingClientRect();
    if(!b.height && !b.width) continue;
    const d = e.clientY < b.top ? b.top - e.clientY : e.clientY > b.bottom ? e.clientY - b.bottom : 0;
    if(d < near){ near = d; best = row; }
  }
  return best;
}
function navMdClickCaret(target, line, e){
  let point = null;
  if(document.caretPositionFromPoint){
    const p = document.caretPositionFromPoint(e.clientX, e.clientY);
    if(p) point = [p.offsetNode, p.offset];
  }else if(document.caretRangeFromPoint){
    const p = document.caretRangeFromPoint(e.clientX, e.clientY);
    if(p) point = [p.startContainer, p.startOffset];
  }
  const M = navMdSourceMap(line);
  if(!point || !target.contains(point[0])) return navMdLineStart(line) + M.src.length;
  const visible = navMdSourceBefore(target, point[0], point[1]);
  return navMdLineStart(line) + (M.map[Math.min(visible, M.map.length - 1)] ?? M.src.length);
}
function navMdSyncSourceSelection(){
  const live = $('#mdPreview .md-line-editor'); if(live) navMdRememberEditor(live);
  $('#mdSource').setSelectionRange(navMdSelA, navMdSelB);
}
function navMdCommitLines(lines){
  $('#mdSource').value = lines.join('\n');
  navMdUndoMark(true);
  const f = navMarkdownFile(); if(f){ f.content = $('#mdSource').value; f.updated = Date.now(); queueLib(); }
  navMarkdownStats();
}

/* ================= taking it back =================
   The document is one file; the box you are typing in is one line of it, and
   it is thrown away and remade every time the caret moves to another. The
   browser's own undo lives in that box, so it went with it — three lines back
   was simply gone. This is the document's own stack instead: what the whole
   file said, stepped through with the keys everything else in the app uses.

   A run of typing is one step. Anything structural — a line joined, a task
   ticked, a formatting button — is a step on its own, taken there and then. */
const MDU = { id:null, stack:[], at:-1, timer:0, hold:false };
function navMdUndoReset(text){
  MDU.id = navMdId; MDU.stack = [{ text:text || '', a:0, b:0 }]; MDU.at = 0;
  clearTimeout(MDU.timer); MDU.timer = 0;
}
function navMdUndoMark(now){
  if(MDU.hold || !navMdId || navMdId !== MDU.id) return;
  clearTimeout(MDU.timer);
  const push = () => {
    MDU.timer = 0;
    const text = $('#mdSource').value;
    if(MDU.stack[MDU.at] && MDU.stack[MDU.at].text === text) return;
    MDU.stack = MDU.stack.slice(0, MDU.at + 1);
    MDU.stack.push({ text, a:navMdSelA, b:navMdSelB });
    if(MDU.stack.length > 240) MDU.stack.shift();
    MDU.at = MDU.stack.length - 1;
  };
  if(now) push(); else MDU.timer = setTimeout(push, 420);
}
function navMdUndoStep(back){
  if(!navMdId || navMdId !== MDU.id) return false;
  if(MDU.timer) navMdUndoMark(true);            // what was just typed is a step
  const to = MDU.at + (back ? -1 : 1);
  if(to < 0 || to >= MDU.stack.length) return false;
  MDU.at = to;
  const step = MDU.stack[to];
  MDU.hold = true;
  $('#mdSource').value = step.text;
  const f = navMarkdownFile();
  if(f){ f.content = step.text; f.updated = Date.now(); queueLib(); }
  navMdSelA = navMdSelB = clamp(step.a, 0, step.text.length);
  navMdLine = navMdLineOf(navMdSelB);
  navMarkdownStats(); navRenderMarkdownPreview(true);
  MDU.hold = false;
  return true;
}
/* the two gestures, wherever the caret is — the same pair core/history.js
   answers to on the canvas, so the hand does not have to know which it is in */
function navMdUndoKey(e){
  if(!(e.ctrlKey || e.metaKey) || e.altKey) return false;
  const k = e.key.toLowerCase();
  if(k === 'z' && !e.shiftKey){ e.preventDefault(); navMdUndoStep(true); return true; }
  if(k === 'y' || (k === 'z' && e.shiftKey)){ e.preventDefault(); navMdUndoStep(false); return true; }
  return false;
}

/* ================= plain-text editing ================= */
function navMdPut(from, to, text, pickA, pickB){
  const box = $('#mdSource');
  const live = navMdMode === 'write' && !!$('#mdPreview .md-line-editor');
  if(!live) box.focus({ preventScroll:true });
  box.setRangeText(text, from, to, 'end');
  const a = pickA == null ? from + text.length : pickA;
  box.setSelectionRange(a, pickB == null ? a : pickB);
  box.dispatchEvent(new Event('input', { bubbles:true }));
  if(live){ navMdSelA = box.selectionStart; navMdSelB = box.selectionEnd;
    navMdLine = navMdLineOf(navMdSelB); navRenderMarkdownPreview(true); }
}
function navMdWrap(open, close, placeholder){
  const box = $('#mdSource'), s = box.value;
  let a = box.selectionStart, b = box.selectionEnd, chosen = s.slice(a, b);
  close = close == null ? open : close;
  if(a >= open.length && s.slice(a - open.length, a) === open && s.slice(b, b + close.length) === close){
    navMdPut(a - open.length, b + close.length, chosen, a - open.length, b - open.length); return;
  }
  if(chosen.startsWith(open) && chosen.endsWith(close) && chosen.length >= open.length + close.length){
    const bare = chosen.slice(open.length, chosen.length - close.length);
    navMdPut(a, b, bare, a, a + bare.length); return;
  }
  if(!chosen){
    let l = a, r = a;
    while(l > 0 && /[\p{L}\p{N}_-]/u.test(s[l - 1])) l--;
    while(r < s.length && /[\p{L}\p{N}_-]/u.test(s[r])) r++;
    if(r > l){ a = l; b = r; chosen = s.slice(l, r); }
  }
  chosen = chosen || placeholder || '';
  const text = open + chosen + close, p = a + open.length;
  navMdPut(a, b, text, p, p + chosen.length);
}
function navMdPrefix(kind){
  const box = $('#mdSource'), s = box.value, a = box.selectionStart, b = box.selectionEnd;
  const from = s.lastIndexOf('\n', Math.max(0, a - 1)) + 1;
  let to = s.indexOf('\n', b); if(to < 0) to = s.length;
  const lines = s.slice(from, to).split('\n');
  const own = kind === 'heading' ? /^\s*##\s+/
    : kind === 'task' ? /^\s*[-*+]\s+\[[ xX]\]\s+/ : /^\s*[-*+]\s+/;
  const allOwn = lines.every(line => own.test(line));
  const next = lines.map(line => {
    if(allOwn) return line.replace(own, '');
    const indent = (/^\s*/.exec(line) || [''])[0];
    const bare = line.slice(indent.length).replace(/^(?:#{1,6}\s+|[-*+]\s+(?:\[[ xX]\]\s+)?|\d+[.)]\s+)/, '');
    return indent + (kind === 'heading' ? '## ' : kind === 'task' ? '- [ ] ' : '- ') + bare;
  }).join('\n');
  navMdPut(from, to, next, from, from + next.length);
}
function navMdBlock(kind){
  const box = $('#mdSource'), s = box.value, a = box.selectionStart, b = box.selectionEnd;
  const chosen = s.slice(a, b), before = a && s[a - 1] !== '\n' ? '\n' : '';
  const after = b < s.length && s[b] !== '\n' ? '\n' : '';
  if(kind === 'rule'){
    const text = before + '---\n' + after;
    navMdPut(a, b, text, a + text.length - after.length); return;
  }
  const fence = kind === 'mathblock' ? '$$' : '```';
  const text = before + fence + '\n' + chosen + '\n' + fence + after;
  const p = a + before.length + fence.length + 1;
  navMdPut(a, b, text, p, p + chosen.length);
}
function navMdAction(action){
  if(navMdMode !== 'write') navSetMarkdownMode('write');
  navMdSyncSourceSelection();
  if(action === 'bold') return navMdWrap('**', '**', 'bold');
  if(action === 'italic') return navMdWrap('*', '*', 'italic');
  if(action === 'code') return navMdWrap('`', '`', 'code');
  if(action === 'math') return navMdWrap('$', '$', 'x');
  if(action === 'heading' || action === 'bullet' || action === 'task') return navMdPrefix(action);
  if(action === 'codeblock' || action === 'mathblock' || action === 'rule') return navMdBlock(action);
}
function navMdSmartEnter(e){
  const box = e.currentTarget;
  if(box.selectionStart !== box.selectionEnd) return false;
  const s = box.value, at = box.selectionStart;
  const from = s.lastIndexOf('\n', Math.max(0, at - 1)) + 1, line = s.slice(from, at);
  let prefix = '', body = '', m = /^(\s*[-*+]\s+\[[ xX]\]\s+)(.*)$/.exec(line);
  if(m){ prefix = m[1].replace(/\[[xX]\]/, '[ ]'); body = m[2]; }
  else if((m = /^(\s*[-*+]\s+)(.*)$/.exec(line))){ prefix = m[1]; body = m[2]; }
  else if((m = /^(\s*)(\d+)([.)]\s+)(.*)$/.exec(line))){ prefix = m[1] + (+m[2] + 1) + m[3]; body = m[4]; }
  else if((m = /^(\s*>\s?)(.*)$/.exec(line))){ prefix = m[1]; body = m[2]; }
  if(!prefix) return false;
  e.preventDefault();
  if(!body.trim()) navMdPut(from, at, '\n', from + 1);
  else navMdPut(at, at, '\n' + prefix, at + prefix.length + 1);
  return true;
}
function navMdIndent(e){
  const box = e.currentTarget, s = box.value, a = box.selectionStart, b = box.selectionEnd;
  const from = s.lastIndexOf('\n', Math.max(0, a - 1)) + 1;
  let to = s.indexOf('\n', b); if(to < 0) to = s.length;
  const block = s.slice(from, to), isBlock = a !== b || /^(\s*)(?:[-*+]\s+|\d+[.)]\s+|>\s?)/.test(block);
  if(!isBlock && !e.shiftKey){ e.preventDefault(); navMdPut(a, b, '  ', a + 2); return true; }
  if(!isBlock) return false;
  e.preventDefault();
  const next = block.split('\n').map(line => e.shiftKey ? line.replace(/^(?:  |\t)/, '') : '  ' + line).join('\n');
  navMdPut(from, to, next, from, from + next.length); return true;
}
function navToggleTask(line, checked){
  const box = $('#mdSource'), lines = box.value.replace(/\r\n?/g, '\n').split('\n');
  if(!lines[line]) return;
  lines[line] = lines[line].replace(/^(\s*[-*+]\s+)\[[ xX]\]/, '$1[' + (checked ? 'x' : ' ') + ']');
  box.value = lines.join('\n'); box.dispatchEvent(new Event('input', { bubbles:true }));
  navMdUndoMark(true);
  navRenderMarkdownPreview();
}

/* ================= document state ================= */
function navSetMarkdownMode(mode){
  navMdMode = mode === 'preview' ? 'preview' : 'write';
  $('#mdHost').classList.toggle('previewing', navMdMode === 'preview');
  for(const [id, on] of [['mdWriteBtn', navMdMode === 'write'], ['mdPreviewBtn', navMdMode === 'preview']]){
    $('#' + id).classList.toggle('on', on); $('#' + id).setAttribute('aria-pressed', String(on));
  }
  navRenderMarkdownPreview(navMdMode === 'write');
}
function navSaveMarkdown(){
  const f = navMarkdownFile(); if(!f) return;
  f.content = $('#mdSource').value; f.updated = Date.now();
  queueLib(); navMarkdownStats();
  if(navMdMode !== 'write' || !$('#mdPreview .md-line-editor')) navQueueMarkdownPreview();
  navMdUndoMark();
}
function navRenameOpenMarkdown(){
  const f = navMarkdownFile(); if(!f) return;
  let name = $('#mdName').value.trim() || 'Untitled.md';
  if(!/\.md$/i.test(name)) name += '.md';
  const was = f.name;
  f.name = navUniqueName(name, f.parentId || null, 'markdown', f.id);
  f.updated = Date.now(); $('#mdName').value = f.name; queueLib(); navRender();
  if(typeof wkRewrite === 'function') wkRewrite(was, f.name);
  navMarkdownStats();
}
async function navOpenMarkdown(id, focus){
  const f = navFileById(id); if(!f || f.kind !== 'markdown') return;
  await flush(); closeViewer(); closeFolder();
  navMdId = id; navActive = { kind:'markdown', id }; navFolder = f.parentId || null;
  document.body.classList.add('md-open'); $('#mdHost').hidden = false;
  $('#mdName').value = f.name || 'Untitled.md'; $('#mdSource').value = f.content || '';
  navMdLine = 0; navMdSelA = navMdSelB = 0;
  lib.lastEntry = { kind:'markdown', id }; queueLib(); navApplyMarkdownTheme(f);
  navMdUndoReset(f.content || '');
  navMdBackCount = typeof wkCounts === 'function' ? wkCounts(f).backlinks : 0;
  navMarkdownStats(); navMdMode = 'write';
  $('#mdHost').classList.remove('previewing');
  $('#mdWriteBtn').classList.add('on'); $('#mdWriteBtn').setAttribute('aria-pressed', 'true');
  $('#mdPreviewBtn').classList.remove('on'); $('#mdPreviewBtn').setAttribute('aria-pressed', 'false');
  navRenderMarkdownPreview(focus !== false); navRender();
}
function navLeaveMarkdown(){
  if(!navMdId) return;
  navSaveMarkdown(); cancelAnimationFrame(navPreviewTimer); navPreviewTimer = 0;
  navMdId = null; document.body.classList.remove('md-open'); $('#mdHost').hidden = true;
}

/* ================= wiring ================= */
function navMdLiveKey(e){
  const box = e.target.closest && e.target.closest('.md-line-editor');
  if(!box || e.defaultPrevented) return;
  if(typeof wkKeydown === 'function' && wkKeydown(e)) return;
  if((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === 'e' && !e.shiftKey){
    e.preventDefault(); navSetMarkdownMode('preview'); return;
  }
  if(navMdUndoKey(e)) return;
  if(e.ctrlKey || e.metaKey || e.altKey) return;
  const a = box.selectionStart, b = box.selectionEnd;
  const docLine = +box.dataset.mdFrom + box.value.slice(0, b).split('\n').length - 1;
  const single = +box.dataset.mdFrom === +box.dataset.mdTo;
  if(single && a === b && (e.key === 'Backspace' && a === 0 || e.key === 'ArrowLeft' && a === 0) && docLine > 0){
    e.preventDefault(); const lines = navMdLines(), line = docLine, at = lines[line - 1].length;
    if(e.key === 'Backspace'){ lines[line - 1] += lines[line]; lines.splice(line, 1); navMdCommitLines(lines); }
    navMdOpenLine(line - 1, navMdLineStart(line - 1) + at); return;
  }
  if(single && a === b && (e.key === 'Delete' && a === box.value.length || e.key === 'ArrowRight' && a === box.value.length) && docLine < navMdLines().length - 1){
    e.preventDefault(); const lines = navMdLines(), line = docLine, at = lines[line].length;
    if(e.key === 'Delete'){ lines[line] += lines[line + 1]; lines.splice(line + 1, 1); navMdCommitLines(lines); }
    navMdOpenLine(e.key === 'ArrowRight' ? line + 1 : line,
      e.key === 'ArrowRight' ? navMdLineStart(line + 1) : navMdLineStart(line) + at); return;
  }
  if(e.key === 'ArrowUp' && a === 0 && docLine > 0){
    e.preventDefault(); const line = docLine - 1;
    navMdOpenLine(line, navMdLineStart(line) + (navMdLines()[line] || '').length); return;
  }
  if(e.key === 'ArrowDown' && b === box.value.length && docLine < navMdLines().length - 1){
    e.preventDefault(); navMdOpenLine(docLine + 1, navMdLineStart(docLine + 1)); return;
  }
  if(e.key === 'Tab'){
    e.preventDefault();
    const from = box.value.lastIndexOf('\n', Math.max(0, a - 1)) + 1;
    let to = box.value.indexOf('\n', b); if(to < 0) to = box.value.length;
    const block = box.value.slice(from, to);
    const next = block.split('\n').map(line => e.shiftKey ? line.replace(/^(?:  |\t)/, '') : '  ' + line).join('\n');
    box.setRangeText(next, from, to, 'select');
    box.dispatchEvent(new Event('input', { bubbles:true }));
    navRenderMarkdownPreview(true); return;
  }
  if(e.key !== 'Enter' || e.shiftKey) return;
  /* A display equation remains one active source run while Return lays out its
     body. Code fences have already been claimed by tickpad in capture phase. */
  if(typeof mathRegion === 'function' && mathRegion(box.value, a)) return;
  e.preventDefault();
  const from = box.value.lastIndexOf('\n', Math.max(0, a - 1)) + 1;
  const line = box.value.slice(from, a);
  let prefix = '', body = '', m = /^(\s*[-*+]\s+\[[ xX]\]\s+)(.*)$/.exec(line);
  if(m){ prefix = m[1].replace(/\[[xX]\]/, '[ ]'); body = m[2]; }
  else if((m = /^(\s*[-*+]\s+)(.*)$/.exec(line))){ prefix = m[1]; body = m[2]; }
  else if((m = /^(\s*)(\d+)([.)]\s+)(.*)$/.exec(line))){ prefix = m[1] + (+m[2] + 1) + m[3]; body = m[4]; }
  else if((m = /^(\s*>\s?)(.*)$/.exec(line))){ prefix = m[1]; body = m[2]; }
  if(prefix && !body.trim()){
    const text = /^\s+/.test(prefix) ? prefix.replace(/^(?:  |\t)/, '') : '\n';
    box.setRangeText(text, from, a, 'end');
  }else box.setRangeText('\n' + prefix, a, b, 'end');
  box.dispatchEvent(new Event('input', { bubbles:true }));
  navRenderMarkdownPreview(true);
}
$('#mdSource').addEventListener('input', navSaveMarkdown);
$('#mdSource').addEventListener('keydown', e => {
  if(typeof wkKeydown === 'function' && wkKeydown(e)) return;
  if(navMdUndoKey(e)) return;
  if((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === 'e' && !e.shiftKey){
    e.preventDefault(); navSetMarkdownMode('preview'); return;
  }
  if(e.key === 'Enter' && !e.shiftKey && !e.altKey && !e.ctrlKey && !e.metaKey) navMdSmartEnter(e);
  else if(e.key === 'Tab' && !e.altKey && !e.ctrlKey && !e.metaKey) navMdIndent(e);
});
$('#mdFormat').addEventListener('pointerdown', e => { if(e.target.closest('[data-md-act]')) e.preventDefault(); });
$('#mdFormat').addEventListener('click', e => {
  const b = e.target.closest('[data-md-act]'); if(b) navMdAction(b.dataset.mdAct);
});
$('#mdPreview').addEventListener('change', e => {
  const task = e.target.closest('[data-md-task]'); if(task) navToggleTask(+task.dataset.mdTask, task.checked);
});
$('#mdPreview').addEventListener('input', e => {
  const box = e.target.closest && e.target.closest('.md-line-editor');
  if(!box) return;
  navMdStoreLive(box);
  if(typeof wkSync === 'function') wkSync(box);
});
/* the caret moved without the text changing — the list follows it out of a
   `[[` as readily as it opened inside one */
$('#mdPreview').addEventListener('keyup', e => {
  const box = e.target.closest && e.target.closest('.md-line-editor');
  if(box && typeof wkSync === 'function' && /^(Arrow|Home|End)/.test(e.key)) wkSync(box);
});
$('#mdPreview').addEventListener('keydown', navMdLiveKey);
$('#mdPreview').addEventListener('click', e => {
  /* a link is followed in both views — reading one is the whole point of it */
  const wiki = e.target.closest('.md-wiki');
  /* alt is the way into one: a plain click follows a link, and holding alt
     puts the caret in the text of it instead so it can be rewritten */
  if(wiki && !e.altKey){ e.preventDefault(); wkOpen(wiki.dataset.wiki); return; }
  if(navMdMode !== 'write' || e.target.closest('input,button,.md-line-editor')) return;
  if(e.target.closest('a')) e.preventDefault();
  /* the paper is clickable all over: a click in the margin, or under the last
     line, belongs to the writing nearest it rather than to nothing at all */
  const line = e.target.closest('[data-md-line],[data-md-from]') || navMdNearestLine(e);
  if(!line) return;
  const n = line.dataset.mdLine == null ? +line.dataset.mdFrom : +line.dataset.mdLine;
  navMdOpenLine(n, navMdClickCaret(line, n, e));
});
$('#mdName').addEventListener('change', navRenameOpenMarkdown);
$('#mdName').addEventListener('keydown', e => { if(e.key === 'Enter'){ e.preventDefault(); e.target.blur(); } });
$('#mdTheme').addEventListener('change', e => navSetMarkdownTheme(e.target.value));
$('#mdWriteBtn').addEventListener('click', () => navSetMarkdownMode('write'));
$('#mdPreviewBtn').addEventListener('click', () => navSetMarkdownMode('preview'));
$('#mdDownload').addEventListener('click', async () => {
  const f = navMarkdownFile(); if(!f) return;
  navSaveMarkdown();
  await plSaveFile(f.name || 'note.md', new Blob([f.content || ''], { type:'text/markdown;charset=utf-8' }));
});

/* ================= appearance ================= */
addCSS('markdown', `
.md-host{flex:1;min-height:0;background:color-mix(in srgb,var(--desk) 86%,#111);color:var(--ink);display:flex;flex-direction:column}
.md-host[hidden]{display:none}body.md-open .stage,body.md-open .tools-bar,body.md-open .cmap{display:none}body.md-open #layBtn,body.md-open #setBtn{display:none}
.md-bar{display:flex;align-items:center;gap:10px;padding:10px 14px;border-bottom:1px solid rgba(255,255,255,.075);background:rgba(0,0,0,.16);color:#ddd}
.md-identity{display:flex;align-items:baseline;gap:10px;min-width:0}.md-kind{font:8px var(--mono);letter-spacing:.16em;text-transform:uppercase;color:#777f85}
#mdName{min-width:100px;width:min(34vw,420px);border:0;border-bottom:1px solid transparent;outline:0;background:transparent;color:#e8e5dd;font:600 16px var(--body);padding:3px 2px}#mdName:hover,#mdName:focus{border-color:#5b6268}
.md-theme{display:flex;align-items:center;gap:6px;color:#8d959b;font:8px var(--mono);letter-spacing:.08em;text-transform:uppercase}.md-theme select{border:1px solid rgba(255,255,255,.1);border-radius:5px;outline:0;background:#2a3035;color:#d7dadd;padding:5px 22px 5px 7px;font:9px var(--mono)}.md-theme select:focus{border-color:var(--accent2)}
.md-modes{display:flex;padding:2px;border-radius:7px;background:rgba(0,0,0,.24)}.md-modes button,.md-download{padding:6px 9px;border-radius:5px;color:#90979d;font:9px var(--mono);letter-spacing:.06em;text-transform:uppercase}.md-modes button.on{background:#3a4046;color:#fff;box-shadow:0 1px 3px rgba(0,0,0,.3)}
.md-download{border:1px solid rgba(255,255,255,.1);color:#bbc0c4}.md-download:hover{color:#fff;border-color:var(--accent2)}
.md-format{display:flex;align-items:center;gap:2px;min-height:38px;padding:4px max(9px,calc((100% - 1060px)/2 + 9px));overflow-x:auto;border-bottom:1px solid rgba(255,255,255,.065);background:rgba(0,0,0,.11);color:#8e969c;scrollbar-width:none}.md-format::-webkit-scrollbar{display:none}.md-format button{flex:none;min-width:29px;height:28px;padding:0 6px;border-radius:5px;color:#aeb4b9;font:11px var(--mono)}.md-format button:hover,.md-format button:focus-visible{outline:0;color:#fff;background:rgba(255,255,255,.09)}.md-format button:active{transform:scale(.94)}
.md-format-rule{flex:none;width:1px;height:17px;margin:0 4px;background:rgba(255,255,255,.09)}.md-format-hint{margin-left:auto;white-space:nowrap;color:#687078;font:8px var(--mono);letter-spacing:.04em}
.md-paper{flex:1;min-height:0;width:min(100%,1060px);margin:0 auto;background:var(--paper);box-shadow:0 0 38px rgba(0,0,0,.2);display:block}#mdSource{display:none}.md-preview{display:block;width:100%;height:100%;min-width:0;min-height:0;margin:0;border:0;outline:0;overflow:auto;background:var(--paper);color:var(--ink);padding:clamp(34px,7vw,84px) clamp(28px,8vw,110px);font-size:16px;line-height:1.68;font-family:var(--body)}.md-preview h1,.md-preview h2,.md-preview h3,.md-preview h4,.md-preview h5,.md-preview h6{font-family:var(--disp);line-height:1.1;text-transform:none;margin:1.65em 0 .55em;letter-spacing:-.01em}.md-preview h1{font-size:2.45em;margin-top:0}.md-preview h2{font-size:1.85em}.md-preview h3{font-size:1.45em}.md-preview p{margin:.8em 0}.md-preview a{color:var(--accent2);text-underline-offset:.16em}.md-preview strong{font-weight:700}
.md-preview code:not(.ced){font:.84em var(--mono);background:color-mix(in srgb,var(--line) 45%,transparent);padding:.12em .35em;border-radius:3px}.md-preview>pre[data-lang]{position:relative;overflow:auto;background:#171a1f;color:#f2f4f7;padding:1.15em 1.3em;border-radius:7px;line-height:1.55}.md-preview>pre[data-lang] code{background:none;padding:0;color:inherit}.md-preview>pre[data-lang]:not([data-lang=""])::after{content:attr(data-lang);position:absolute;right:9px;top:7px;font:8px var(--mono);letter-spacing:.1em;text-transform:uppercase;opacity:.65}.md-preview .cbx.cfence{margin:1.25em 0;font-size:.84em;--c-bg:#171a1f;--c-fg:#f2f4f7;--c-bar:#252a31;--c-cm:#8fcb7c;--c-st:#eab38f;--c-es:#f0ca7a;--c-nm:#b9d99a;--c-kw:#79b8ff;--c-fl:#d7a6ff;--c-ty:#70d7c7;--c-fn:#f1dc8b;--c-cn:#70c8ff;--c-pp:#d7a6ff;--c-vr:#b6ddff;--c-op:#f2f4f7}.md-preview .cbx.cfence .csch{display:none}.md-preview .cbx.cfence .cwin{margin:0;padding:.75em .9em;border-radius:0;background:var(--c-bg);color:var(--c-fg)}
.md-preview blockquote{margin:1.1em 0;padding:.1em 0 .1em 1em;border-left:3px solid var(--accent2);color:var(--soft)}.md-preview ul,.md-preview ol{padding-left:1.45em}.md-preview li{margin:.3em 0}.md-preview li>ul,.md-preview li>ol{margin:.3em 0 .15em}.md-preview .tasks{list-style:none;padding-left:.1em}.md-preview .tasks>.md-task{display:grid;grid-template-columns:auto minmax(0,1fr);column-gap:.65em;align-items:start}.md-preview .tasks>.md-task>ul,.md-preview .tasks>.md-task>ol{grid-column:2}.md-preview .tasks input{margin-top:.38em;accent-color:var(--accent2);cursor:pointer}.md-preview hr{height:0;border:0;border-top:1px solid color-mix(in srgb,var(--ink) 34%,transparent);margin:2em 0}.md-preview-empty{color:var(--soft);font-style:italic}
.md-line{cursor:text}.md-blank{min-height:.72em}.md-rule-line{padding:.1px 0}.md-line-editor{display:block;width:100%;min-height:1.45em;margin:0;padding:0;border:0;outline:0;resize:none;overflow:hidden;background:transparent;color:inherit;caret-color:var(--accent);font:inherit;font-weight:inherit;line-height:inherit;letter-spacing:inherit;text-transform:inherit;tab-size:2}.md-line-editor::selection{background:color-mix(in srgb,var(--accent2) 24%,transparent)}.md-active-line{list-style:none}.md-preview .tasks>.md-active-line.md-task{display:block}.md-active-line>.md-line-editor+ul,.md-active-line>.md-line-editor+ol{margin-top:.3em}.cbx.cfence>.md-line-editor{padding:.75em .9em;background:var(--c-bg);color:var(--c-fg);caret-color:var(--c-fg);font:1em/1.55 var(--mono);white-space:pre;overflow-x:auto}
.md-status{display:flex;justify-content:space-between;gap:12px;padding:6px 14px;background:rgba(0,0,0,.18);color:#747c82;font:8px var(--mono);letter-spacing:.07em;text-transform:uppercase}
@media (max-width:620px){.md-kind,.md-theme span{display:none}#mdName{width:32vw;font-size:14px}.md-download{display:none}.md-preview{padding:28px 22px}.md-bar{padding:8px}.md-status span:last-child,.md-format-hint{display:none}}
@media (pointer:coarse){.md-format button{min-width:38px;height:34px}}
`);

/* ---- what belongs to what ----
   The canvas writer draws a hairline down from a bullet to everything nested
   under it (lib/marks.js paints it as the row's own background, because there
   is no list element there to hang it on). Markdown compiles real nested lists,
   so here the same line is that list's left border — one per level, unbroken
   from the first child to the last, and it lights up under the pointer so a
   deep list can be read a branch at a time. */
addCSS('markdown nesting', `
.md-preview li>ul,.md-preview li>ol,.md-preview li>ul.tasks,.md-preview li>ol.tasks{
  margin-left:.34em;padding-left:1.05em;
  border-left:1px solid color-mix(in srgb,var(--ink) 19%,transparent);
  transition:border-color .14s ease}
.md-preview li>ul:hover,.md-preview li>ol:hover{
  border-left-color:color-mix(in srgb,var(--accent2) 62%,transparent)}
/* under a task the line belongs beneath the box, not beneath its words */
.md-preview .tasks>.md-task>ul,.md-preview .tasks>.md-task>ol{margin-left:-1.05em;padding-left:1.5em}
/* a display equation written between two $$ lines is one block and one run */
.md-preview .md-math{margin:1.35em 0;padding:.1em 0;overflow-x:auto;overflow-y:hidden;
  text-align:center;cursor:text}
.md-preview .md-math .math.dsp{display:block}
.md-math>.md-line-editor{text-align:left;font:.92em/1.5 var(--mono);
  color:color-mix(in srgb,var(--ink) 82%,transparent)}
`);
