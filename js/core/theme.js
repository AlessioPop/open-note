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
const deskOf = (s, theme) => HEXCOL.test((s || {}).desk || '')
  ? s.desk : (THEME_VARS[theme || (index && index.theme)] || THEME_VARS.graph).desk;
/* Apply just the colour layer. Canvas notes add sheet sizing, grain and picker
   state below; document features such as Markdown can share the palette without
   pretending to be a canvas or duplicating the override cleanup. */
function applyThemeColors(theme, settings){
  const name = THEME_VARS[theme] ? theme : 'graph';
  const s = settings || {};
  document.body.dataset.theme = name;
  ['paper','ink','line','accent','accent2','desk'].forEach(v => {
    if(HEXCOL.test(s[v] || '')) document.body.style.setProperty('--' + v, s[v]);
    else document.body.style.removeProperty('--' + v);
  });
  document.documentElement.style.setProperty('--desk', deskOf(s, name));
}
function applyTheme(){
  const theme = index.theme || 'graph';
  applyThemeColors(theme, index.settings);
  $('#themeSel').value = index.theme || 'graph';
  applyPageSize();
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
/* colours only: the sheet's size, its grain, the map and the sound are not
   colours, and a sheet that lost its size here would fold everything on it back
   into a page */
const NOT_A_COLOUR = ['sound', 'vol', 'grain', 'map', 'pgw', 'pgh', 'stylus', 'arrowStyle', 'fade'];
$('#resetColors').addEventListener('click', () => {
  const keep = {};
  NOT_A_COLOUR.forEach(k => { if(index.settings[k] !== undefined) keep[k] = index.settings[k]; });
  index.settings = keep; applyTheme(); queueIndex();
});
$('#setBtn').addEventListener('click', () => { $('#drawer').classList.toggle('open'); syncPickers(); $('#paperSel').value = sheet().paper || 'grid'; });
$('#closeDrawer').addEventListener('click', () => $('#drawer').classList.remove('open'));
$('#paperSel').addEventListener('change', e => { const p = sheet(); p.paper = e.target.value; queueSave(p.id); render(); });
function applyPageSize(){
  const p = pgSize(index);
  document.body.style.setProperty('--pw', p.w);
  document.body.style.setProperty('--ph', p.h);
}

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
