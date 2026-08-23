/* Open Note — lib/sound.js
   the studio sounds — WebAudio, no asset files */

/* ================= sound engine (WebAudio, no assets) ================= */
const SND = (() => {
  let ctx = null, noiseBuf = null, paperBuf = null, paperLoopStart = 0, pen = null;
  function ac(){
    if(!ctx){
      const AC = window.AudioContext || window.webkitAudioContext;
      if(!AC) return null;
      ctx = new AC();
      const len = ctx.sampleRate * 1.5;
      noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for(let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      /* Pencil friction is weighted, soft noise rather than the flat white
         noise used by the short studio effects. This pink-noise filter takes
         the aerosol hiss out of a sustained stroke. */
      paperBuf = ctx.createBuffer(1, len, ctx.sampleRate);
      const p = paperBuf.getChannelData(0);
      let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
      for(let i = 0; i < len; i++){
        const w = Math.random() * 2 - 1;
        b0 = 0.99886 * b0 + w * 0.0555179;
        b1 = 0.99332 * b1 + w * 0.0750759;
        b2 = 0.96900 * b2 + w * 0.1538520;
        b3 = 0.86650 * b3 + w * 0.3104856;
        b4 = 0.55000 * b4 + w * 0.5329522;
        b5 = -0.7616 * b5 - w * 0.0168980;
        p[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
        b6 = w * 0.115926;
      }
      /* Crossfade the tail into an equally long lead-in, then loop just after
         that lead-in. The samples on either side of the loop are neighbours,
         so a long stroke cannot click each time its texture wraps around. */
      const seam = Math.round(ctx.sampleRate * 0.08);
      for(let i = 0; i < seam; i++){
        const x = i / (seam - 1), a = Math.cos(x * Math.PI / 2), b = Math.sin(x * Math.PI / 2);
        p[len - seam + i] = p[len - seam + i] * a + p[i] * b;
      }
      paperLoopStart = seam / ctx.sampleRate;
    }
    if(ctx.state === 'suspended') ctx.resume();
    return ctx;
  }
  function vol(){
    if(!index || !index.settings) return 0;
    if(index.settings.sound === false) return 0;
    return (index.settings.vol == null ? 50 : index.settings.vol) / 100;
  }
  function tone(freq, dur, type, gainAmt, slideTo, delay){
    const v = vol(); if(!v) return;
    const c = ac(); if(!c) return;
    const t = c.currentTime + (delay || 0);
    const o = c.createOscillator(), g = c.createGain();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(freq, t);
    if(slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur * 0.8);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gainAmt * v, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(c.destination);
    o.start(t); o.stop(t + dur + 0.05);
  }
  function noise(dur, freq, q, gainAmt, sweepTo, delay){
    const v = vol(); if(!v) return;
    const c = ac(); if(!c) return;
    const t = c.currentTime + (delay || 0);
    const s = c.createBufferSource(); s.buffer = noiseBuf; s.loop = true;
    const f = c.createBiquadFilter(); f.type = 'bandpass';
    f.frequency.setValueAtTime(freq, t); f.Q.value = q;
    if(sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gainAmt * v, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f).connect(g).connect(c.destination);
    s.start(t); s.stop(t + dur + 0.05);
  }
  /* Drawing is one continuous contact, not a row of sound effects. Two quiet
     bands from the same noise bed make the paper's body and its fine fibres;
     movement opens them up, pressure gives them weight, and lifting the nib
     releases both together. */
  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
  function hold(param, t){
    if(param.cancelAndHoldAtTime) param.cancelAndHoldAtTime(t);
    else{
      const value = param.value;
      param.cancelScheduledValues(t);
      param.setValueAtTime(value, t);
    }
  }
  const PEN_VOICE = {
    pen:   { body:1120, fibre:3150, level:0.047 },
    mark:  { body: 680, fibre:1900, level:0.040 },
    erase: { body: 440, fibre:1350, level:0.058 }
  };
  function penLevel(speed, pressure){
    const motion = clamp(speed / 0.55, 0, 1);
    const touch = pressure > 0 ? clamp(pressure, 0.12, 1) : 0.45;
    return (0.18 + motion * 0.82) * (0.68 + touch * 0.32);
  }
  function preparePen(){
    if(!vol()) return;
    const c = ac(); if(!c) return;
    /* Opening Draw is already a user gesture, so wake the audio device here
       behind an exactly silent voice. The first real nib contact then starts
       on an engine which is running, rather than carrying its startup thump. */
    const src = c.createBufferSource(), mute = c.createGain(), t = c.currentTime;
    src.buffer = paperBuf;
    mute.gain.value = 0;
    src.connect(mute).connect(c.destination);
    src.start(t); src.stop(t + 0.035);
  }
  function penStart(mode, pressure){
    const v = vol(); if(!v) return;
    penStop(true);
    const c = ac(); if(!c) return;
    const voice = PEN_VOICE[mode] || PEN_VOICE.pen, t = c.currentTime;
    const src = c.createBufferSource(); src.buffer = paperBuf; src.loop = true; src.loopStart = paperLoopStart;
    const body = c.createBiquadFilter(); body.type = 'bandpass'; body.Q.value = 0.42;
    const fibre = c.createBiquadFilter(); fibre.type = 'bandpass'; fibre.Q.value = 0.72;
    body.frequency.value = voice.body;
    fibre.frequency.value = voice.fibre;
    const bodyGain = c.createGain(), fibreGain = c.createGain(), out = c.createGain();
    bodyGain.gain.value = 0.86;
    fibreGain.gain.value = 0.14;
    out.gain.setValueAtTime(0.0001, t);
    src.connect(body).connect(bodyGain).connect(out);
    src.connect(fibre).connect(fibreGain).connect(out);
    out.connect(c.destination);
    const span = Math.max(0.1, paperBuf.duration - paperLoopStart - 0.1);
    src.start(t, paperLoopStart + Math.random() * span);
    pen = { src, body, fibre, out, voice, v, speed:0 };
  }
  function penMove(speed, pressure){
    if(!pen) return;
    const t = ctx.currentTime;
    pen.speed += (clamp(speed, 0, 0.55) - pen.speed) * 0.24;
    const motion = pen.speed / 0.55;
    const level = pen.voice.level * pen.v * penLevel(pen.speed, pressure);
    hold(pen.out.gain, t);
    pen.out.gain.setTargetAtTime(Math.max(0.0001, level), t, 0.018);
    /* Faster strokes expose the brighter fibres; a slow stroke stays soft and
       close, as a real nib does instead of merely getting louder. */
    hold(pen.body.frequency, t);
    hold(pen.fibre.frequency, t);
    pen.body.frequency.setTargetAtTime(pen.voice.body * (0.92 + motion * 0.18), t, 0.035);
    pen.fibre.frequency.setTargetAtTime(pen.voice.fibre * (0.90 + motion * 0.24), t, 0.03);
    /* Let closely spaced pointer events join into one stroke. The slow tail
       falls away only when movement really pauses, avoiding a row of puffs. */
    pen.out.gain.setTargetAtTime(Math.max(0.0001, level * 0.12), t + 0.085, 0.045);
  }
  function penStop(now){
    if(!pen) return;
    const p = pen, t = ctx.currentTime, release = now ? 0.006 : 0.032;
    pen = null;
    hold(p.out.gain, t);
    p.out.gain.setTargetAtTime(0.0001, t, release / 3);
    try{ p.src.stop(t + release + 0.025); }catch(e){}
  }
  let lastScratch = 0;
  return {
    plop(){ tone(300 + Math.random() * 60, 0.16, 'sine', 0.22, 120); },              // placing things
    pop(){  tone(560 + Math.random() * 80, 0.10, 'sine', 0.16, 260); },              // stickers
    pluck(){ tone(180, 0.12, 'triangle', 0.14, 90); },                               // delete
    tick(){ tone(1150, 0.045, 'square', 0.05); tone(760, 0.06, 'sine', 0.06); },     // checkbox
    flip(){                                                                           // papery page turn
      const j = 0.9 + Math.random() * 0.2;                       // no two turns identical
      noise(0.22, 500 * j, 0.55, 0.055, 1500 * j);               // soft body of the page moving
      noise(0.13, 2500 * j, 1.3, 0.05, 1600, 0.07);              // bright slide past the fingers
      const n = 3 + (Math.random() * 3 | 0);                     // fibres crackle as it settles
      for(let i = 0; i < n; i++)
        noise(0.02, 2600 + Math.random() * 2400, 3.5, 0.04, 0, 0.12 + i * 0.035 + Math.random() * 0.02);
    },
    tape(){ noise(0.14, 1800, 1.2, 0.12, 900); },                                    // washi rip
    /* undo runs the tape back: the sweep and the note both fall. Redo is the
       same sound the other way up, so the pair reads as one motion reversed. */
    undo(){ noise(0.17, 2400, 1.0, 0.05, 620);  tone(360, 0.15, 'triangle', 0.09, 190, 0.015); },
    redo(){ noise(0.17, 620,  1.0, 0.05, 2400); tone(190, 0.15, 'triangle', 0.09, 360, 0.015); },
    nope(){ tone(120, 0.09, 'sine', 0.09); noise(0.05, 260, 1.4, 0.035); },          // nothing left to take back
    preparePen,
    penStart,
    penMove,
    penStop,
    scratch(){                                                                        // pencil on paper
      const now = performance.now();
      if(now - lastScratch < 42) return;
      lastScratch = now;
      noise(0.06, 1500 + Math.random() * 900, 2.2, 0.05);
    }
  };
})();
