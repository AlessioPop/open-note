/* Open Note — chrome/export.js
   the note as one standalone .html anyone can open */

/* ================= export (standalone HTML) =================
   One file, no network, nothing to install: the sheet as it stands, every
   feature's stylesheet, and every blob it holds inlined as a data URL. What
   comes out is a picture of the note rather than the note itself — nothing on
   it can be moved or edited, but the flip cards still turn, because that is the
   card's own checkbox and needs no script of ours. */
$('#exportHtmlBtn').addEventListener('click', async () => {
  await flush();
  const p = await loadSheet();
  if(!p) return;
  const exportUrls = {};
  let mediaBytes = 0;
  /* Everything nested comes along: what a flip card holds goes with the deck it
     is on, what a folder holds goes with the folder. A model travels as its
     poster rather than as megabytes of .obj text, which is the same
     `stream: false` it uses on screen. */
  for(const it of p.items) for(const rec of mediaRecords(it)){
    if(!rec.media || specOf(rec).stream === false || exportUrls[rec.media]) continue;
    const b = await mediaGet(rec.media);
    /* a heavy attachment stays behind — the shortcut then just shows its name */
    const cap = specOf(rec).exportMaxBytes;
    if(!b || (cap && b.size > cap)) continue;
    mediaBytes += b.size; exportUrls[rec.media] = await blobToDataURL(b);
  }
  if(mediaBytes > 120 * 1024 * 1024 &&
     !confirm('Embedded videos total ' + (mediaBytes / 1048576 | 0) + ' MB — the exported file will be large. Continue?')) return;

  const holder = document.createElement('div');
  holder.style.cssText = 'position:fixed;left:-20000px;top:0';
  document.body.appendChild(holder);              // attached, so string anchors can be measured
  const pg = buildPage(p, false, exportUrls);
  holder.appendChild(pg); fit(pg);
  drawStaticStrings(pg, p);

  const css = document.getElementById('appcss').textContent;
  const s = index.settings || {};
  let inline = ['paper','ink','line','accent','accent2','desk']
    .filter(v => s[v]).map(v => '--' + v + ':' + s[v]).join(';');
  const esz = pgSize(index);
  inline += (inline ? ';' : '') + '--pw:' + esz.w + ';--ph:' + esz.h;
  const title = (lib.books.find(b => b.id === curNoteId) || {}).name || 'Open Note';

  /* The sheet is very often wider than a screen, so the exported page is a
     scrolling desk with the sheet on it rather than a fitted picture — pinch
     and scroll to get about it, exactly as in the app. */
  const viewerCss =
    'body{margin:0;overflow:auto;background:var(--desk);padding:20px}' +
    '.page{width:' + esz.w + 'px;height:auto;max-width:none;margin:0 auto;box-shadow:0 16px 44px rgba(0,0,0,.5)}' +
    '@media print{.page{width:660px;box-shadow:none;margin:0}html,body{background:#fff;padding:0}}';

  /* Only one job over there: keep --scale and the ink viewBox honest when the
     window changes size, so type and strokes stay where they were drawn. */
  const viewerJs =
    "var W=" + esz.w + ",P=[].slice.call(document.querySelectorAll('.page'));" +
    "function fit(){P.forEach(function(p){var w=p.offsetWidth,h=p.offsetHeight;if(!w)return;" +
    "p.style.setProperty('--scale',(w/W).toFixed(4));" +
    "if(h)[].forEach.call(p.querySelectorAll('svg.ink'),function(s){s.setAttribute('viewBox','0 0 1000 '+(h/w*1000).toFixed(1));});});}" +
    "window.addEventListener('resize',fit);fit();" +
    /* the flip cards keep working over here: the card turns on its own checkbox,
       and these two arrows walk the deck */
    "[].forEach.call(document.querySelectorAll('.deck.static'),function(d){" +
    "var S=[].slice.call(d.querySelectorAll('.dslot')),T=d.querySelector('.dpos'),N=0;" +
    "if(S.length<2)return;" +
    "function ds(){S.forEach(function(x,i){x.className='dslot'+(i===N?' on':'');" +
    "var b=x.querySelector('.dflipbox');if(b)b.checked=false;});" +
    "if(T)T.textContent=(N+1)+' / '+S.length;}" +
    "var pb=d.querySelector('[data-a=prev]'),nb=d.querySelector('[data-a=next]');" +
    "if(pb)pb.onclick=function(){N=(N-1+S.length)%S.length;ds();};" +
    "if(nb)nb.onclick=function(){N=(N+1)%S.length;ds();};ds();});";

  /* the root carries the desk over there too, and the presets it would read it
     from are written on the body — so the note's own desk is handed to it directly */
  const doc = '<!DOCTYPE html><html lang="en" style="--desk:' + deskOf(s) + '"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">' +
    '<title>' + esc(title) + '</title>' +
    '<link href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@600;700&family=Caveat:wght@500;600;700&family=IBM+Plex+Mono:wght@400;500&family=Newsreader:ital,opsz,wght@0,6..72,400;0,6..72,600;1,6..72,400&display=swap" rel="stylesheet">' +
    '<style>' + css + viewerCss + '</style></head>' +
    '<body data-theme="' + esc(index.theme || 'graph') + '"' + (s.grain === false ? ' class="nograin"' : '') +
      (inline ? ' style="' + inline + '"' : '') + '>' +
    '<svg width="0" height="0" style="position:absolute"><filter id="grain"><feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="3"/><feColorMatrix type="saturate" values="0"/></filter></svg>' +
    holder.innerHTML +
    '<scr' + 'ipt>' + viewerJs + '</scr' + 'ipt></body></html>';
  holder.remove();

  await plSaveFile((title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'note') + '.html',
                   new Blob([doc], { type: 'text/html' }));
});
