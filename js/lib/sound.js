/* Open Note — lib/sound.js
   the studio sounds — WebAudio, no asset files */

/* ================= sound engine (WebAudio, no assets) ================= */
const SND = (() => {
  let ctx = null, noiseBuf = null;
  function ac(){
    if(!ctx){
      const AC = window.AudioContext || window.webkitAudioContext;
      if(!AC) return null;
      ctx = new AC();
      const len = ctx.sampleRate * 1.5;
      noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for(let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
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
    scratch(){                                                                        // pencil on paper
      const now = performance.now();
      if(now - lastScratch < 42) return;
      lastScratch = now;
      noise(0.06, 1500 + Math.random() * 900, 2.2, 0.05);
    }
  };
})();
