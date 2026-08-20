/* Open Note — lib/spring.js
   springs and momentum. Owes nothing to this app at all.

   Motion that starts from the current on-screen value, inherits the hand's
   velocity, projects it forward, and can be grabbed and redirected at any
   instant. The spring is solved in closed form from its current value and
   velocity every frame — exact and unconditionally stable, so a slow frame or
   a background tab can never blow one up, and retargeting mid-flight changes
   nothing but the maths. Two designer parameters, not three physics ones:

     damping   1 settles cleanly; below 1 it overshoots — earn that with a flick
     response  how quickly it closes in, in seconds. Not a duration.

   Nothing here is a library dependency: it is this file. */

/* the machine's own word on motion — a spring asked to move just arrives */
const SPRING_STILL = matchMedia('(prefers-reduced-motion: reduce)');

/* ---- one shared clock: every live spring ticks on the same frame ---- */
const _sprFns = new Set();
let _sprRaf = 0, _sprLast = 0;
function _sprLoop(t){
  _sprRaf = 0;
  const dt = Math.min(.05, (t - _sprLast) / 1000 || .016);
  _sprLast = t;
  for(const fn of [..._sprFns]) if(fn(dt) === false) _sprFns.delete(fn);
  if(_sprFns.size) _sprRaf = requestAnimationFrame(_sprLoop);
}
/* run fn(dt) every frame until it returns false; hands back a cancel() */
function motionTick(fn){
  _sprFns.add(fn);
  if(!_sprRaf){ _sprLast = performance.now(); _sprRaf = requestAnimationFrame(_sprLoop); }
  return () => _sprFns.delete(fn);
}

/* ---- the spring ---- */
function spring(opts){
  opts = opts || {};
  let x = opts.from || 0, v = 0, target = x;
  let zeta = opts.damping == null ? 1 : opts.damping;
  let resp = opts.response == null ? .35 : opts.response;
  const restD = opts.rest == null ? .06 : opts.rest;
  const restV = opts.restSpeed == null ? restD * 12 : opts.restSpeed;
  let stop = null;

  function step(dt){
    const w = 2 * Math.PI / resp;
    const d = x - target;
    if(zeta >= 1){                                    /* critically damped */
      const A = d, B = v + w * d, e = Math.exp(-w * dt);
      x = target + (A + B * dt) * e;
      v = (B - w * (A + B * dt)) * e;
    } else {                                          /* underdamped: it may overshoot */
      const wd = w * Math.sqrt(1 - zeta * zeta);
      const A = d, B = (v + zeta * w * d) / wd;
      const e = Math.exp(-zeta * w * dt), c = Math.cos(wd * dt), s = Math.sin(wd * dt);
      x = target + e * (A * c + B * s);
      v = e * ((B * wd - zeta * w * A) * c - (A * wd + zeta * w * B) * s);
    }
    if(Math.abs(x - target) < restD && Math.abs(v) < restV){
      x = target; v = 0;
      opts.onUpdate && opts.onUpdate(x);
      stop = null;
      opts.onRest && opts.onRest();
      return false;
    }
    opts.onUpdate && opts.onUpdate(x);
    return true;
  }

  const s = {
    get value(){ return x; },
    get velocity(){ return v; },
    get target(){ return target; },
    get active(){ return !!stop; },
    /* retarget from wherever it is now — optionally with the gesture's velocity */
    to(t, vel){
      target = t;
      if(vel != null) v = vel;
      if(SPRING_STILL.matches){ return s.jump(t); }
      if(!stop) stop = motionTick(dt => step(dt) || (stop = null, false));
      return s;
    },
    /* place it: no animation, no leftover velocity — how a drag tracks 1:1 */
    jump(t){
      if(stop){ stop(); stop = null; }
      x = target = t; v = 0;
      opts.onUpdate && opts.onUpdate(x);
      opts.onRest && opts.onRest();
      return s;
    },
    set(p){ if(p.damping != null) zeta = p.damping;
            if(p.response != null) resp = p.response; return s; },
    stopAt(){ if(stop){ stop(); stop = null; } return s; }
  };
  return s;
}

/* ---- the hand's velocity at release ----
   A short history of recent pointer positions; vel() reads the last ~100ms as
   px/s. Feed it every move — the seam between a drag and its glide is exactly
   this number. */
function flickTrack(){
  const hist = [];
  return {
    track(e){
      hist.push({ t: performance.now(), x: e.clientX, y: e.clientY });
      if(hist.length > 8) hist.shift();
    },
    vel(){
      const now = performance.now();
      const pts = hist.filter(p => now - p.t < 110);
      if(pts.length < 2) return { vx: 0, vy: 0 };
      const a = pts[0], b = pts[pts.length - 1], dt = (b.t - a.t) || 1;
      return { vx: (b.x - a.x) / dt * 1000, vy: (b.y - a.y) / dt * 1000 };
    }
  };
}

/* where a flick would come to rest on its own — scroll deceleration's own
   sum. 0.998 glides like a scroll; 0.99 is the short slide of paper on paper */
function projectFling(velocity, decel){
  decel = decel || .99;
  return (velocity / 1000) * decel / (1 - decel);
}
