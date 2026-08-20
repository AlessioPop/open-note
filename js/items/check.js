/* Open Note — items/check.js
   checklists — Obsidian-style "- [ ]" tasks */

/* ================= checklist parsing ================= */
function ckParse(src){
  return String(src || '').split('\n').map(line => {
    const m = line.match(/^\s*-\s*\[( |x|X)\]\s?(.*)$/);
    return m ? { task: true, done: m[1].toLowerCase() === 'x', text: m[2] } : { task: false, text: line };
  });
}
function ckToSrc(rows){
  return rows.map(r => r.task ? '- [' + (r.done ? 'x' : ' ') + '] ' + r.text : r.text).join('\n');
}
function renderCk(bodyEl, it, page, live){
  const rows = ckParse(it.html);
  bodyEl.innerHTML = '';
  rows.forEach((r, i) => {
    if(r.task){
      const row = document.createElement('div');
      row.className = 'ckrow' + (r.done ? ' done' : '');
      row.innerHTML = '<span class="box" role="checkbox" aria-checked="' + r.done + '"></span><span class="lab">' + esc(r.text) + '</span>';
      if(live){
        const box = row.querySelector('.box');
        box.addEventListener('pointerdown', e => e.stopPropagation());
        box.addEventListener('click', e => {
          e.stopPropagation();
          const rs = ckParse(it.html); rs[i].done = !rs[i].done;
          it.html = ckToSrc(rs); queueSave(page.id); SND.tick();
          renderCk(bodyEl, it, page, live);
        });
      }
      bodyEl.appendChild(row);
    } else {
      const d = document.createElement('div'); d.className = 'plainln'; d.textContent = r.text;
      bodyEl.appendChild(d);
    }
  });
  if(!rows.length || (rows.length === 1 && !rows[0].text))
    bodyEl.innerHTML = '<div class="plainln" style="opacity:.4">double-click to add tasks</div>';
  mathify(bodyEl);
}

defineItem('check', {
  add: { check: base => ({ ...base, type:'check', w:38, fs:22,
                           html:'- [ ] first task\n- [ ] second task' }) },
  sizeable: true,
  html: () => '<div class="body ck"></div>',
  mount(el, it, c){ renderCk(el.querySelector('.ck'), it, c.page, c.live); },
  /* double-click edits the markdown behind the boxes, rather than one task */
  wire(el, it, page){
    const ckBody = el.querySelector('.ck');
    el.addEventListener('dblclick', e => {
      e.stopPropagation();
      el.classList.add('editing');
      ckBody.innerHTML = '<div class="txt" contenteditable="true" style="font-size:calc(var(--fs)*var(--scale)*1px)"></div>';
      const ed = ckBody.firstChild;
      ed.textContent = it.html || '- [ ] ';
      ed.focus();
      const sel = getSelection(); sel.selectAllChildren(ed); sel.collapseToEnd();
      ed.addEventListener('pointerdown', ev => ev.stopPropagation());
      ed.addEventListener('input', () => { it.html = ed.innerText; queueSave(page.id); SND.scratch(); });
      ed.addEventListener('keydown', ev => {
        if(ev.key === 'Enter'){
          ev.preventDefault();
          document.execCommand('insertText', false, '\n- [ ] ');
        }
      });
      ed.addEventListener('blur', () => {
        it.html = ed.innerText.replace(/\n?- \[ \] $/, ''); // drop trailing empty task
        el.classList.remove('editing');
        queueSave(page.id);
        renderCk(ckBody, it, page, true);
      });
    });
  }
});

/* ---- how it looks ---- */
addCSS('check', `
/* checklist */
.ck{background:color-mix(in srgb,var(--paper) 84%,#fff);padding:.55em .7em;box-shadow:0 5px 12px rgba(0,0,0,.18);font-family:var(--hand);font-weight:600;min-height:2em}
.ckrow{display:flex;gap:.45em;align-items:flex-start;font-size:calc(var(--fs)*var(--scale)*1px);line-height:1.3;padding:.06em 0}
.ckrow .box{width:.78em;height:.78em;margin-top:.24em;border:2px solid var(--ink);border-radius:2px;flex:none;cursor:pointer;display:grid;place-items:center;background:transparent}
.ckrow.done .box{background:var(--accent2);border-color:var(--accent2)}
.ckrow.done .box::after{content:"✓";color:#fff;font-size:.66em;line-height:1;font-family:var(--mono)}
.ckrow.done .lab{text-decoration:line-through;opacity:.55}
.ck .plainln{font-size:calc(var(--fs)*var(--scale)*1px);line-height:1.3;padding:.06em 0}
.ck .txt{padding:0}
.tape::after{content:"";position:absolute;left:50%;top:calc(var(--scale)*-11px);transform:translateX(-50%) rotate(-2deg);width:38%;height:calc(var(--scale)*22px);background:var(--tape);box-shadow:inset 0 0 0 1px rgba(0,0,0,.05)}
`);
/* its tile in the palette */
defineTool({ kind:'check', cat:'write', label:'Checklist', icon:'check', order:20,
  hint:'Obsidian-style tasks — click boxes to tick, Enter adds another' });
