/* Open Note — ui/mathbar.js
   the maths toolbar under the book */

/* ================= the math bar ================= */
function mathHint(t){
  const h = $('#mHint');
  h.textContent = t;
  h.classList.add('loud');
  clearTimeout(hintT);
  hintT = setTimeout(() => { h.classList.remove('loud'); syncMathBar(); }, 2600);
}
function setMath(on){
  const was = mathMode;
  mathMode = !!on;
  document.body.classList.toggle('mathing', mathMode);
  $('#mathBtn').classList.toggle('on', mathMode);
  $('#mathbar').classList.toggle('open', mathMode);
  if(mathMode){
    if(drawMode) setDraw(false);
    deselectString(); cancelLinking(); closeQuickMenu();
  } else { mathTool = 'pan'; mathAim = null; }
  syncMathBar();
  if(was !== mathMode) repaintPlots();
}
/* the plot the bar is talking about: the one you have, else the only one here */
function mathPlot(){
  if(!index) return null;
  if(selected){ const f = findItem(selected); if(f && f.it.type === 'plot') return f; }
  if(mathSel){ const f = findItem(mathSel.pid); if(f && f.it.type === 'plot') return f; }
  const all = pagePlots();
  return all.length === 1 ? all[0] : null;
}
const MNUM = ['mX0', 'mX1', 'mY0', 'mY1'];
const MKEY = ['xmin', 'xmax', 'ymin', 'ymax'];
function syncMathBar(){
  if(!index || !$('#mathbar')) return;
  const f = mathPlot(), it = f && f.it;
  $('#mathbar').classList.toggle('noplot', !it);
  document.body.classList.toggle('vectool', mathMode && mathTool === 'vec');
  document.body.classList.toggle('mathaim', !!mathAim);
  MNUM.forEach((id, i) => {
    const inp = $('#' + id);
    inp.disabled = !it;
    if(it && document.activeElement !== inp) inp.value = mfmt(nz(it[MKEY[i]], 0), 3);
    if(!it) inp.value = '';
  });
  $('#mGrid').textContent = 'grid ' + (it ? (it.grid || 'solid') : '—');
  $('#mAxis').textContent = it && it.axes === 0 ? 'axes off' : it && it.axes === 2 ? 'no numbers' : 'axes';
  $('#mAxis').classList.toggle('on', !!it && it.axes !== 0);
  $('#mVec').classList.toggle('on', mathTool === 'vec');
  $('#mBasis').classList.toggle('on', !!(it && it.bshow));
  const b = it ? mbasis(it) : null;
  $('#mBasisTag').textContent = b && !mIdent(b)
    ? 'î (' + mfmt(b[0], 2) + ', ' + mfmt(b[2], 2) + ')  ĵ (' + mfmt(b[1], 2) + ', ' + mfmt(b[3], 2) + ')'
    : '';
  const h = $('#mHint');
  if(h.classList.contains('loud')) return;
  h.textContent = mathAim
    ? (mathAim.kind === 'basis' ? 'click a coordinate system to make ' + mathAim.lab + ' its basis'
     : mathAim.kind === 'draw' ? 'click the coordinate system to draw ' + mathAim.lab + ' in'
     : mathAim.kind === 'data' ? 'click the coordinate system to plot ' + mathAim.lab + ' in'
     : mathAim.kind === 'mul' ? 'click the card to multiply ' + mathAim.lab + ' by'
                                : 'click the vector ' + mathAim.lab + ' should transform')
    : mathTool === 'vec' ? 'drag inside the plot to pull out a vector'
    : !it ? 'add a coordinate system, or click one'
    : '';
}
$('#mathBtn').addEventListener('click', () => setMath(!mathMode));
$('#mDone').addEventListener('click', () => setMath(false));
$('#mAxes').addEventListener('click', () => { setMath(true); addItem('plot'); });
$('#mMat').addEventListener('click', () => addItem('matrix'));
$('#mVecBox').addEventListener('click', () => addItem('vecbox'));
SOLID_KINDS.forEach(k => {
  const b = $('#mS' + k);
  if(b) b.addEventListener('click', () => { setMath(true); addItem(k); });
});
[['mFn', 'fn'], ['mVec', 'vec'], ['mGrid', 'grid'], ['mAxis', 'axes'], ['mFill', 'fill'],
 ['mBasis', 'basis'], ['mHome', 'home'], ['mReset', 'reset']].forEach(p => {
  $('#' + p[0]).addEventListener('click', () => {
    const f = mathPlot();
    if(!f) return mathHint('add a coordinate system first');
    plotAct(p[1], f.it, f.page);
  });
});
MNUM.forEach((id, i) => {
  const inp = $('#' + id);
  inp.addEventListener('input', () => {
    const f = mathPlot();
    if(!f) return;
    const r = mxNum(inp.value);
    inp.classList.toggle('bad', !!r.err);
    if(r.err) return;
    const k = MKEY[i], it = f.it;
    if((k === 'xmin' && r.v >= nz(it.xmax, 5)) || (k === 'xmax' && r.v <= nz(it.xmin, -5)) ||
       (k === 'ymin' && r.v >= nz(it.ymax, 5)) || (k === 'ymax' && r.v <= nz(it.ymin, -5))) return;
    it[k] = r.v;
    queueSave(f.page.id); mrepaint(it);
  });
  inp.addEventListener('keydown', e => { if(e.key === 'Enter' || e.key === 'Escape') inp.blur(); });
  inp.addEventListener('blur', () => { inp.classList.remove('bad'); syncMathBar(); });
});
