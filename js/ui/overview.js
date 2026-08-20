/* Open Note — ui/overview.js
   the all-pages thumbnail overview */

/* ================= overview ================= */
$('#allBtn').addEventListener('click', async () => {
  const sheet = $('#sheet'), grid = $('#grid');
  sheet.classList.add('open');                   // open first so fit() can measure the thumbs
  grid.innerHTML = '';
  for(let i = 0; i < index.pages.length; i++){
    const p = await loadPage(i);
    await ensureMedia(p);                          // thumbnails want the real pictures in them
    const card = document.createElement('div'); card.className = 'thumb';
    const pg = buildPage(p, false);
    card.appendChild(pg);
    card.insertAdjacentHTML('beforeend', '<div class="cap">' + (i === 0 ? 'Cover' : String(i).padStart(2, '0')) + ' · ' + esc(p.title) + '</div>');
    card.addEventListener('click', () => { cur = i; selected = null; activePageId = null; sheet.classList.remove('open'); queueIndex(); render(); });
    grid.appendChild(card);
    fit(pg);
    drawStaticStrings(pg, p);
  }
});
$('#sheet').addEventListener('click', e => { if(e.target.id === 'sheet') e.target.classList.remove('open'); });

/* ---- how it looks ---- */
addCSS('overview', `
/* ---------- overview ---------- */
.sheet{position:fixed;inset:0;background:rgba(8,10,12,.86);z-index:50;display:none;overflow:auto;padding:28px}
.sheet.open{display:block}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:18px;max-width:1100px;margin:0 auto}
.thumb{cursor:pointer}
.thumb .page{height:auto;width:100%;max-width:none;box-shadow:0 8px 20px rgba(0,0,0,.5);pointer-events:none}
.thumb .cap{font-family:var(--mono);font-size:10px;letter-spacing:.1em;color:#b9b5ac;padding-top:7px;text-transform:uppercase}
.thumb:hover .page{outline:2px solid var(--accent)}
.sheet h2{font-family:var(--disp);text-transform:uppercase;letter-spacing:.04em;color:#efece4;margin:0 0 18px;text-align:center}
`);
