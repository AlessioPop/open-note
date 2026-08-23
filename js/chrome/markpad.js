/* Open Note — chrome/markpad.js
   what the keyboard does to the marks in a writing box

   Two keyboards, one seam. While the caret is on a line that starts with `- `,
   ⏎ makes the next bullet rather than a bare line, and ⇥ pushes the bullet one
   step in — ⇧⇥ takes it back out. An empty bullet is how a list ends: ⏎ on one
   steps back out a level, and off the list altogether from the left-hand
   margin. And ⌃B and ⌃I put `**` and `*` round whatever is picked out, or take
   them off again — the stars are what is stored, so the shortcut and the marks
   are the same thing said two ways, and the browser's own bold, which would
   leave markup nothing else in the app can read, never gets the key.

   None of the rules are here: they are markEnter(), markTab() and markWrap() in
   lib/marks.js, over (text, offset) with no DOM in sight, which is what makes
   them checkable. This is the wiring — where the caret is, and writing the
   answer back into the box.

   In the capture phase, and before the box's own handlers: a table cell walks
   its cursor on ⇥ and a card commits on ⏎, and on a list line neither is what
   was meant. A key somebody ahead of us has already taken is left alone —
   stopPropagation does not stop a listener on the same node, so the maths pad
   walking a snippet's empty slots and a fence taking ⏎ for its own are both
   read off `defaultPrevented` rather than hoped about. Inside a fenced block
   nothing here happens at all: the rules say so themselves, and
   chrome/tickpad.js has the keyboard there. */

/* Writing surfaces only. A table cell and a caption compile their marks like
   everything else, but ⇥ in a cell is the next cell and in a caption the next
   field, and a list is not worth taking either of those away. */
const LP_BOXES = '.txt,.dtxt,.dot';

/* An indent is written straight into the box rather than through the editor's
   insertText: an editor normalises whitespace it is handed — a tab can come
   back as a space, a leading space as a non-breaking one — and a step that came
   back as something else is not a step. Everything else goes the ordinary way,
   which keeps the browser's own undo. */
function lpPut(box, ed){
  if(!ed.raw) return mpadPut(box, ed.from, ed.to, ed.text, ed.caret || 0);
  const A = mathFlatPos(box, ed.from), B = mathFlatPos(box, ed.to);
  const r = document.createRange();
  try{ r.setStart(A[0], A[1]); r.setEnd(B[0], B[1]); }catch(e){ return; }
  r.deleteContents();
  if(ed.text) r.insertNode(document.createTextNode(ed.text));
  box.normalize();
  mpadTo(box, ed.from + (ed.caret || 0));
  box.dispatchEvent(new Event('input', { bubbles: true }));
}

/* ---- ⏎ and ⇥, on a list line ---- */
document.addEventListener('keydown', e => {
  if(e.ctrlKey || e.metaKey || e.altKey || e.defaultPrevented) return;
  if(e.key !== 'Enter' && e.key !== 'Tab') return;
  const box = mpadBox();
  if(!box || !box.matches(LP_BOXES)) return;
  const c = mpadCaret(box);
  if(!c || c.a !== c.b) return;               // a run of writing is picked out: not a list keystroke
  const s = mathFlat(box).s;
  const ed = e.key === 'Enter' ? markEnter(s, c.a) : markTab(s, c.a, e.shiftKey);
  if(!ed) return;
  e.preventDefault(); e.stopPropagation();
  lpPut(box, ed);
  mpadSoon();
}, true);

/* ---- ⌃B and ⌃I, on whatever is picked out ----
   Every box that compiles marks, not just the three the list keyboard keeps to:
   there is nothing here for a table cell or a caption to lose. */
document.addEventListener('keydown', e => {
  if(!(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey || e.defaultPrevented) return;
  const k = e.key.toLowerCase();
  if(k !== 'b' && k !== 'i') return;
  const box = mpadBox();
  if(!box) return;
  const c = mpadCaret(box);
  if(!c) return;
  const s = mathFlat(box).s;
  const ed = markWrap(s, Math.min(c.a, c.b), Math.max(c.a, c.b), k === 'b' ? '**' : '*');
  if(!ed) return;
  e.preventDefault(); e.stopPropagation();
  mpadPut(box, ed.from, ed.to, ed.text, ed.caret || 0);
  if(ed.pick) mpadPick(box, ed.pick[0], ed.pick[1]);   // what was picked out stays picked out
  mpadSoon();
}, true);
