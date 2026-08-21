/* Open Note — items/ptable.js
   the periodic table: the picker a molecule's element chip opens, and the
   same table as a reference card on the page. The numbers are js/lib/chem.js's. */

/* ---- the grid, drawn once for both ----
   Eighteen columns and seven rows, the f-block on two rows under a gap, and
   the chosen element's facts in the empty corner above the transition metals,
   the way a wall chart uses it. */
function ptCell(e){
  const col = e.group ? e.group : 4 + (e.z - (e.z < 90 ? 58 : 90));
  const row = e.group ? e.period : (e.z < 90 ? 9 : 10);
  return '<b class="ptc" data-z="' + e.z + '" data-cat="' + e.cat + '" style="grid-area:' + row + '/' + col +
    '"><i>' + e.z + '</i>' + e.sym + '</b>';
}
const ptGrid = cls => '<div class="ptgrid ' + (cls || '') + '">' + CHEM_EL.slice(1).map(ptCell).join('') +
  '<div class="ptfacts" style="grid-area:1/3/4/13"></div></div>';
function ptFacts(z){
  const e = CHEM_EL[z]; if(!e) return '';
  return '<b class="ptsym" data-cat="' + e.cat + '">' + e.sym + '</b><span class="ptname">' + esc(e.name) +
    '<small>' + e.z + ' · ' + CHEM_CATS[e.cat] + '</small></span>' +
    '<span class="ptrow">' + e.mass + ' g/mol' + (e.en != null ? ' · χ ' + e.en : '') +
    ' · r ' + e.rcov + ' Å</span>' +
    '<span class="ptrow">' + chemConf(z).text + '</span>' +
    '<span class="ptrow">period ' + e.period + (e.group ? ' · group ' + e.group : '') + ' · ' + e.block + '-block</span>';
}
function ptShow(root, z){
  const f = root.querySelector('.ptfacts');
  if(f) f.innerHTML = ptFacts(z);
  root.querySelectorAll('.ptc.hot').forEach(c => c.classList.remove('hot'));
  const c = root.querySelector('.ptc[data-z="' + z + '"]');
  if(c) c.classList.add('hot');
}

/* ---- the picker ----
   A glass popover beside whatever asked for it. Hovering a cell shows the
   element, one click takes it; typing a symbol walks to it and Enter takes
   it; Escape or a click elsewhere puts it away. */
let PT_ON = null, PT_ANCHOR = null, PT_BUF = '', PT_BUF_T = 0, PT_Z = 6;
function ptPickEl(){
  let d = $('#ptpick');
  if(d) return d;
  d = document.createElement('div');
  d.className = 'ptpick glass'; d.id = 'ptpick';
  d.innerHTML = ptGrid('pick');
  document.body.appendChild(d);
  d.addEventListener('pointerover', e => { const c = e.target.closest('.ptc'); if(c){ PT_Z = +c.dataset.z; ptShow(d, PT_Z); } });
  d.addEventListener('pointerdown', e => { e.stopPropagation(); e.preventDefault(); });
  d.addEventListener('click', e => { const c = e.target.closest('.ptc'); if(c) ptTake(+c.dataset.z); });
  return d;
}
function ptTake(z){
  const fn = PT_ON;
  closeElementPicker();
  if(fn && CHEM_EL[z]) fn(CHEM_EL[z].sym, CHEM_EL[z]);
}
function openElementPicker(anchor, onPick, cur){
  const d = ptPickEl();
  if(d.classList.contains('open') && PT_ANCHOR === anchor) return closeElementPicker();
  PT_ON = onPick; PT_ANCHOR = anchor; PT_BUF = '';
  d.querySelectorAll('.ptc.cur').forEach(c => c.classList.remove('cur'));
  const ce = chemEl(cur || 'C');
  if(ce){ const c = d.querySelector('.ptc[data-z="' + ce.z + '"]'); if(c) c.classList.add('cur'); PT_Z = ce.z; ptShow(d, ce.z); }
  d.classList.add('open');
  /* beside the thing that asked — to its right, else its left, else under it */
  const r = anchor.getBoundingClientRect(), w = d.offsetWidth, h = d.offsetHeight;
  let x, y = r.top - 12;
  if(r.right + 12 + w <= innerWidth - 8) x = r.right + 12;
  else if(r.left - 12 - w >= 8) x = r.left - 12 - w;
  else { x = r.left + r.width / 2 - w / 2; y = r.bottom + 10; }
  d.style.left = clamp(x, 8, innerWidth - w - 8) + 'px';
  d.style.top = clamp(y, 8, innerHeight - h - 8) + 'px';
  warpIn(d, r.left + r.width / 2, r.top + r.height / 2);
}
function closeElementPicker(){
  const d = $('#ptpick');
  if(!d || !d.classList.contains('open') || !PT_ANCHOR) return false;
  PT_ON = null; PT_ANCHOR = null;
  warpOut(d, () => { if(!PT_ANCHOR) d.classList.remove('open'); });
  return true;
}
window.addEventListener('pointerdown', e => {
  if(PT_ANCHOR && !e.target.closest('#ptpick') && !(PT_ANCHOR === e.target || PT_ANCHOR.contains(e.target)))
    closeElementPicker();
});
window.addEventListener('keydown', e => {
  if(!PT_ANCHOR) return;
  if(e.key === 'Escape'){ e.stopPropagation(); e.preventDefault(); closeElementPicker(); return; }
  if(e.key === 'Enter'){ e.stopPropagation(); e.preventDefault(); ptTake(PT_Z); return; }
  if(e.ctrlKey || e.metaKey || e.altKey || e.key.length !== 1 || !/[a-z]/i.test(e.key)) return;
  e.stopPropagation(); e.preventDefault();
  const now = performance.now();
  PT_BUF = (now - PT_BUF_T < 900 ? PT_BUF : '') + e.key; PT_BUF_T = now;
  const hit = (PT_BUF.length >= 2 && chemEl(PT_BUF.slice(-2))) || chemEl(PT_BUF.slice(-1));
  if(hit){ PT_Z = hit.z; ptShow(ptPickEl(), hit.z); }
}, true);

/* ---- the card on the page ---- */
defineItem('ptable', {
  add: { ptable: base => ({ ...base, type:'ptable', w:64, el:6, cap:'' }) },
  sound: 'tape',
  html: () => '<figure class="body ptbl">' + ptGrid('card') + '<figcaption></figcaption></figure>',
  mount(el, it){ ptShow(el, it.el || 6); },
  wire(el, it, page){
    /* the item grabs the pointer to drag itself, so a tap is decided on the
       way up: no distance travelled, the element is chosen */
    el.querySelectorAll('.ptc').forEach(c => c.addEventListener('pointerdown', e => {
      const sx = e.clientX, sy = e.clientY, pid = e.pointerId;
      const up = ev => {
        window.removeEventListener('pointerup', up, true);
        window.removeEventListener('pointercancel', up, true);
        if(ev.type !== 'pointerup' || ev.pointerId !== pid) return;
        if(Math.hypot(ev.clientX - sx, ev.clientY - sy) > 5) return;
        it.el = +c.dataset.z;
        ptShow(el, it.el); queueSave(page.id); SND.tick();
      };
      window.addEventListener('pointerup', up, true);
      window.addEventListener('pointercancel', up, true);
    }));
  },
  css: `
/* ---------- the periodic table ---------- */
.ptgrid{display:grid;grid-template-columns:repeat(18,1fr);grid-template-rows:repeat(7,auto) .45em repeat(2,auto);gap:.14em;font-family:var(--mono)}
.ptc{--pc:#8a8f98;position:relative;display:flex;align-items:flex-end;justify-content:center;aspect-ratio:1;border-radius:.18em;
  font-size:1em;font-weight:600;line-height:1;padding-bottom:.16em;cursor:pointer;user-select:none;
  background:color-mix(in srgb,var(--pc) 42%,transparent);box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--pc) 55%,transparent);
  transition:transform .12s,box-shadow .12s}
.ptc i{position:absolute;left:.16em;top:.12em;font-style:normal;font-weight:400;font-size:.52em;opacity:.6}
.ptc:hover,.ptc.hot{transform:translateY(-1px);box-shadow:inset 0 0 0 1px var(--pc),0 2px 6px rgba(0,0,0,.25)}
.ptc.cur{box-shadow:inset 0 0 0 2px var(--accent)}
.ptc[data-cat=a],.ptsym[data-cat=a]{--pc:#ef7a6a}.ptc[data-cat=e],.ptsym[data-cat=e]{--pc:#f2b06a}
.ptc[data-cat=t],.ptsym[data-cat=t]{--pc:#7fa6e8}.ptc[data-cat=p],.ptsym[data-cat=p]{--pc:#9dd1c4}
.ptc[data-cat=m],.ptsym[data-cat=m]{--pc:#c9c06b}.ptc[data-cat=n],.ptsym[data-cat=n]{--pc:#a5d87a}
.ptc[data-cat=h],.ptsym[data-cat=h]{--pc:#6fd0d8}.ptc[data-cat=g],.ptsym[data-cat=g]{--pc:#c39ae8}
.ptc[data-cat=l],.ptsym[data-cat=l]{--pc:#e89ac7}.ptc[data-cat=c],.ptsym[data-cat=c]{--pc:#d49a7a}
.ptfacts{display:grid;grid-template-columns:auto 1fr;grid-auto-rows:min-content;column-gap:.7em;row-gap:.12em;align-content:center;padding:0 .4em;min-height:0;overflow:hidden}
.ptfacts .ptsym{grid-row:1/5;align-self:center;font-size:2.8em;font-weight:700;line-height:1;color:color-mix(in srgb,var(--pc) 70%,currentColor)}
.ptfacts .ptname{font-size:1.05em;font-weight:600;letter-spacing:.04em}
.ptfacts .ptname small{display:block;font-weight:400;font-size:.7em;opacity:.6;letter-spacing:.08em;text-transform:uppercase;margin-top:.1em}
.ptfacts .ptrow{font-size:.78em;opacity:.8;white-space:nowrap;letter-spacing:.03em}
/* on the page: a card that scales with its width (not "page" — that class is the paper's) */
.ptbl{container-type:inline-size;color:var(--ink)}
.ptgrid.card{font-size:1.9cqw}
/* the picker: a glass panel sized for the pointer */
.ptpick{position:fixed;z-index:84;display:none;width:492px;padding:12px;border-radius:15px;color:#e9eaef;will-change:transform,filter,opacity}
.ptpick.open{display:block}
.ptgrid.pick{font-size:9.5px;gap:2px}
.ptgrid.pick .ptc{color:#f3f4f7}
.ptgrid.pick .ptfacts{color:#e9eaef}
@media (prefers-reduced-motion: reduce){.ptc{transition:none}}
`
});
defineIcon('ptable', '<rect x="3.5" y="4.5" width="4.5" height="4.5" rx=".8"/><rect x="16" y="4.5" width="4.5" height="4.5" rx=".8"/><rect x="3.5" y="10.5" width="4.5" height="4.5" rx=".8"/><rect x="9.7" y="10.5" width="4.5" height="4.5" rx=".8"/><rect x="16" y="10.5" width="4.5" height="4.5" rx=".8"/><path d="M6 19.5h12"/>');
defineTool({ kind:'ptable', cat:'science', label:'Periodic table', icon:'ptable', order:20,
  hint:'The periodic table on the page — tap an element for its mass, electronegativity and configuration' });
