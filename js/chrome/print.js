/* Open Note — ui/print.js
   print / PDF */

/* ================= print ================= */
$('#printBtn').addEventListener('click', async () => {
  const area = $('#printArea'); area.innerHTML = '';
  const p = await loadSheet();
  const pg = buildPage(p, false);
  area.appendChild(pg); fit(pg);
  drawStaticStrings(pg, p);
  setTimeout(() => { plPrint(); setTimeout(() => area.innerHTML = '', 800); }, 250);
});

/* ---- how it looks ---- */
addCSS('print', `
/* ---------- print ---------- */
.printArea{position:fixed;left:-20000px;top:0}
.printArea .page{width:660px;height:auto;aspect-ratio:var(--pw,660)/var(--ph,884);max-width:none;box-shadow:none;border-radius:0;margin:0 0 10px}
@media print{
  .app,.drawer,.modal,.scope,.fview,.peek,.cmap{display:none!important}
  .printArea{position:static;left:0}
  .printArea .page{page-break-after:auto;break-inside:auto}
  .dcard{transform:none!important}                /* paper shows the question side */
  html,body{background:#fff;overflow:visible}   /* the root carries the desk too */
  @page{size:A4;margin:8mm}
}
@media (prefers-reduced-motion:reduce){*{transition:none!important;animation:none!important}}
@media (max-width:640px){
  .page{height:calc(min(58dvh,700px)*var(--zoom,1))}
  .brand{display:none}
}
`);
