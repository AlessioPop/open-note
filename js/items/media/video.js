/* Open Note — items/video.js
   video — YouTube, Vimeo, or a file from disk */

function parseVideo(u){
  u = String(u || '').trim();
  let m = u.match(/(?:youtube(?:-nocookie)?\.com\/(?:watch\?(?:[^#\s]*[?&])?v=|watch\?v=|embed\/|shorts\/|live\/|v\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/);
  if(m) return { vkind:'yt', vid: m[1] };
  m = u.match(/[?&]v=([A-Za-z0-9_-]{11})/);
  if(m) return { vkind:'yt', vid: m[1] };
  m = u.match(/vimeo\.com\/(?:video\/)?(\d+)/);
  if(m) return { vkind:'vimeo', vid: m[1] };
  if(/^[A-Za-z0-9_-]{11}$/.test(u)) return { vkind:'yt', vid: u };
  return null;
}
function openVideoModal(){ $('#vidUrl').value = ''; $('#vidErr').textContent = ''; $('#vidModal').classList.add('open'); $('#vidUrl').focus(); }
$('#vidCancel').addEventListener('click', () => { takeCardTarget(); $('#vidModal').classList.remove('open'); });
$('#vidModal').addEventListener('click', e => { if(e.target.id === 'vidModal'){ takeCardTarget(); e.target.classList.remove('open'); } });
$('#vidFileBtn').addEventListener('click', () => {
  $('#vidModal').classList.remove('open');
  $(cardTarget ? '#cardVid' : '#vidInput').click();   // a card takes the file itself
});
$('#vidOk').addEventListener('click', embedUrl);
$('#vidUrl').addEventListener('keydown', e => { if(e.key === 'Enter') embedUrl(); });
function embedUrl(){
  const v = parseVideo($('#vidUrl').value);
  if(!v){ $('#vidErr').textContent = 'Could not read that link — paste a YouTube / Vimeo URL or an 11-character video ID.'; return; }
  $('#vidModal').classList.remove('open');
  if(cardTarget) return addCardMedia({ id: uid(), type:'video', cap:'', ...v });
  pushVideoItem(v, takePendingAt());
}
function pushVideoItem(extra, at){
  const page = sheet();
  const pos = at || { x: 14 + Math.random() * 10, y: 18 + Math.random() * 24 };
  page.items.push({ id: uid(), type:'video', x: clamp(pos.x, 2, 56), y: clamp(pos.y, 4, 74), w: 52,
    rot: 0, z: maxZ(page) + 1, lay: curLayerId(), cap: '', ...extra });
  queueSave(page.id); SND.plop(); render();
}
$('#vidInput').addEventListener('change', e => { const f = e.target.files[0]; if(f) fileToVideo(f, takePendingAt()); e.target.value = ''; });
async function videoRecord(file){
  if(file.size > 80 * 1024 * 1024 && !confirm('This video is ' + (file.size / 1048576 | 0) + ' MB. Large files make the book heavy to back up. Embed anyway?')) return null;
  const id = uid();
  const ok = await mediaSet(id, file);
  if(!ok){ alert('Could not store the video in this browser.'); return null; }
  MEDIA_URL[id] = URL.createObjectURL(file);
  return { id: uid(), type:'video', vkind:'file', media: id, mtype: file.type || 'video/mp4',
    name: file.name, size: file.size, cap: '' };
}
async function fileToVideo(file, at){
  const r = await videoRecord(file);
  if(r) pushVideoItem(r, at);
}

defineItem('video', {
  add: { video: { pick: at => { pendingAt = at || null; openVideoModal(); } } },
  takes(fs, at){ if(!fs[0] || !fs[0].type.startsWith('video/')) return false; fileToVideo(fs[0], at); return true; },
  playArea: '.vwrap',                  // in play mode the mouse belongs to the player
  html(it, c){
    const media = it.vkind === 'yt'
      ? '<iframe src="https://www.youtube-nocookie.com/embed/' + esc(it.vid) + '?rel=0" title="video" allow="autoplay; fullscreen; encrypted-media; picture-in-picture" allowfullscreen referrerpolicy="strict-origin-when-cross-origin" loading="lazy"></iframe>'
      : it.vkind === 'vimeo'
      ? '<iframe src="https://player.vimeo.com/video/' + esc(it.vid) + '" title="video" allow="autoplay; fullscreen; picture-in-picture" allowfullscreen loading="lazy"></iframe>'
      : '<video controls preload="metadata" ' + (it.media ? 'data-media="' + esc(it.media) + '" src="' + esc(c.urls[it.media] || '') + '"' : '') + '></video>';
    return '<figure class="body vid"><div class="vwrap">' + media +
      (c.live ? '<div class="shield"><b>▶ to play</b></div>' : '') +
      '</div><figcaption></figcaption></figure>';
  },
  tools(mk, it, el, page){
    mk('▶', 'Play / move', b => {
      el.classList.toggle('play');
      b.style.background = el.classList.contains('play') ? 'var(--accent)' : ''; });
  }
});

/* ---- how it looks ---- */
addCSS('video', `
/* video */
.vid{background:var(--ink);padding:calc(var(--scale)*8px);box-shadow:0 8px 18px rgba(0,0,0,.3)}
.vwrap{position:relative;aspect-ratio:16/9;background:#000}
.vwrap iframe,.vwrap video{position:absolute;inset:0;width:100%;height:100%;border:0}
.vid figcaption{background:var(--ink);color:var(--paper);opacity:.75;padding-top:calc(var(--scale)*6px);font-family:var(--mono);font-size:calc(var(--scale)*10px);outline:none;letter-spacing:.04em}
.vid figcaption:empty::before{content:"caption";opacity:.4}
.item.sel .shield b{opacity:1}
.item.play .shield{display:none}
`);
/* its tile in the palette */
defineTool({ kind:'video', cat:'media', label:'Video', icon:'video', order:20,
  hint:'YouTube, Vimeo, or a video file kept inside the book' });
