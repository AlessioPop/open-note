/* Open Note — ui/glass.js
   the glass material, and the warp — how floating surfaces look and arrive.

   Two classes and two functions, shared by every panel that floats over the
   desk. `.glass` is the frosted material — desk-tinted, blurred backdrop,
   hairline edge with a lit top. `.glass-lite` is the same look without the
   backdrop blur, for bars that stay up while ink is being drawn (a blur
   re-filters everything under it on every stroke). warpIn()/warpOut() scale a
   surface out of the exact point it was summoned from — blurred to sharp with
   a slight overshoot — and suck it back into that point on the way out. */

addCSS('glass', `
/* ---------- the glass material ---------- */
/* The class is doubled for specificity: adopters (.drawer, .lpanel, .inkbar)
   carry solid backgrounds of their own, and this rule has to win wherever it
   sits in the cascade without touching those files. */
.glass.glass,.glass-lite.glass-lite{
  color:#e9eaef;border-color:transparent;
  background:
    linear-gradient(160deg,rgba(255,255,255,.075),rgba(255,255,255,.02) 40%,rgba(255,255,255,0) 70%),
    color-mix(in srgb,var(--desk) 46%,rgb(12 14 19 / .84));
  box-shadow:inset 0 0 0 1px rgba(255,255,255,.085),inset 0 1.5px 0 rgba(255,255,255,.12),
    0 26px 68px rgba(0,0,0,.5),0 4px 14px rgba(0,0,0,.3);
}
.glass.glass{-webkit-backdrop-filter:blur(26px) saturate(1.5);backdrop-filter:blur(26px) saturate(1.5)}
.glass-lite.glass-lite{background:
    linear-gradient(160deg,rgba(255,255,255,.06),rgba(255,255,255,.015) 45%,rgba(255,255,255,0) 75%),
    color-mix(in srgb,var(--desk) 56%,rgb(12 14 19 / .9))}
@supports not (backdrop-filter: blur(1px)){
  .glass.glass{background:color-mix(in srgb,var(--desk) 55%,#14171c)}
}
/* the surfaces that adopt it round themselves off; the drawer stays a sheet */
.lpanel.glass,.inkbar.glass-lite{border-radius:14px}
`);

/* ---- the warp ----
   ox/oy is where the surface was summoned from, in viewport pixels: the
   cursor, or the middle of the button that was pressed. The surface scales
   about that point, so it reads as coming out of it rather than appearing. */
function warpOrigin(el, ox, oy){
  const r = el.getBoundingClientRect();
  el.style.transformOrigin =
    clamp(ox - r.left, 0, r.width) + 'px ' + clamp(oy - r.top, 0, r.height) + 'px';
}
const WARP_STILL = matchMedia('(prefers-reduced-motion: reduce)');

function warpIn(el, ox, oy){
  el.getAnimations().forEach(a => a.cancel());
  if(ox != null) warpOrigin(el, ox, oy);
  if(WARP_STILL.matches) return el.animate({ opacity: [0, 1] }, { duration: 90 });
  return el.animate([
    { transform: 'scale(.55)',  opacity: 0, filter: 'blur(10px)' },
    { transform: 'scale(1.02)', opacity: 1, filter: 'blur(0px)', offset: .72 },
    { transform: 'scale(1)',    opacity: 1, filter: 'blur(0px)' }
  ], { duration: 340, easing: 'cubic-bezier(.2,.9,.27,1)' });
}

/* done() fires when it has gone — that is when the caller takes display away */
function warpOut(el, done){
  el.getAnimations().forEach(a => a.cancel());
  const a = WARP_STILL.matches
    ? el.animate({ opacity: [1, 0] }, { duration: 70 })
    : el.animate([
        { transform: 'scale(1)',   opacity: 1, filter: 'blur(0px)' },
        { transform: 'scale(.62)', opacity: 0, filter: 'blur(8px)' }
      ], { duration: 185, easing: 'cubic-bezier(.4,0,.85,.5)' });
  a.onfinish = a.oncancel = () => done && done();
  return a;
}
