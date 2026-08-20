/* Open Note — core/richtext.js
   editing text in place, and the equation button */

/* editing always shows the source; leaving the box compiles it again */
function startEdit(el, txt){
  el.classList.add('editing');
  unmathify(txt);
  txt.contentEditable = 'true';
  txt.focus();
}
/* wrap the selection (or drop an empty pair) in $$…$$ — `set` is for boxes that
   keep their text somewhere other than it.html, like the two sides of a flip card */
function insertMath(el, txt, it, page, set){
  if(!el.classList.contains('editing')) startEdit(el, txt);
  const sel = getSelection();
  const inBox = sel.rangeCount && txt.contains(sel.anchorNode);
  const pair = '$$' + (inBox && !sel.isCollapsed ? sel.toString() : '') + '$$';
  let caret = null;
  if(inBox && document.execCommand('insertText', false, pair)){
    if(sel.rangeCount) caret = [sel.getRangeAt(0).endContainer, sel.getRangeAt(0).endOffset];
  } else {                                           // caret was elsewhere: park it at the end
    const n = document.createTextNode(pair);
    txt.appendChild(n);
    caret = [n, pair.length];
  }
  if(caret && caret[0].nodeType === 3 && caret[1] >= 2){
    const r = document.createRange();               // sit between the two $$
    r.setStart(caret[0], caret[1] - 2); r.collapse(true);
    sel.removeAllRanges(); sel.addRange(r);
  }
  const v = sanitize(txt.innerHTML);
  if(set) set(v); else it.html = v;
  queueSave(page.id);
}
