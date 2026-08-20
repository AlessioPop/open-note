/* Open Note — ui/export.js
   export the finished book as one standalone .html */

/* ================= export the finished book (standalone HTML) ================= */
$('#exportHtmlBtn').addEventListener('click', async () => {
  await flush();
  const exportUrls = {};
  let mediaBytes = 0;
  for(let i = 0; i < index.pages.length; i++){
    const p = await loadPage(i);
    /* Everything nested comes along: what a flip card holds goes with the deck
       it is on, what a folder holds goes with the folder. A model travels as
       its poster rather than as megabytes of .obj text, which is the same
       `stream: false` it uses on screen. */
    for(const it of p.items) for(const rec of mediaRecords(it)){
      if(!rec.media || specOf(rec).stream === false || exportUrls[rec.media]) continue;
      const b = await mediaGet(rec.media);
      /* a heavy attachment stays behind — the shortcut then just shows its name */
      const cap = specOf(rec).exportMaxBytes;
      if(!b || (cap && b.size > cap)) continue;
      mediaBytes += b.size; exportUrls[rec.media] = await blobToDataURL(b);
    }
  }
  if(mediaBytes > 120 * 1024 * 1024 &&
     !confirm('Embedded videos total ' + (mediaBytes / 1048576 | 0) + ' MB — the exported file will be large. Continue?')) return;

  const holder = document.createElement('div');
  holder.style.cssText = 'position:fixed;left:-20000px;top:0';
  document.body.appendChild(holder);              // attached, so string anchors can be measured
  for(let i = 0; i < index.pages.length; i++){
    const p = await loadPage(i);
    const pg = buildPage(p, false, exportUrls);
    holder.appendChild(pg); fit(pg);
    drawStaticStrings(pg, p);
  }
  const css = document.getElementById('appcss').textContent;
  const s = index.settings || {};
  let inline = ['paper','ink','line','accent','accent2','desk']
    .filter(v => s[v]).map(v => '--' + v + ':' + s[v]).join(';');
  const esz = pgSize(index);
  inline += (inline ? ';' : '') + '--pw:' + esz.w + ';--ph:' + esz.h;
  const title = (index.pages[0] && index.pages[0].title) || 'Devlog';

  const viewerCss =
    'body{display:flex;flex-direction:column;align-items:center;gap:14px;padding:20px;overflow:auto}' +
    '.page{width:min(92vw,' + esz.w + 'px);height:auto;max-width:none;margin:0 auto}' +
    '.viewnav{position:fixed;bottom:14px;left:50%;transform:translateX(-50%);display:flex;gap:10px;align-items:center;' +
    'background:rgba(0,0,0,.55);padding:8px 12px;border-radius:4px;color:#eee;font-family:var(--mono);font-size:12px;letter-spacing:.1em;z-index:99}' +
    '.viewnav button{color:#eee;border:1px solid rgba(255,255,255,.25);padding:4px 10px;border-radius:2px;cursor:pointer;background:none}' +
    '.viewnav button:hover{border-color:#fff}' +
    '@media print{.viewnav{display:none}.page{display:block!important;width:660px;page-break-after:always}}';

  const viewerJs =
    "var C=0,W=" + esz.w + ",P=[].slice.call(document.querySelectorAll('.page'));" +
    "function fit(){P.forEach(function(p){var w=p.offsetWidth,h=p.offsetHeight;if(!w)return;" +
    "p.style.setProperty('--scale',(w/W).toFixed(4));" +
    "if(h)[].forEach.call(p.querySelectorAll('svg.ink'),function(s){s.setAttribute('viewBox','0 0 1000 '+(h/w*1000).toFixed(1));});});}" +
    "function sh(){P.forEach(function(p,i){p.style.display=i===C?'':'none';});document.getElementById('fol').textContent=(C===0?'Cover':C)+' / '+(P.length-1);fit();}" +
    "document.getElementById('pv').onclick=function(){if(C>0){C--;sh();}};" +
    "document.getElementById('nx').onclick=function(){if(C<P.length-1){C++;sh();}};" +
    "window.addEventListener('keydown',function(e){if(e.key==='ArrowLeft'&&C>0){C--;sh();}if(e.key==='ArrowRight'&&C<P.length-1){C++;sh();}});" +
    "window.addEventListener('resize',fit);sh();" +
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

  /* the root carries the desk over there too, and the presets it would read it from
     are written on the body — so the book's own desk is handed to it directly */
  const doc = '<!DOCTYPE html><html lang="en" style="--desk:' + deskOf(s) + '"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<title>' + esc(title) + ' — Devlog</title>' +
    '<link href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@600;700&family=Caveat:wght@500;600;700&family=IBM+Plex+Mono:wght@400;500&family=Newsreader:ital,opsz,wght@0,6..72,400;0,6..72,600;1,6..72,400&display=swap" rel="stylesheet">' +
    '<style>' + css + viewerCss + '</style></head>' +
    '<body data-theme="' + esc(index.theme || 'graph') + '"' + (s.grain === false ? ' class="nograin"' : '') +
      (inline ? ' style="' + inline + '"' : '') + '>' +
    '<svg width="0" height="0" style="position:absolute"><filter id="grain"><feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="3"/><feColorMatrix type="saturate" values="0"/></filter></svg>' +
    holder.innerHTML +
    '<div class="viewnav"><button id="pv">◀</button><span id="fol"></span><button id="nx">▶</button></div>' +
    '<scr' + 'ipt>' + viewerJs + '</scr' + 'ipt></body></html>';
  holder.remove();

  const blob = new Blob([doc], { type: 'text/html' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = (title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'devlog') + '-book.html';
  a.click(); URL.revokeObjectURL(a.href);
});
