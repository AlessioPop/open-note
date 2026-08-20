/* Open Note — core/theme.js
   theming and the colour overrides */

/* ================= theming / customization ================= */
/* An override is only let through if it reads as a solid colour. The picker never
   writes anything else, but these also come out of a restored backup, where the
   file could hold anything — and a bad one does not simply get ignored: a
   `background:var(--paper)` whose variable will not parse falls away whole, and
   the sheet turns see-through over the desk. Nothing gets to do that. */
const HEXCOL = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;
/* what the desk actually comes out as: the override if there is a good one, else
   the preset's own */
const deskOf = s => HEXCOL.test((s || {}).desk || '')
  ? s.desk : (THEME_VARS[index.theme] || THEME_VARS.graph).desk;
function applyTheme(){
  document.body.dataset.theme = index.theme || 'graph';
  $('#themeSel').value = index.theme || 'graph';
  const s = index.settings || {};
  ['paper','ink','line','accent','accent2','desk'].forEach(v => {
    if(HEXCOL.test(s[v] || '')) document.body.style.setProperty('--' + v, s[v]);
    else document.body.style.removeProperty('--' + v);
  });
  /* the root paints the window canvas, but the presets are written on the body, so
     the desk it should be painting is handed to it here */
  document.documentElement.style.setProperty('--desk', deskOf(s));
  applyPageSize();
  $('#aspectSel').value = s.pgw || s.pgh ? 'custom' : (s.aspect || 'tall');
  $('#defPaperSel').value = s.defPaper || 'grid';
  syncGrain();
  syncPickers();
}
/* the speckle over the paper — the one part of a sheet that costs real paint */
function syncGrain(){
  const on = index.settings.grain !== false;
  document.body.classList.toggle('nograin', !on);
  $('#grainSwitch').classList.toggle('on', on);
  $('#grainSwitch').setAttribute('aria-checked', on);
}
$('#grainSwitch').addEventListener('click', () => {
  index.settings.grain = index.settings.grain === false;
  syncGrain(); queueIndex();
});
$('#grainSwitch').addEventListener('keydown', e => {
  if(e.key === ' ' || e.key === 'Enter'){ e.preventDefault(); $('#grainSwitch').click(); }
});
function syncPickers(){
  const cs = getComputedStyle(document.body);
  document.querySelectorAll('.drawer input[type=color]').forEach(inp => {
    const v = (index.settings[inp.dataset.var] || cs.getPropertyValue('--' + inp.dataset.var)).trim();
    if(/^#[0-9a-f]{6}$/i.test(v)) inp.value = v;
  });
}
$('#themeSel').addEventListener('change', e => { index.theme = e.target.value; applyTheme(); queueIndex(); refit(); });
document.querySelectorAll('.drawer input[type=color]').forEach(inp =>
  inp.addEventListener('input', () => {
    index.settings[inp.dataset.var] = inp.value;
    document.body.style.setProperty('--' + inp.dataset.var, inp.value);
    queueIndex();
  }));
/* colours only: the paper's size, its grain and the sound are not colours, and a
   canvas that lost its size here would fold every item on it back into a page */
$('#resetColors').addEventListener('click', () => {
  const keep = { defPaper: index.settings.defPaper, sound: index.settings.sound, vol: index.settings.vol,
                 aspect: index.settings.aspect, grain: index.settings.grain, pgw: index.settings.pgw, pgh: index.settings.pgh };
  index.settings = keep; applyTheme(); queueIndex();
});
$('#setBtn').addEventListener('click', () => { $('#drawer').classList.toggle('open'); syncPickers(); $('#paperSel').value = activePage().paper || 'grid'; });
$('#closeDrawer').addEventListener('click', () => $('#drawer').classList.remove('open'));
$('#paperSel').addEventListener('change', e => { const p = activePage(); p.paper = e.target.value; queueSave(p.id); render(); });
$('#defPaperSel').addEventListener('change', e => { index.settings.defPaper = e.target.value; queueIndex(); });
function applyPageSize(){
  const p = pgSize(index);
  document.body.style.setProperty('--pw', p.w);
  document.body.style.setProperty('--ph', p.h);
}
$('#aspectSel').addEventListener('change', e => {
  if(e.target.value === 'custom'){ e.target.value = index.settings.aspect || 'tall'; return; }
  index.settings.aspect = e.target.value;
  delete index.settings.pgw; delete index.settings.pgh;   // a shape wins over an old drag
  applyTheme(); queueIndex(); render();
});

/* sound settings */
function syncSound(){
  const on = index.settings.sound !== false;
  $('#sndSwitch').classList.toggle('on', on);
  $('#sndSwitch').setAttribute('aria-checked', on);
  $('#sndVol').value = index.settings.vol == null ? 50 : index.settings.vol;
}
$('#sndSwitch').addEventListener('click', () => {
  index.settings.sound = index.settings.sound === false ? true : false;
  syncSound(); queueIndex(); if(index.settings.sound !== false) SND.plop();
});
$('#sndSwitch').addEventListener('keydown', e => { if(e.key === ' ' || e.key === 'Enter'){ e.preventDefault(); $('#sndSwitch').click(); } });
$('#sndVol').addEventListener('input', e => { index.settings.vol = +e.target.value; queueIndex(); });
$('#sndVol').addEventListener('change', () => SND.plop());
