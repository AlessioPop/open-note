/* Open Note — chrome/wiki.js
   [[links]] between library files: the syntax, what a name resolves to, the
   list that offers one while you type, and the index the dashboard draws */

/* ================= the syntax =================
   `[[Name]]`, or `[[Name|what to call it here]]`. A name is a file's name with
   or without its `.md`, and it may carry as much of a path as you care to give
   (`Thesis/Chapter 3`) when two files share a name. Nothing is stored but the
   text you wrote: a link is resolved every time it is drawn, so renaming,
   moving or creating the other end fixes every link to it at once — and a link
   to something that does not exist yet is a real thing here, drawn hollow and
   offering to make it. That is what makes writing one before the note exists
   the normal way round. */
const WK_RE = /\[\[([^\]|\n]+?)(?:\|([^\]\n]+?))?\]\]/g;
const WK_MAX = 8;                                  // rows the list offers at once

const wkUnesc = s => String(s == null ? '' : s)
  .replace(/&quot;/g, '"').replace(/&gt;/g, '>').replace(/&lt;/g, '<').replace(/&amp;/g, '&');
/* a name, as it is compared: no .md, no case, no stray spaces */
const wkKey = name => String(name || '').trim().replace(/\.md$/i, '').toLowerCase();

/* Code is code. A `[[` inside a fence or a tick is text someone is writing
   about links, not a link — blanked out rather than cut, so every offset in
   what comes back still points at the same character of the original. */
function wkClean(src){
  const blank = m => m.replace(/[^\n]/g, ' ');
  return String(src || '').replace(/```[\s\S]*?(?:```|$)/g, blank).replace(/`[^`\n]*`/g, blank);
}
function wkScan(src){
  const s = wkClean(src), out = [];
  let m;
  WK_RE.lastIndex = 0;
  while((m = WK_RE.exec(s)))
    out.push({ at:m.index, len:m[0].length, name:m[1].trim(), label:(m[2] || '').trim() });
  return out;
}

/* ---- what a name points at ----
   Markdown first, then canvases: both are things a note can be about. Among
   several of the same name the one beside the file you are writing in wins,
   which is what a folder is for. */
function wkTarget(name, fromParent){
  if(!lib) return null;
  const parts = wkKey(name).split('/').filter(Boolean);
  const leaf = parts[parts.length - 1];
  if(!leaf) return null;
  const found = [];
  for(const f of lib.files || [])
    if(f.kind === 'markdown' && wkKey(f.name) === leaf) found.push({ kind:'markdown', id:f.id, entry:f });
  for(const b of lib.books || [])
    if(wkKey(b.name) === leaf) found.push({ kind:'canvas', id:b.id, entry:b });
  if(!found.length) return null;
  if(parts.length > 1){
    const want = parts.slice(0, -1).join('/');
    const onPath = found.find(c =>
      navPathParts(c.entry.parentId).join('/').toLowerCase().endsWith(want));
    if(onPath) return onPath;
  }
  const here = found.find(c => (c.entry.parentId || null) === (fromParent || null));
  return here || found[0];
}
const wkParent = () => {
  const f = typeof navMarkdownFile === 'function' && navMarkdownFile();
  return f ? f.parentId || null : null;
};

/* ---- as it is drawn ----
   Called on text that has already been escaped, like every other inline rule in
   chrome/markdown.js, so the name comes back out of it before it is looked up
   and goes back in escaped when it is written to the attribute. */
function wkInlineHTML(escaped, fromParent){
  const parent = fromParent === undefined ? wkParent() : fromParent;
  return String(escaped || '').replace(WK_RE, (whole, rawName, rawLabel) => {
    const name = wkUnesc(rawName).trim();
    if(!name) return whole;
    const t = wkTarget(name, parent);
    /* the label is written out exactly as it was typed — the caret map in
       chrome/markdown.js counts these characters back to their source */
    const label = rawLabel === undefined ? rawName : rawLabel;
    const where = t ? navPathFor(t.kind, t.id).join(' / ') : '';
    return '<a class="md-wiki' + (t ? '' : ' new') + '" data-wiki="' + esc(name) + '"' +
      ' title="' + esc(t ? 'Open ' + where : name + ' — not made yet. Click to start it.') + '">' +
      label + '</a>';
  });
}

/* ---- following one ---- */
async function wkOpen(name){
  const parent = wkParent(), t = wkTarget(name, parent);
  if(t){
    if(t.kind === 'canvas') return openNote(t.id);
    return navOpenMarkdown(t.id);
  }
  const clean = String(name || '').trim().split('/').pop();
  if(!clean) return;
  if(!confirm('"' + clean + '" does not exist yet.\n\nStart it as a Markdown file' +
    (parent ? ' in this folder' : ' at the root of the library') + '?')) return;
  const file = { id:uid(), kind:'markdown', parentId:parent, theme:'canvas',
    name:navUniqueName(/\.md$/i.test(clean) ? clean : clean + '.md', parent, 'markdown'),
    content:'# ' + clean.replace(/\.md$/i, '') + '\n\n', created:Date.now(), updated:Date.now() };
  lib.files.push(file);
  if(parent && typeof navRevealFolder === 'function') navRevealFolder(parent);
  queueLib(); navRender();
  await navOpenMarkdown(file.id, true);
}

/* ---- a rename carries its links with it ----
   Every link is written as a name, so renaming a file would otherwise break
   every mention of it. Only whole names are rewritten, the label side of a
   `[[name|label]]` is left exactly as it was written, and a file that changes
   nothing is not touched — so nothing is re-saved that did not need to be. */
function wkRewrite(oldName, newName){
  if(!lib || !oldName || !newName) return 0;
  const was = wkKey(oldName), now = String(newName || '').replace(/\.md$/i, '');
  if(!was || was === wkKey(now)) return 0;
  let touched = 0;
  for(const f of lib.files || []){
    if(f.kind !== 'markdown' || !f.content) continue;
    const hits = wkScan(f.content).filter(h => wkKey(h.name.split('/').pop()) === was);
    if(!hits.length) continue;
    let src = f.content;
    for(let i = hits.length - 1; i >= 0; i--){                 // back to front, so offsets hold
      const h = hits[i];
      src = src.slice(0, h.at) + '[[' + now + (h.label ? '|' + h.label : '') + ']]' + src.slice(h.at + h.len);
    }
    f.content = src; f.updated = Date.now(); touched++;
    if(typeof navMdId !== 'undefined' && navMdId === f.id){
      $('#mdSource').value = src;
      if(typeof navRenderMarkdownPreview === 'function') navRenderMarkdownPreview(false);
    }
  }
  if(touched) queueLib();
  return touched;
}

/* ================= the index the graph is drawn from =================
   Every Markdown file and every canvas is a node whether anything points at it
   or not — an unlinked note is a fact about the library worth seeing. A name
   nothing answers to becomes a node too, hollow, so the graph also shows what
   you have promised yourself to write. */
function wkIndex(){
  const nodes = [], at = new Map();
  const put = (kind, id, name, parentId) => {
    at.set(kind + ':' + id, nodes.length);
    nodes.push({ key:kind + ':' + id, kind, id, name:name || 'Untitled',
      /* what a [[link]] would call it — the graph labels its dots the way you
         would have to write them, which is the name without its .md */
      label:String(name || 'Untitled').replace(/\.md$/i, ''),
      path:navPathParts(parentId).join(' / '), links:0, backlinks:0 });
  };
  for(const f of (lib && lib.files) || []) if(f.kind === 'markdown') put('markdown', f.id, f.name, f.parentId);
  for(const b of (lib && lib.books) || []) put('canvas', b.id, b.name, b.parentId);
  const links = [], seen = new Set(), ghosts = new Map();
  for(const f of (lib && lib.files) || []){
    if(f.kind !== 'markdown') continue;
    const from = 'markdown:' + f.id;
    for(const h of wkScan(f.content)){
      const t = wkTarget(h.name, f.parentId);
      let to;
      if(t) to = t.kind + ':' + t.id;
      else{
        const leaf = String(h.name).split('/').pop().trim();
        to = 'ghost:' + wkKey(leaf);
        if(!ghosts.has(to)) ghosts.set(to, leaf);
      }
      if(to === from) continue;
      const sig = from + ' ' + to;
      if(seen.has(sig)) continue;
      seen.add(sig); links.push({ from, to });
    }
  }
  for(const [key, name] of ghosts){
    at.set(key, nodes.length);
    nodes.push({ key, kind:'ghost', id:null, name, label:name, path:'', links:0, backlinks:0 });
  }
  for(const l of links){
    const a = nodes[at.get(l.from)], b = nodes[at.get(l.to)];
    if(a) a.links++;
    if(b) b.backlinks++;
  }
  return { nodes, links, at };
}
/* what the file being written points at, and what points back at it */
function wkCounts(file){
  if(!file) return { links:0, backlinks:0 };
  const out = new Set();
  for(const h of wkScan(file.content)){
    const t = wkTarget(h.name, file.parentId);
    out.add(t ? t.kind + ':' + t.id : 'ghost:' + wkKey(h.name));
  }
  out.delete('markdown:' + file.id);
  let back = 0;
  for(const f of (lib && lib.files) || []){
    if(f.kind !== 'markdown' || f.id === file.id) continue;
    if(wkScan(f.content).some(h => {
      const t = wkTarget(h.name, f.parentId);
      return t && t.kind === 'markdown' && t.id === file.id;
    })) back++;
  }
  return { links:out.size, backlinks:back };
}

/* ================= the list that offers a name =================
   The same shape as the equation helper: it never takes the focus, it follows
   the caret, and the only keys it takes are the four it is showing you. */
const WK = { box:null, at:-1, q:'', list:[], i:0, on:false };

function wkPad(){
  let el = $('#wikipad');
  if(el) return el;
  el = document.createElement('div');
  el.id = 'wikipad'; el.className = 'wikipad glass';
  el.innerHTML = '<ul class="wklist"></ul><div class="wkhint">up/down pick, enter takes, esc closes</div>';
  document.body.appendChild(el);
  el.addEventListener('pointerdown', e => e.preventDefault());
  el.addEventListener('click', e => {
    const li = e.target.closest('li');
    if(!li) return;
    WK.i = +li.dataset.i; wkTake();
  });
  return el;
}
/* every name a link could mean, the ones that start with what you typed first */
function wkSuggest(q){
  const want = wkKey(q), out = [];
  const push = (kind, name, parentId) => {
    const key = wkKey(name), where = navPathParts(parentId).join(' / ');
    const rank = !want ? 2 : key.startsWith(want) ? 0 : key.includes(want) ? 1
      : where.toLowerCase().includes(want) ? 3 : -1;
    if(rank < 0) return;
    out.push({ kind, name:String(name || '').replace(/\.md$/i, ''), where, rank });
  };
  for(const f of (lib && lib.files) || []) if(f.kind === 'markdown') push('markdown', f.name, f.parentId);
  for(const b of (lib && lib.books) || []) push('canvas', b.name, b.parentId);
  out.sort((a, b) => a.rank - b.rank ||
    a.name.localeCompare(b.name, undefined, { numeric:true, sensitivity:'base' }));
  /* What you typed is offered as itself at the foot of the list, so a note that
     does not exist yet can be linked to without leaving the sentence — under
     the real files, never over them: the common case is meaning one you have. */
  const typed = String(q || '').trim();
  const fresh = typed && !out.some(e => wkKey(e.name) === want);
  const rows = out.slice(0, WK_MAX - (fresh ? 1 : 0));
  if(fresh) rows.push({ kind:'new', name:typed, where:'not made yet', rank:9 });
  return rows;
}
function wkRows(){
  const ul = wkPad().querySelector('.wklist');
  ul.innerHTML = WK.list.map((e, i) =>
    '<li data-i="' + i + '"' + (i === WK.i ? ' class="on"' : '') + '>' +
    '<span class="wkg ' + e.kind + '" aria-hidden="true">' +
      (e.kind === 'canvas' ? '∞' : e.kind === 'new' ? '+' : 'M') + '</span>' +
    '<span class="wkname">' + esc(e.name) + '</span>' +
    '<span class="wkwhere">' + esc(e.where || 'Library root') + '</span></li>').join('');
  const on = ul.children[WK.i];
  if(on){
    const t = on.offsetTop, b = t + on.offsetHeight;
    if(t < ul.scrollTop) ul.scrollTop = t;
    else if(b > ul.scrollTop + ul.clientHeight) ul.scrollTop = b - ul.clientHeight;
  }
}
function wkPlace(){
  const el = wkPad(), box = WK.box;
  if(!box) return;
  let r = null;
  if(typeof mpadTextRect === 'function'){
    try{ r = mpadTextRect(box, Math.max(0, WK.at - 2)); }catch(e){ r = null; }
  }
  if(!r) r = box.getBoundingClientRect();
  const w = el.offsetWidth, h = el.offsetHeight;
  let y = r.bottom + 8;
  if(y + h > innerHeight - 8) y = Math.max(8, r.top - h - 8);
  el.style.left = clamp(r.left - 10, 8, Math.max(8, innerWidth - w - 8)) + 'px';
  el.style.top = clamp(y, 8, Math.max(8, innerHeight - h - 8)) + 'px';
}
function wkHide(){
  if(!WK.on) return;
  WK.on = false; WK.box = null; WK.at = -1; WK.list = [];
  const el = $('#wikipad');
  if(el) warpOut(el, () => { if(!WK.on) el.classList.remove('open'); });
}
/* the `[[` the caret is standing inside, if it is standing inside one */
function wkOpening(s, off){
  const open = String(s || '').lastIndexOf('[[', Math.max(0, off - 1));
  if(open < 0) return -1;
  const between = s.slice(open + 2, off);
  if(/[\]\n]/.test(between)) return -1;
  return open + 2;
}
function wkSync(box){
  if(!box || !document.contains(box) || box.selectionStart !== box.selectionEnd) return wkHide();
  const s = box.value, off = box.selectionStart, at = wkOpening(s, off);
  if(at < 0) return wkHide();
  const q = s.slice(at, off);
  if(q.indexOf('|') >= 0) return wkHide();
  const list = wkSuggest(q);
  if(!list.length) return wkHide();
  const fresh = box !== WK.box || at !== WK.at;
  WK.box = box; WK.at = at; WK.q = q; WK.list = list;
  WK.i = fresh ? 0 : clamp(WK.i, 0, list.length - 1);
  const el = wkPad();
  wkRows();
  if(!WK.on){
    WK.on = true; el.classList.add('open'); wkPlace();
    const r = el.getBoundingClientRect();
    warpIn(el, r.left + r.width / 2, r.top);
  }else wkPlace();
}
function wkTake(){
  const box = WK.box, pick = WK.list[WK.i];
  if(!box || !pick) return wkHide();
  const s = box.value, end = box.selectionStart;
  const shut = s.slice(end, end + 2) === ']]';
  box.focus({ preventScroll:true });
  box.setRangeText(pick.name + (shut ? '' : ']]'), WK.at, end, 'end');
  const to = WK.at + pick.name.length + 2;
  box.setSelectionRange(to, to);
  box.dispatchEvent(new Event('input', { bubbles:true }));
  wkHide();
}
/* true when the key was the list's, or the pairing's, and nothing else should
   see it. Called from both Markdown keyboards before either reads the key. */
function wkKeydown(e){
  const box = e.target;
  if(!box || box.tagName !== 'TEXTAREA') return false;
  if(e.key === '[' && !e.ctrlKey && !e.metaKey && !e.altKey &&
     box.selectionStart === box.selectionEnd &&
     box.value.slice(box.selectionStart - 1, box.selectionStart) === '['){
    e.preventDefault();
    const at = box.selectionStart;
    box.setRangeText('[]]', at, at, 'end');
    box.setSelectionRange(at + 1, at + 1);
    box.dispatchEvent(new Event('input', { bubbles:true }));
    requestAnimationFrame(() => wkSync(box));
    return true;
  }
  if(!WK.on || box !== WK.box) return false;
  if(e.key === 'Escape'){ e.preventDefault(); wkHide(); return true; }
  if(e.key === 'ArrowDown' || e.key === 'ArrowUp'){
    e.preventDefault();
    WK.i = (WK.i + (e.key === 'ArrowDown' ? 1 : WK.list.length - 1)) % WK.list.length;
    wkRows(); return true;
  }
  if(e.key === 'Enter' || e.key === 'Tab'){ e.preventDefault(); wkTake(); return true; }
  return false;
}
document.addEventListener('pointerdown', e => {
  if(WK.on && !e.target.closest('#wikipad')) wkHide();
}, true);
window.addEventListener('blur', wkHide);
window.addEventListener('resize', () => { if(WK.on) wkPlace(); });

/* ---- how it looks ---- */
addCSS('wiki', `
/* a link between two things in the library — written in the note's own accent,
   and drawn hollow while there is nothing at the other end of it yet */
.md-preview .md-wiki{color:var(--accent2);text-decoration:none;cursor:pointer;
  border-bottom:1px solid color-mix(in srgb,var(--accent2) 45%,transparent);padding-bottom:.02em}
.md-preview .md-wiki:hover{color:var(--accent);border-bottom-color:var(--accent);
  background:color-mix(in srgb,var(--accent2) 12%,transparent)}
.md-preview .md-wiki.new{color:color-mix(in srgb,var(--ink) 52%,transparent);
  border-bottom-style:dashed;border-bottom-color:color-mix(in srgb,var(--ink) 34%,transparent)}
.md-preview .md-wiki.new:hover{color:var(--accent);border-bottom-color:var(--accent)}
.wikipad{position:fixed;z-index:97;width:min(340px,calc(100vw - 16px));padding:5px;border-radius:10px;
  display:none;font-family:var(--mono);color:#e8eaec}
.wikipad.open{display:block}
.wklist{list-style:none;margin:0;padding:0;max-height:232px;overflow:auto;
  scrollbar-width:thin;scrollbar-color:#41474c transparent}
.wklist li{display:grid;grid-template-columns:20px minmax(0,1fr) auto;align-items:center;gap:8px;
  padding:6px 7px;border-radius:6px;cursor:pointer}
.wklist li.on{background:color-mix(in srgb,var(--accent2) 26%,transparent)}
.wklist li:hover{background:rgba(255,255,255,.09)}
.wkg{display:grid;place-items:center;width:20px;height:20px;border-radius:4px;font:9px var(--mono);
  color:#cfd3d6;background:rgba(255,255,255,.08)}
.wkg.canvas{font:16px/1 var(--disp);color:var(--accent2)}
.wkg.new{color:#f0ede5;background:color-mix(in srgb,var(--accent) 55%,transparent)}
.wkname{font-size:11px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.wkwhere{font-size:8px;letter-spacing:.08em;text-transform:uppercase;color:#8b9298;
  max-width:38%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.wkhint{padding:5px 7px 3px;color:#6e757b;font-size:8px;letter-spacing:.1em;text-transform:uppercase}
@media (pointer:coarse){.wklist li{padding:10px 8px}}
`);
