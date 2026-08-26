/* Open Note — chrome/shelf.js
   the shelf — every note as a small picture of its sheet */

/* ================= the shelf ================= */
async function openShelf(){
  await flush();
  $('#drawer').classList.remove('open');
  $('#vidModal').classList.remove('open');
  const sh = $('#shelf');
  sh.classList.toggle('noBook', !curNoteId && !(typeof navMdId !== 'undefined' && navMdId));
  sh.classList.add('open');                      // visible before building, so fit() can measure
  await buildShelf();
}

async function buildShelf(){
  const grid = $('#bkGrid'); grid.innerHTML = '';
  const notes = [...lib.books].sort((a, b) => (b.updated || 0) - (a.updated || 0));
  for(const b of notes){
    const doc = await kvGet(kBook(b.id));
    const card = document.createElement('div'); card.className = 'bk';
    const pal = { ...(THEME_VARS[(doc && doc.theme) || 'graph'] || THEME_VARS.graph) };
    if(doc && doc.settings) for(const k of ['paper','ink','line','accent','accent2','desk'])
      if(doc.settings[k]) pal[k] = doc.settings[k];
    for(const [k, v] of Object.entries(pal)) card.style.setProperty('--' + k, v);
    const csz = pgSize(doc);                       // covers keep their own note's sheet shape
    card.style.setProperty('--pw', csz.w); card.style.setProperty('--ph', csz.h);
    let pg = null, face = null;
    if(doc && doc.pages.length){
      face = await kvGet(kPage(doc.pages[0].id));
      if(face) pg = buildPage(face, false, MEDIA_URL, doc);
    }
    if(!pg){ pg = document.createElement('div'); pg.className = 'page'; }
    card.appendChild(pg);
    const n = face ? (face.items || []).length : 0;
    card.insertAdjacentHTML('beforeend',
      '<span class="bkname" contenteditable spellcheck="false" title="Click to rename">' + esc(b.name || 'Untitled') + '</span>' +
      '<div class="bkmeta">' + csz.w + ' × ' + csz.h + ' · ' + n + (n === 1 ? ' thing' : ' things') +
      (b.updated ? ' · ' + fmtDate(b.updated) : '') + '</div>' +
      '<button class="del" title="Delete note">✕</button>');
    card.addEventListener('click', () => openNote(b.id));
    const nameEl = card.querySelector('.bkname');
    nameEl.addEventListener('pointerdown', e => e.stopPropagation());
    nameEl.addEventListener('click', e => e.stopPropagation());
    nameEl.addEventListener('keydown', e => { if(e.key === 'Enter'){ e.preventDefault(); nameEl.blur(); } });
    nameEl.addEventListener('blur', () => {
      b.name = nameEl.textContent.trim() || 'Untitled'; nameEl.textContent = b.name; queueLib();
      if(typeof navRender === 'function') navRender();
    });
    const del = card.querySelector('.del');
    del.addEventListener('pointerdown', e => e.stopPropagation());
    del.addEventListener('click', async e => {
      e.stopPropagation();
      if(!confirm('Delete "' + (b.name || 'this note') + '" and everything on it? This cannot be undone.')) return;
      await deleteNote(b.id);
      $('#shelf').classList.toggle('noBook', !curNoteId && !(typeof navMdId !== 'undefined' && navMdId));
      if(typeof navRender === 'function') navRender();
      buildShelf();
    });
    grid.appendChild(card);
    fit(pg);
    if(face) drawStaticStrings(pg, face, doc);
  }
  const nc = document.createElement('div');
  nc.className = 'bk new';
  nc.title = 'One endless sheet — put anything anywhere, then pull the edges out';
  nc.innerHTML = '<div class="face"><div><div class="plus">∞</div><div class="newlab">New note</div></div></div>';
  nc.addEventListener('click', async () => openNote(await createNote()));
  grid.appendChild(nc);
}

$('#shelfBtn').addEventListener('click', openShelf);
document.querySelector('.brand').addEventListener('click', openShelf);
$('#shelfClose').addEventListener('click', () => {
  if(curNoteId || typeof navMdId !== 'undefined' && navMdId) $('#shelf').classList.remove('open');
});

/* ---- how it looks ---- */
addCSS('shelf', `
/* ---------- the shelf ---------- */
.shelf{position:fixed;inset:0;z-index:55;display:none;overflow:auto;
  padding:calc(34px + env(safe-area-inset-top)) 26px calc(70px + env(safe-area-inset-bottom));
  background:#0c0f12 radial-gradient(120% 80% at 50% 0%,rgba(255,255,255,.055),transparent 60%)}
.shelf.open{display:block}
.shelfHead{position:relative;max-width:1080px;margin:0 auto 26px;text-align:center}
.shelfHead h2{font-family:var(--disp);font-size:clamp(26px,4vw,38px);text-transform:uppercase;letter-spacing:.04em;color:#efece4;margin:0}
.shelfHead .sub{font-family:var(--mono);font-size:10px;letter-spacing:.18em;text-transform:uppercase;color:#8f8c84;margin-top:6px}
#shelfClose{position:absolute;right:0;top:6px}
.shelf.noBook #shelfClose{display:none}
.bkgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:34px 28px;max-width:1080px;margin:0 auto}
.bk{position:relative;cursor:pointer;transition:transform .22s cubic-bezier(.3,.7,.3,1)}
.bk .page{height:auto;width:100%;max-width:none;pointer-events:none;border-radius:2px;box-shadow:0 12px 26px rgba(0,0,0,.55);transition:box-shadow .22s}
.bk:hover{transform:translateY(-9px)}
.bk:hover .page{outline:2px solid var(--accent);outline-offset:4px;box-shadow:0 26px 46px rgba(0,0,0,.65)}
.bk .bkname{display:inline-block;max-width:100%;font-family:var(--mono);font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:#e4e1d8;margin-top:11px;outline:none;border-bottom:1px dotted transparent;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;vertical-align:top}
.bk .bkname:hover,.bk .bkname:focus{border-color:#8a877f;white-space:normal}
.bk .bkmeta{font-family:var(--mono);font-size:10px;letter-spacing:.1em;color:#8f8c84;margin-top:4px;text-transform:uppercase}
.bk .del{position:absolute;top:-9px;right:-9px;z-index:6;width:26px;height:26px;border-radius:50%;background:#15181c;color:#ddd;display:none;place-items:center;font-family:var(--mono);font-size:11px;border:1px solid rgba(255,255,255,.28);box-shadow:0 3px 8px rgba(0,0,0,.5)}
.bk:hover .del,.bk .del:focus{display:grid}
.bk .del:hover{background:var(--accent);border-color:var(--accent);color:#fff}
.bk.new .face{aspect-ratio:1.5/1;border:2px dashed rgba(255,255,255,.25);border-radius:3px;display:grid;place-items:center;color:#a6a39a;background:rgba(255,255,255,.02);transition:border-color .2s,color .2s,background .2s}
.bk.new:hover .face{border-color:var(--accent);color:#f0ede5;background:rgba(255,255,255,.05)}
.bk.new .plus{font-family:var(--disp);font-size:54px;line-height:1;text-align:center}
.bk.new .newlab{font-family:var(--mono);font-size:10px;letter-spacing:.18em;text-transform:uppercase;margin-top:8px;text-align:center}
/* a finger needs the delete button without a hover to reveal it */
@media (pointer:coarse){.bk .del{display:grid}}
`);
