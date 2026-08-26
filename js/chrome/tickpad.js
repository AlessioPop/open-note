/* Open Note — chrome/tickpad.js
   typing inside a ```fence```, in any writing box

   A fenced block is a code cell in the middle of a sentence, so while the caret
   is inside one the keyboard belongs to the code: ⇥ indents and ⇧⇥ takes it
   back, ⏎ keeps the line's indent, brackets and quotes close themselves, and
   backspace between an empty pair takes both. Outside a fence nothing here
   happens at all — ⇥ still walks the maths pad's empty slots, and a bracket in
   a sentence is only a bracket.

   None of the rules are here: they are cdKey() in items/write/code.js, the same
   ones the cell itself is typed under, reached through the registry's code pen.
   This is the wiring — which fence the caret is in, and writing the answer back
   into the box with the maths pad's own put. */

/* the language of the fence the caret is standing in, or null if it is not in one */
function tkFence(s, a, b){
  if(!tickInFence(s, a) || !tickInFence(s, b)) return null;
  const r = tickRegion(s, a);
  const pen = codePen();
  if(!r || !pen || !pen.key) return null;
  return { pen, lang: pen.lang ? pen.lang(tickInfo(r.body)) : null };
}

/* In the capture phase, and before the box's own handlers: a table cell walks
   its cursor on ⇥ and a card commits on ⏎, and inside a fence neither is what
   was meant. */
document.addEventListener('keydown', e => {
  if(e.ctrlKey || e.metaKey || e.altKey) return;
  if(e.key !== 'Tab' && e.key !== 'Enter' && e.key !== 'Backspace' && e.key.length !== 1) return;
  const box = mpadBox();
  if(!box) return;
  const c = mpadCaret(box);
  if(!c) return;
  const a = Math.min(c.a, c.b), b = Math.max(c.a, c.b);
  const s = mpadText(box);
  const f = tkFence(s, a, b);
  if(!f) return;
  const ed = f.pen.key(s, a, b, e, f.lang);
  if(!ed) return;
  e.preventDefault(); e.stopPropagation();
  mpadPut(box, ed.from, ed.to, ed.text, ed.caret || 0);
  if(ed.pick) mpadPick(box, ed.pick[0], ed.pick[1]);
  mpadSoon();
}, true);
