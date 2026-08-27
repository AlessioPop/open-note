/* Open Note — chrome/markdown.js
   the library's Markdown document, preview and plain-text editing tools */

let navMdId = null;
let navMdMode = 'write';
let navPreviewTimer = 0;
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
function navMarkdownStats(){
  const src = $('#mdSource').value || '', words = (src.trim().match(/\S+/g) || []).length;
  $('#mdWords').textContent = words + ' word' + (words === 1 ? '' : 's') +
    ' · ' + src.length.toLocaleString() + ' characters';
}

/* ================= preview ================= */
function navMdInline(src){
  const code = [];
  let s = String(src || '').replace(/`([^`]+)`/g, (_, v) => '\u0000' + (code.push(v) - 1) + '\u0000');
  s = esc(s);
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
function navMarkdownHTML(source){
  const lines = String(source || '').replace(/\r\n?/g, '\n').split('\n');
  let out = '', para = [], list = '', quote = [], code = null, lang = '';
  const flushPara = () => { if(para.length){ out += '<p>' + navMdInline(para.join(' ')) + '</p>'; para = []; } };
  const flushList = () => { if(list){ out += '</' + list + '>'; list = ''; } };
  const flushQuote = () => { if(quote.length){ out += '<blockquote>' + navMdInline(quote.join(' ')) + '</blockquote>'; quote = []; } };
  const flushAll = () => { flushPara(); flushList(); flushQuote(); };
  for(let i = 0; i < lines.length; i++){
    const line = lines[i];
    if(code !== null){
      if(/^\s*```/.test(line)){
        out += '<pre data-lang="' + esc(lang) + '"><code>' + esc(code.join('\n')) + '</code></pre>';
        code = null; lang = '';
      }else code.push(line);
      continue;
    }
    const fence = /^\s*```\s*([^\s]*)/.exec(line);
    if(fence){ flushAll(); code = []; lang = fence[1] || ''; continue; }
    if(!line.trim()){ flushAll(); continue; }
    const h = /^(#{1,6})\s+(.+)$/.exec(line);
    if(h){ flushAll(); const n = h[1].length; out += '<h' + n + '>' + navMdInline(h[2]) + '</h' + n + '>'; continue; }
    if(/^\s*([-*_])(?:\s*\1){2,}\s*$/.test(line)){ flushAll(); out += '<hr>'; continue; }
    const q = /^\s*>\s?(.*)$/.exec(line);
    if(q){ flushPara(); flushList(); quote.push(q[1]); continue; }
    const task = /^\s*[-*+]\s+\[([ xX])\]\s+(.*)$/.exec(line);
    if(task){
      flushPara(); flushQuote(); if(list && list !== 'ul') flushList();
      if(!list){ out += '<ul class="tasks">'; list = 'ul'; }
      out += '<li><input type="checkbox" data-md-task="' + i + '"' +
        (task[1].toLowerCase() === 'x' ? ' checked' : '') + ' aria-label="Mark task ' +
        (task[1].toLowerCase() === 'x' ? 'incomplete' : 'complete') + '"><span>' +
        navMdInline(task[2]) + '</span></li>';
      continue;
    }
    const bullet = /^\s*[-*+]\s+(.*)$/.exec(line);
    if(bullet){
      flushPara(); flushQuote(); if(list && list !== 'ul') flushList();
      if(!list){ out += '<ul>'; list = 'ul'; }
      out += '<li>' + navMdInline(bullet[1]) + '</li>'; continue;
    }
    const num = /^\s*\d+[.)]\s+(.*)$/.exec(line);
    if(num){
      flushPara(); flushQuote(); if(list && list !== 'ol') flushList();
      if(!list){ out += '<ol>'; list = 'ol'; }
      out += '<li>' + navMdInline(num[1]) + '</li>'; continue;
    }
    flushList(); flushQuote(); para.push(line.trim());
  }
  if(code !== null) out += '<pre data-lang="' + esc(lang) + '"><code>' + esc(code.join('\n')) + '</code></pre>';
  flushAll();
  return out || '<div class="md-preview-empty">Nothing to preview yet.</div>';
}
function navRenderMarkdownPreview(){
  const preview = $('#mdPreview');
  preview.innerHTML = navMarkdownHTML($('#mdSource').value);
  const pen = typeof codePen === 'function' && codePen();
  preview.querySelectorAll('pre[data-lang]').forEach(pre => {
    const lang = pre.dataset.lang || '', code = (pre.querySelector('code') || pre).textContent || '';
    if(!pen || !pen.node) return;
    const node = pen.node({ blk:true, src:'```' + lang + '\n' + code + '\n```', lang, code }, true, preview);
    const scheme = node.querySelector('.csch'); if(scheme) scheme.remove();
    pre.replaceWith(node);
  });
  if(typeof mathify === 'function') mathify(preview);
}
function navQueueMarkdownPreview(){
  clearTimeout(navPreviewTimer);
  navPreviewTimer = setTimeout(() => { navPreviewTimer = 0; navRenderMarkdownPreview(); }, 100);
}

/* ================= plain-text editing ================= */
function navMdPut(from, to, text, pickA, pickB){
  const box = $('#mdSource');
  box.focus({ preventScroll:true }); box.setRangeText(text, from, to, 'end');
  const a = pickA == null ? from + text.length : pickA;
  box.setSelectionRange(a, pickB == null ? a : pickB);
  box.dispatchEvent(new Event('input', { bubbles:true }));
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
  navRenderMarkdownPreview();
}

/* ================= document state ================= */
function navSetMarkdownMode(mode){
  navMdMode = mode === 'preview' ? 'preview' : 'write';
  $('#mdHost').classList.toggle('previewing', navMdMode === 'preview');
  for(const [id, on] of [['mdWriteBtn', navMdMode === 'write'], ['mdPreviewBtn', navMdMode === 'preview']]){
    $('#' + id).classList.toggle('on', on); $('#' + id).setAttribute('aria-pressed', String(on));
  }
  if(navMdMode === 'preview') navRenderMarkdownPreview();
  else requestAnimationFrame(() => $('#mdSource').focus({ preventScroll:true }));
}
function navSaveMarkdown(){
  const f = navMarkdownFile(); if(!f) return;
  f.content = $('#mdSource').value; f.updated = Date.now();
  queueLib(); navMarkdownStats(); navQueueMarkdownPreview();
}
function navRenameOpenMarkdown(){
  const f = navMarkdownFile(); if(!f) return;
  let name = $('#mdName').value.trim() || 'Untitled.md';
  if(!/\.md$/i.test(name)) name += '.md';
  f.name = navUniqueName(name, f.parentId || null, 'markdown', f.id);
  f.updated = Date.now(); $('#mdName').value = f.name; queueLib(); navRender();
}
async function navOpenMarkdown(id, focus){
  const f = navFileById(id); if(!f || f.kind !== 'markdown') return;
  await flush(); closeViewer(); closeFolder();
  navMdId = id; navActive = { kind:'markdown', id }; navFolder = f.parentId || null;
  document.body.classList.add('md-open'); $('#mdHost').hidden = false;
  $('#mdName').value = f.name || 'Untitled.md'; $('#mdSource').value = f.content || '';
  lib.lastEntry = { kind:'markdown', id }; queueLib(); navApplyMarkdownTheme(f);
  navMarkdownStats(); navRenderMarkdownPreview(); navSetMarkdownMode('write'); navRender();
  if(focus !== false) requestAnimationFrame(() => $('#mdSource').focus({ preventScroll:true }));
}
function navLeaveMarkdown(){
  if(!navMdId) return;
  navSaveMarkdown(); clearTimeout(navPreviewTimer); navPreviewTimer = 0;
  navMdId = null; document.body.classList.remove('md-open'); $('#mdHost').hidden = true;
}

/* ================= wiring ================= */
$('#mdSource').addEventListener('input', navSaveMarkdown);
$('#mdSource').addEventListener('keydown', e => {
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
.md-paper{flex:1;min-height:0;width:min(100%,1060px);margin:0 auto;background:var(--paper);box-shadow:0 0 38px rgba(0,0,0,.2);display:flex}#mdSource,.md-preview{flex:1;width:100%;min-width:0;margin:0;border:0;outline:0;resize:none;overflow:auto;background:var(--paper);color:var(--ink);padding:clamp(34px,7vw,84px) clamp(28px,8vw,110px);font-size:16px;line-height:1.68}#mdSource{font-family:var(--mono);font-size:13px;line-height:1.75;tab-size:2;caret-color:var(--accent)}
.md-preview{display:none;font-family:var(--body)}.md-host.previewing #mdSource{display:none}.md-host.previewing .md-preview{display:block}.md-preview h1,.md-preview h2,.md-preview h3,.md-preview h4,.md-preview h5,.md-preview h6{font-family:var(--disp);line-height:1.1;text-transform:none;margin:1.65em 0 .55em;letter-spacing:-.01em}.md-preview h1{font-size:2.45em;margin-top:0}.md-preview h2{font-size:1.85em;border-bottom:1px solid var(--line);padding-bottom:.28em}.md-preview h3{font-size:1.45em}.md-preview p{margin:.8em 0}.md-preview a{color:var(--accent2);text-underline-offset:.16em}.md-preview strong{font-weight:700}
.md-preview code{font:.84em var(--mono);background:color-mix(in srgb,var(--line) 45%,transparent);padding:.12em .35em;border-radius:3px}.md-preview pre{position:relative;overflow:auto;background:color-mix(in srgb,var(--ink) 92%,#000);color:var(--paper);padding:1.15em 1.3em;border-radius:7px;line-height:1.55}.md-preview pre code{background:none;padding:0;color:inherit}.md-preview pre[data-lang]:not([data-lang=""])::after{content:attr(data-lang);position:absolute;right:9px;top:7px;font:8px var(--mono);letter-spacing:.1em;text-transform:uppercase;opacity:.5}.md-preview .cbx.cfence{margin:1.25em 0;font-size:.84em}.md-preview .cbx.cfence .csch{display:none}
.md-preview blockquote{margin:1.1em 0;padding:.1em 0 .1em 1em;border-left:3px solid var(--accent2);color:var(--soft)}.md-preview ul,.md-preview ol{padding-left:1.45em}.md-preview li{margin:.3em 0}.md-preview .tasks{list-style:none;padding-left:.1em}.md-preview .tasks li{display:flex;gap:.65em;align-items:flex-start}.md-preview .tasks input{margin-top:.38em;accent-color:var(--accent2);cursor:pointer}.md-preview hr{border:0;border-top:1px solid var(--line);margin:2em 0}.md-preview-empty{color:var(--soft);font-style:italic}
.md-status{display:flex;justify-content:space-between;gap:12px;padding:6px 14px;background:rgba(0,0,0,.18);color:#747c82;font:8px var(--mono);letter-spacing:.07em;text-transform:uppercase}
@media (max-width:620px){.md-kind,.md-theme span{display:none}#mdName{width:38vw;font-size:14px}.md-download{display:none}#mdSource,.md-preview{padding:28px 22px}.md-bar{padding:8px}.md-status span:last-child,.md-format-hint{display:none}}
@media (pointer:coarse){.md-format button{min-width:38px;height:34px}}
`);
