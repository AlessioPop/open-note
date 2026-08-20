/* Open Note — items/model.js
   3D models — a .obj out of Blender */

/* ================= 3D models (.obj out of Blender) ================= */
/* The .obj text is kept in the media store like a video, so backups, deletes and
   restores already cover it. Geometry is parsed once per session and drawn by ONE
   shared WebGL canvas that every model item blits from — a page full of models
   still costs a single GL context. Each item keeps a poster of its last pose, and
   that is what thumbnails, print and exported books show. */
const MESH = new Map();                            // media id → Promise<geometry|null>
const MDL_LOOKS = ['clay', 'both', 'wire'];
const MDL_LOOK_NAMES = { clay: 'Shaded', both: 'Shaded + wireframe', wire: 'Wireframe' };
const MDL_COLORS = ['#cec6b4', 'accent2', 'accent', 'ink'];
const MDL_HOME = { yaw: -0.6, pitch: -0.32, dist: 3.4 };   // the three-quarter view it opens on
const WIRE_MAX = 120000;                           // triangles we are willing to draw as lines

function parseOBJ(text){
  const V = [], N = [], T = [], pos = [], nrm = [], uv = [];
  const marks = [];                                // where each usemtl run starts, in triangles
  let lib = '';
  const lines = text.split('\n');
  const f = [];
  for(let li = 0; li < lines.length; li++){
    const s = lines[li];
    if(s.length < 2) continue;
    const c0 = s.charCodeAt(0), c1 = s.charCodeAt(1);
    if(c0 === 118){                                // v / vt / vn
      if(c1 === 32 || c1 === 9){ const p = s.split(/\s+/); V.push(+p[1], +p[2], +p[3]); }
      else if(c1 === 110){ const p = s.split(/\s+/); N.push(+p[1], +p[2], +p[3]); }
      else if(c1 === 116){ const p = s.split(/\s+/); T.push(+p[1], +p[2]); }
      continue;
    }
    if(c0 === 117 && s.slice(0, 7) === 'usemtl '){ marks.push({ m: s.slice(7).trim(), at: pos.length / 9 }); continue; }
    if(c0 === 109 && s.slice(0, 7) === 'mtllib '){ lib = lib || s.slice(7).trim(); continue; }
    if(c0 !== 102 || (c1 !== 32 && c1 !== 9)) continue;         // only face lines from here
    f.length = 0;
    const p = s.split(/\s+/);
    for(let i = 1; i < p.length; i++){
      if(!p[i]) continue;
      const t = p[i].split('/');
      let vi = parseInt(t[0], 10);
      if(!vi) continue;
      vi = (vi < 0 ? V.length / 3 + vi : vi - 1) * 3;
      let ni = t.length > 2 && t[2] ? parseInt(t[2], 10) : 0;
      ni = ni ? (ni < 0 ? N.length / 3 + ni : ni - 1) * 3 : -1;
      let ti = t.length > 1 && t[1] ? parseInt(t[1], 10) : 0;
      ti = ti ? (ti < 0 ? T.length / 2 + ti : ti - 1) * 2 : -1;
      f.push(vi, ni, ti);
    }
    const n = f.length / 3;
    for(let k = 1; k < n - 1; k++){                // fan-triangulate quads and n-gons
      const tri = [0, k, k + 1];
      const ax = [], an = [], at = [];
      for(const q of tri){
        const vi = f[q * 3], ni = f[q * 3 + 1], ti = f[q * 3 + 2];
        ax.push(V[vi], V[vi + 1], V[vi + 2]);
        an.push(ni >= 0 && ni + 2 < N.length ? [N[ni], N[ni + 1], N[ni + 2]] : null);
        at.push(ti >= 0 && ti + 1 < T.length ? [T[ti], T[ti + 1]] : null);
      }
      if(!isFinite(ax[0]+ax[1]+ax[2]+ax[3]+ax[4]+ax[5]+ax[6]+ax[7]+ax[8])) continue;   // bad index
      let fn = null;
      if(an.some(x => !x)){                        // no normals in the file: flat-shade the face
        const ux = ax[3] - ax[0], uy = ax[4] - ax[1], uz = ax[5] - ax[2];
        const vx = ax[6] - ax[0], vy = ax[7] - ax[1], vz = ax[8] - ax[2];
        let x = uy * vz - uz * vy, y = uz * vx - ux * vz, z = ux * vy - uy * vx;
        const l = Math.hypot(x, y, z) || 1;
        fn = [x / l, y / l, z / l];
      }
      for(let q = 0; q < 3; q++){
        pos.push(ax[q * 3], ax[q * 3 + 1], ax[q * 3 + 2]);
        const nn = an[q] || fn;
        nrm.push(nn[0], nn[1], nn[2]);
        uv.push(at[q] ? at[q][0] : 0, at[q] ? at[q][1] : 0);
      }
    }
  }
  if(!pos.length) return null;
  const P = new Float32Array(pos);
  let mnx = Infinity, mny = Infinity, mnz = Infinity, mxx = -Infinity, mxy = -Infinity, mxz = -Infinity;
  for(let i = 0; i < P.length; i += 3){
    if(P[i] < mnx) mnx = P[i];       if(P[i] > mxx) mxx = P[i];
    if(P[i+1] < mny) mny = P[i+1];   if(P[i+1] > mxy) mxy = P[i+1];
    if(P[i+2] < mnz) mnz = P[i+2];   if(P[i+2] > mxz) mxz = P[i+2];
  }
  /* centre it, then scale by the bounding-sphere radius so one camera distance
     frames every model the same, whatever units Blender exported in */
  const cx = (mnx + mxx) / 2, cy = (mny + mxy) / 2, cz = (mnz + mxz) / 2;
  let r2 = 0;
  for(let i = 0; i < P.length; i += 3){
    const dx = P[i] - cx, dy = P[i+1] - cy, dz = P[i+2] - cz;
    const d = dx * dx + dy * dy + dz * dz;
    if(d > r2) r2 = d;
  }
  const k = 1 / (Math.sqrt(r2) || 1);
  for(let i = 0; i < P.length; i += 3){
    P[i] = (P[i] - cx) * k; P[i+1] = (P[i+1] - cy) * k; P[i+2] = (P[i+2] - cz) * k;
  }
  const tris = P.length / 9;
  /* one draw range per material, in the order the file lays them out */
  const groups = marks.map((g, i) => ({ m: g.m, at: g.at, n: (i + 1 < marks.length ? marks[i + 1].at : tris) - g.at }))
                      .filter(g => g.n > 0);
  return { pos: P, nrm: new Float32Array(nrm), uv: new Float32Array(uv), tris, verts: V.length / 3,
    groups: groups.length ? groups : [{ m: '', at: 0, n: tris }], lib, uvs: T.length > 0 };
}
/* the .mtl beside the .obj: base colour and texture map per material */
function parseMTL(text){
  const out = {};
  let m = null, n = 0;
  for(const raw of String(text || '').split('\n')){
    const s = raw.trim();
    if(!s || s[0] === '#') continue;
    const sp = s.search(/\s/);
    const k = (sp < 0 ? s : s.slice(0, sp)).toLowerCase();
    const v = sp < 0 ? '' : s.slice(sp + 1).trim();
    if(k === 'newmtl'){ m = out[v] = { kd: null, map: '' }; n++; continue; }
    if(!m) continue;
    if(k === 'kd'){
      const p = v.split(/\s+/).map(Number);
      if(p.length >= 3 && p.every(x => isFinite(x))) m.kd = [p[0], p[1], p[2]];
    }
    else if((k === 'map_kd' || k === 'map_ka') && !m.map) m.map = mtlMapFile(v);
  }
  return n ? out : null;
}
/* "map_Kd -s 1 1 1 //tex/hull plate.png" → "hull plate.png" */
function mtlMapFile(v){
  const p = v.split(/\s+/).filter(Boolean);
  let i = 0;
  while(i < p.length && (p[i][0] === '-' || /^(on|off|[rgbaml]|[-+]?[0-9.]+(e[-+]?\d+)?)$/i.test(p[i]))) i++;
  return p.slice(i).join(' ').split(/[\\/]/).pop();
}
function wireOf(mesh){
  if(mesh.wire !== undefined) return mesh.wire;
  if(mesh.tris > WIRE_MAX) return (mesh.wire = null);
  const P = mesh.pos, out = new Float32Array(mesh.tris * 18);
  let o = 0;
  for(let t = 0; t < mesh.tris; t++){
    const a = t * 9;
    for(const [i, j] of [[0, 3], [3, 6], [6, 0]]){
      out[o++] = P[a+i]; out[o++] = P[a+i+1]; out[o++] = P[a+i+2];
      out[o++] = P[a+j]; out[o++] = P[a+j+1]; out[o++] = P[a+j+2];
    }
  }
  return (mesh.wire = out);
}
function getMesh(id){
  if(!id) return Promise.resolve(null);
  if(MESH.has(id)) return MESH.get(id);
  const p = (async () => {
    const b = await mediaGet(id);
    if(!b) return null;
    try{ return parseOBJ(await b.text()); }catch(e){ return null; }
  })();
  MESH.set(id, p);
  return p;
}
const MATS = new Map();                            // item id  → Promise<materials|null>
const TEXIMG = new Map();                          // media id → Promise<image|null>
/* an item's materials: colours out of its .mtl, pictures out of its textures */
function getMats(it){
  if(MATS.has(it.id)) return MATS.get(it.id);
  const p = (async () => {
    const defs = parseMTL(it.mtl || '');
    if(!defs) return null;
    for(const name in defs){
      const id = texMedia(it.texs, defs[name].map);
      defs[name].img = id ? await getTexImg(id) : null;
    }
    return defs;
  })();
  MATS.set(it.id, p);
  return p;
}
function texMedia(texs, file){                     // match map_Kd to a file that came with it
  if(!texs || !file) return null;
  const want = String(file).toLowerCase();
  for(const k in texs) if(k.toLowerCase() === want) return texs[k];
  return null;
}
function getTexImg(id){
  if(TEXIMG.has(id)) return TEXIMG.get(id);
  const p = (async () => {
    const b = await mediaGet(id);
    if(!b) return null;
    if(window.createImageBitmap){ try{ return await createImageBitmap(b); }catch(e){} }
    const url = URL.createObjectURL(b);                          // older browsers
    try{
      const img = new Image();
      await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = url; });
      return img;
    }catch(e){ return null; }
  })();
  TEXIMG.set(id, p);
  return p;
}
const matCount = m => m ? Object.keys(m).length : 0;
const texCount = m => m ? Object.keys(m).filter(k => m[k].img).length : 0;

/* ---- one shared WebGL canvas for every model on the page ---- */
const m4 = {
  persp(fovy, asp, n, f){
    const t = 1 / Math.tan(fovy / 2), o = new Float32Array(16);
    o[0] = t / asp; o[5] = t; o[10] = (f + n) / (n - f); o[11] = -1; o[14] = 2 * f * n / (n - f);
    return o;
  },
  mul(a, b){
    const o = new Float32Array(16);
    for(let i = 0; i < 4; i++) for(let j = 0; j < 4; j++){
      let s = 0;
      for(let k = 0; k < 4; k++) s += a[k * 4 + j] * b[i * 4 + k];
      o[i * 4 + j] = s;
    }
    return o;
  },
  /* T(-dist) · rotX(pitch) · rotY(yaw), stored column-major.
     Dragging moves the face you are looking at: right turns it right, down brings the top over. */
  orbit(yaw, pitch, dist){
    const cy = Math.cos(yaw), sy = Math.sin(yaw), cx = Math.cos(pitch), sx = Math.sin(pitch);
    const o = new Float32Array(16);
    o[0] = cy;       o[4] = 0;   o[8]  = sy;
    o[1] = sx * sy;  o[5] = cx;  o[9]  = -sx * cy;
    o[2] = -cx * sy; o[6] = sx;  o[10] = cx * cy;
    o[14] = -dist; o[15] = 1;
    return o;
  }
};
const GLR = (() => {
  let cv = null, gl = null, prog = null, U = {}, A = {}, dead = false;
  const bufs = new WeakMap(), texs = new WeakMap();
  const VS =
    'attribute vec3 aPos;attribute vec3 aNrm;attribute vec2 aUV;uniform mat4 uMV,uP;' +
    'varying vec3 vN,vE;varying vec2 vT;' +
    'void main(){vec4 p=uMV*vec4(aPos,1.0);vN=mat3(uMV)*aNrm;vE=-p.xyz;vT=aUV;gl_Position=uP*p;}';
  const FS =
    'precision mediump float;uniform vec3 uCol;uniform float uFlat,uHasTex;uniform sampler2D uTex;' +
    'varying vec3 vN,vE;varying vec2 vT;' +
    'void main(){if(uFlat>0.5){gl_FragColor=vec4(uCol,1.0);return;}' +
    'vec3 c=uCol;if(uHasTex>0.5)c*=texture2D(uTex,vT).rgb;' +
    'vec3 n=normalize(vN),e=normalize(vE);if(dot(n,e)<0.0)n=-n;' +       // open meshes read both ways
    'vec3 l=normalize(vec3(0.4,0.85,0.55));float d=max(dot(n,l),0.0);' +
    'float amb=0.30+0.26*max(n.y,0.0);' +
    'float rim=pow(1.0-max(dot(n,e),0.0),2.6)*0.30;' +
    'gl_FragColor=vec4(c*(amb+0.82*d)+rim,1.0);}';
  function sh(g, type, src){
    const s = g.createShader(type);
    g.shaderSource(s, src); g.compileShader(s);
    return g.getShaderParameter(s, g.COMPILE_STATUS) ? s : null;
  }
  function boot(){
    if(gl || dead) return gl;
    cv = document.createElement('canvas');
    const opt = { alpha: true, antialias: true, depth: true, premultipliedAlpha: true };
    try{ gl = cv.getContext('webgl', opt) || cv.getContext('experimental-webgl', opt); }catch(e){ gl = null; }
    if(!gl){ dead = true; return null; }
    const v = sh(gl, gl.VERTEX_SHADER, VS), f = sh(gl, gl.FRAGMENT_SHADER, FS);
    prog = v && f && gl.createProgram();
    if(!prog){ dead = true; gl = null; return null; }
    gl.attachShader(prog, v); gl.attachShader(prog, f); gl.linkProgram(prog);
    if(!gl.getProgramParameter(prog, gl.LINK_STATUS)){ dead = true; gl = null; return null; }
    gl.useProgram(prog);
    A.pos = gl.getAttribLocation(prog, 'aPos');
    A.nrm = gl.getAttribLocation(prog, 'aNrm');
    A.uv  = gl.getAttribLocation(prog, 'aUV');
    ['uMV', 'uP', 'uCol', 'uFlat', 'uHasTex', 'uTex'].forEach(n => { U[n] = gl.getUniformLocation(prog, n); });
    gl.enable(gl.DEPTH_TEST);
    return gl;
  }
  function meshBufs(mesh){
    let b = bufs.get(mesh);
    if(b) return b;
    b = { v: gl.createBuffer(), n: gl.createBuffer(), t: gl.createBuffer(), w: null, wn: 0 };
    gl.bindBuffer(gl.ARRAY_BUFFER, b.v); gl.bufferData(gl.ARRAY_BUFFER, mesh.pos, gl.STATIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, b.n); gl.bufferData(gl.ARRAY_BUFFER, mesh.nrm, gl.STATIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, b.t);
    gl.bufferData(gl.ARRAY_BUFFER, mesh.uv || new Float32Array(mesh.tris * 6), gl.STATIC_DRAW);
    bufs.set(mesh, b);
    return b;
  }
  /* one GL texture per decoded picture, however many models share it */
  function glTex(img){
    let t = texs.get(img);
    if(t) return t;
    t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);                 // .obj v runs up, pictures run down
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
    const p2 = n => n > 0 && (n & (n - 1)) === 0;
    if(p2(img.width) && p2(img.height)){
      gl.generateMipmap(gl.TEXTURE_2D);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    } else {                                                       // WebGL1 wants NPOT clamped
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    }
    texs.set(img, t);
    return t;
  }
  function bind(buf, loc, on, size){
    if(loc < 0) return;                             // attribute optimised out of the program
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, size || 3, gl.FLOAT, false, 0, 0);
    if(!on) gl.disableVertexAttribArray(loc);
  }
  return {
    get dead(){ return dead; },
    draw(mesh, w, h, o){
      const g = boot();
      if(!g || !mesh) return null;
      if(cv.width !== w || cv.height !== h){ cv.width = w; cv.height = h; }
      g.viewport(0, 0, w, h);
      g.clearColor(0, 0, 0, 0);
      g.clear(g.COLOR_BUFFER_BIT | g.DEPTH_BUFFER_BIT);
      g.useProgram(prog);
      g.uniformMatrix4fv(U.uP, false, m4.persp(0.62, w / h, 0.05, 60));
      g.uniformMatrix4fv(U.uMV, false, m4.orbit(o.yaw, o.pitch, o.dist));
      const b = meshBufs(mesh);
      const look = o.look === 'wire' && wireOf(mesh) ? 'wire' : (o.look === 'both' && wireOf(mesh) ? 'both' : 'clay');
      if(look !== 'wire'){
        bind(b.v, A.pos, true); bind(b.n, A.nrm, true); bind(b.t, A.uv, true, 2);
        g.uniform1f(U.uFlat, 0);
        if(look === 'both'){ g.enable(g.POLYGON_OFFSET_FILL); g.polygonOffset(1.2, 1.2); }
        /* one pass per material run — its own colour, its own texture */
        for(const gr of (mesh.groups || [{ m: '', at: 0, n: mesh.tris }])){
          const m = o.mat && o.mats ? o.mats[gr.m] : null;
          const img = m && m.img;
          g.uniform3fv(U.uCol, m && m.kd ? m.kd : o.col);
          if(img){ g.activeTexture(g.TEXTURE0); g.bindTexture(g.TEXTURE_2D, glTex(img));
                   g.uniform1i(U.uTex, 0); g.uniform1f(U.uHasTex, 1); }
          else g.uniform1f(U.uHasTex, 0);
          g.drawArrays(g.TRIANGLES, gr.at * 3, gr.n * 3);
        }
        if(look === 'both') g.disable(g.POLYGON_OFFSET_FILL);
      }
      if(look !== 'clay'){
        const W = wireOf(mesh);
        if(!b.w){ b.w = g.createBuffer(); g.bindBuffer(g.ARRAY_BUFFER, b.w);
          g.bufferData(g.ARRAY_BUFFER, W, g.STATIC_DRAW); b.wn = W.length / 3; }
        bind(b.w, A.pos, true);
        if(A.nrm >= 0){ g.disableVertexAttribArray(A.nrm); g.vertexAttrib3f(A.nrm, 0, 0, 1); }
        if(A.uv >= 0){ g.disableVertexAttribArray(A.uv); g.vertexAttrib2f(A.uv, 0, 0); }
        g.uniform1f(U.uFlat, 1); g.uniform1f(U.uHasTex, 0);
        g.uniform3fv(U.uCol, look === 'wire' ? o.col : o.wire);
        g.drawArrays(g.LINES, 0, b.wn);
      }
      return cv;
    }
  };
})();

function rgbOf(v){
  v = String(v || '').trim();
  if(!/^#/.test(v)) v = (getComputedStyle(document.body).getPropertyValue('--' + v) || '').trim();
  let m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(v);
  if(!m) return [0.8, 0.78, 0.72];
  let h = m[1];
  if(h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  const n = parseInt(h, 16);
  return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255];
}
/* with a .mtl in hand the colour button gains a first stop: the model's own materials */
const mdlSeq = mats => mats ? ['mtl'].concat(MDL_COLORS) : MDL_COLORS;
function mdlOpts(it, mats){
  const seq = mdlSeq(mats);
  const pick = seq[(it.ci || 0) % seq.length];
  const mat = pick === 'mtl';
  const col = rgbOf(mat ? MDL_COLORS[0] : pick);
  const ink = rgbOf('ink');
  return { yaw: it.yaw || 0, pitch: it.pitch || 0, dist: it.dist || MDL_HOME.dist,
    look: MDL_LOOKS[(it.look || 0) % MDL_LOOKS.length], col, mat, mats,
    wire: [ink[0] * 0.6 + 0.1, ink[1] * 0.6 + 0.1, ink[2] * 0.6 + 0.1] };
}
function mdlNote(cv, msg){
  const c = cv.getContext('2d');
  const w = cv.width || 2, h = cv.height || 2;
  c.clearRect(0, 0, w, h);
  c.fillStyle = getComputedStyle(document.body).getPropertyValue('--soft') || '#888';
  c.font = Math.round(h / 14) + 'px ui-monospace,Menlo,monospace';
  c.textAlign = 'center'; c.textBaseline = 'middle';
  c.fillText(msg, w / 2, h / 2);
}
function paintModel(el, it, mesh, mats){
  const cv = el.querySelector('canvas.mv');
  if(!cv) return;
  const r = cv.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = Math.max(2, Math.round((r.width || 320) * dpr)), h = Math.max(2, Math.round((r.height || 240) * dpr));
  if(cv.width !== w || cv.height !== h){ cv.width = w; cv.height = h; }
  if(!mesh){ mdlNote(cv, GLR.dead ? 'no 3D in this browser' : 'model not found'); return; }
  const src = GLR.draw(mesh, w, h, mdlOpts(it, mats));
  if(!src){ mdlNote(cv, 'no 3D in this browser'); return; }
  const c = cv.getContext('2d');
  c.clearRect(0, 0, w, h);
  c.drawImage(src, 0, 0);
}
/* the still that print, thumbnails, the shelf and exported books show */
function snapModel(it, mesh, page, mats){
  if(!mesh) return;
  const src = GLR.draw(mesh, 400, 300, mdlOpts(it, mats));
  if(!src) return;
  const c = document.createElement('canvas');
  c.width = 400; c.height = 300;
  c.getContext('2d').drawImage(src, 0, 0);
  try{ it.poster = c.toDataURL('image/png'); }catch(e){ return; }
  queueSave(page.id);
}
async function ensureModels(page){
  for(const it of page.items){
    if(it.type !== 'model') continue;
    const el = document.querySelector('#pageHost .item[data-id="' + it.id + '"]');
    if(!el || !el.querySelector('canvas.mv')) continue;
    const mesh = await getMesh(it.media), mats = await getMats(it);
    paintModel(el, it, mesh, mats);
    if(mesh && !it.poster) snapModel(it, mesh, page, mats);
  }
}
function repaintModels(){
  if(!BOARD) return;
  for(const en of BOARD.entries) ensureModels(en.page);
  /* models sitting on a flip card are drawn by the deck that holds them */
  document.querySelectorAll('.deck').forEach(f => (f.__paint || []).forEach(p => p()));
}

function wireModel(el, it, page){
  const cv = el.querySelector('canvas.mv');
  if(!cv) return;
  let mesh = null, mats = null, snapT = null;
  mdlNote(cv, 'reading ' + (it.name || 'model') + '…');
  Promise.all([getMesh(it.media), getMats(it)]).then(([m, mt]) => {
    mesh = m; mats = mt; el.__mats = mt;
    paintModel(el, it, m, mt);
    if(m && !it.poster) snapModel(it, m, page, mt);
    if(!m) return;
    const bits = [m.tris.toLocaleString() + ' tris'];
    if(matCount(mt)) bits.push(matCount(mt) + ' mat' + (matCount(mt) > 1 ? 's' : '') +
                              (texCount(mt) ? ', ' + texCount(mt) + ' tex' : ''));
    else if(m.lib) bits.push('no ' + m.lib);         // the .obj wants a .mtl that never came
    const meta = el.querySelector('.wmeta');
    if(meta) meta.textContent = bits.join(' · ');
    if(it.tris !== m.tris){ it.tris = m.tris; queueSave(page.id); }   // so stills can say it too
  });
  const repose = () => {
    paintModel(el, it, mesh, mats);
    queueSave(page.id);
    clearTimeout(snapT);
    snapT = setTimeout(() => snapModel(it, mesh, page, mats), 500);
  };
  el.__repose = repose;
  cv.addEventListener('pointerdown', e => {
    if(!el.classList.contains('play') || !mesh) return;
    e.stopPropagation(); e.preventDefault();
    const pid = e.pointerId, sx = e.clientX, sy = e.clientY;
    const y0 = it.yaw || 0, p0 = it.pitch || 0;
    try{ cv.setPointerCapture(pid); }catch(err){}
    const mv = ev => {
      if(ev.pointerId !== pid) return;
      it.yaw = y0 + (ev.clientX - sx) * 0.011;
      it.pitch = clamp(p0 + (ev.clientY - sy) * 0.011, -1.5, 1.5);
      paintModel(el, it, mesh, mats);
    };
    const up = ev => {
      if(ev.pointerId !== pid) return;
      cv.removeEventListener('pointermove', mv);
      cv.removeEventListener('pointerup', up);
      cv.removeEventListener('pointercancel', up);
      repose();
    };
    cv.addEventListener('pointermove', mv);
    cv.addEventListener('pointerup', up);
    cv.addEventListener('pointercancel', up);
  });
  cv.addEventListener('wheel', e => {
    if(!el.classList.contains('play') || !mesh) return;
    e.preventDefault(); e.stopPropagation();
    it.dist = clamp((it.dist || MDL_HOME.dist) * (e.deltaY > 0 ? 1.12 : 1 / 1.12), 1.3, 18);
    repose();
  }, { passive: false });
  cv.addEventListener('dblclick', e => {
    if(!el.classList.contains('play')) return;
    e.stopPropagation();
    it.yaw = MDL_HOME.yaw; it.pitch = MDL_HOME.pitch; it.dist = MDL_HOME.dist;
    repose();
  });
}

const TEX_FILE = /\.(png|jpe?g|gif|webp|bmp)$/i;
/* takes the .obj and whatever came with it — the .mtl and its texture pictures */
async function modelRecord(files){
  const all = [].concat(files || []).filter(Boolean);
  const file = all.find(f => /\.obj$/i.test(f.name)) || all[0];
  if(!file) return null;
  if(file.size > 60 * 1024 * 1024 &&
     !confirm('That .obj is ' + (file.size / 1048576 | 0) + ' MB. Big meshes take a moment to read and make the book heavy. Add it anyway?')) return null;
  const id = uid();
  const ok = await mediaSet(id, file);
  if(!ok){ alert('Could not store the model in this browser.'); return null; }
  const mtlFile = all.find(f => /\.mtl$/i.test(f.name));
  let mtl = '';
  if(mtlFile && mtlFile.size < 512 * 1024) try{ mtl = await mtlFile.text(); }catch(e){}
  const texs = {};
  for(const f of all){                             // only pictures a browser can decode
    if(!TEX_FILE.test(f.name) || f.size > 40 * 1024 * 1024) continue;
    const tid = uid();
    if(await mediaSet(tid, f)) texs[f.name] = tid;
  }
  return { id: uid(), type: 'model', media: id, size: file.size,
    name: file.name, cap: file.name.replace(/\.obj$/i, ''), frame: 'win',
    mtl: mtl || undefined, texs: Object.keys(texs).length ? texs : undefined,
    yaw: MDL_HOME.yaw, pitch: MDL_HOME.pitch, dist: MDL_HOME.dist, look: 0, ci: 0 };
}
async function fileToModel(files, at){
  const r = await modelRecord(files);
  if(!r) return;
  const page = activePage();
  const pos = at || { x: 16 + Math.random() * 10, y: 18 + Math.random() * 24 };
  page.items.push({ ...r, x: clamp(pos.x, 2, 60), y: clamp(pos.y, 4, 74), w: 44,
    rot: 0, z: maxZ(page) + 1, lay: curLayerId() });
  queueSave(page.id); SND.plop(); render();
}
$('#objInput').addEventListener('change', e => {
  if(e.target.files.length) fileToModel([...e.target.files], takePendingAt());
  e.target.value = '';
});

defineItem('model', {
  add: { model: { pick: at => { pendingAt = at || null; $('#objInput').click(); } } },
  /* A model can arrive as a handful of files at once: .obj + .mtl + textures. It
     is asked first, or the picture feature would take the textures off it. */
  takesRank: 2,
  takes(fs, at){ if(!fs.some(f => /\.obj$/i.test(f.name))) return false; fileToModel(fs, at); return true; },
  playArea: '.mwrap',
  stream: false,                    // the .obj is read as text, never streamed as a blob url
  html(it, c){
    return '<figure class="body mdl' + (it.frame === 'plain' ? '' : ' win') + '">' +
      '<div class="wbar"><span class="wnm">' + esc(it.name || '3D model') + '</span>' +
      '<span class="wmeta">' + (it.tris ? it.tris.toLocaleString() + ' tris' : '') + '</span>' +
      '<span class="wbtns"><i>–</i><i>▫</i><i>✕</i></span></div>' +
      '<div class="wpane"><div class="mwrap">' +
      (c.live ? '<canvas class="mv"></canvas><div class="shield"><b>⟳ to look around</b></div>'
              : it.poster ? '<img class="mv" alt="" src="' + esc(it.poster) + '">'
              : '<div class="mph">' + esc(it.name || '3D model') + '</div>') +
      '</div></div><figcaption></figcaption></figure>';
  },
  tools(mk, it, el, page){
    mk('▣', 'Window frame on / off', () => {
      it.frame = it.frame === 'plain' ? 'win' : 'plain';
      el.querySelector('figure').classList.toggle('win', it.frame !== 'plain');
      queueSave(page.id); });
    mk('⟳', 'Look around / move', b => {
      el.classList.toggle('play');
      b.style.background = el.classList.contains('play') ? 'var(--accent)' : ''; });
    mk('◑', 'Model colour — its own materials, or one from the book', () => {
      it.ci = ((it.ci || 0) + 1) % mdlSeq(el.__mats).length;
      if(el.__repose) el.__repose(); else queueSave(page.id); });
    mk('◈', 'Shaded / wireframe', b => {
      it.look = ((it.look || 0) + 1) % MDL_LOOKS.length;
      b.title = MDL_LOOK_NAMES[MDL_LOOKS[it.look]];
      if(el.__repose) el.__repose(); else queueSave(page.id); });
    mk('⌂', 'Back to the starting view', () => {
      it.yaw = MDL_HOME.yaw; it.pitch = MDL_HOME.pitch; it.dist = MDL_HOME.dist;
      if(el.__repose) el.__repose(); else queueSave(page.id); });
  },
  wire(el, it, page){ wireModel(el, it, page); }
});

/* ---- how it looks ---- */
addCSS('model', `
/* 3D model (.obj) — an old desktop window rather than a taped-in photo.
   Every colour is mixed from the book's own theme, so it changes with it. */
.mwrap{position:relative;aspect-ratio:4/3;overflow:hidden}
.mwrap canvas,.mwrap img{display:block;width:100%;height:100%;object-fit:contain;touch-action:none}
.item.play .mwrap{cursor:grab}
.item.play .mwrap:active{cursor:grabbing}
.mdl figcaption:empty::before{content:"model"}
.mph{position:absolute;inset:0;display:grid;place-items:center;text-align:center;padding:calc(var(--scale)*6px);border:1px dashed var(--line);font-family:var(--mono);font-size:calc(var(--scale)*10px);letter-spacing:.06em;color:var(--soft)}
.mdl:not(.win) .wbar{display:none}
.mdl.win{
  --wf:color-mix(in srgb,var(--paper) 86%,var(--ink));          /* window face */
  --wl:color-mix(in srgb,var(--wf) 38%,#fff);                   /* lit edge */
  --wd:color-mix(in srgb,var(--wf) 52%,#000);                   /* shaded edge */
  --wk:color-mix(in srgb,var(--wf) 16%,#000);                   /* outline */
  --wb:max(1px,calc(var(--scale)*1.4px));                       /* bevel, never sub-pixel */
  --wt:color-mix(in srgb,var(--soft) 55%,var(--desk));          /* title bar, unfocused */
  background:var(--wf);padding:calc(var(--scale)*4px);
  box-shadow:inset var(--wb) var(--wb) 0 var(--wl),
             inset calc(var(--wb)*-1) calc(var(--wb)*-1) 0 var(--wk),
             inset calc(var(--wb)*2) calc(var(--wb)*2) 0 var(--wf),
             inset calc(var(--wb)*-2) calc(var(--wb)*-2) 0 var(--wd),
             calc(var(--scale)*4px) calc(var(--scale)*5px) 0 rgba(0,0,0,.24)}
.mdl.win .wbar{display:flex;align-items:center;gap:calc(var(--scale)*5px);user-select:none;
  padding:calc(var(--scale)*3px) calc(var(--scale)*3px) calc(var(--scale)*3px) calc(var(--scale)*6px);
  background:var(--wt);color:#f3f0ea;                           /* title text is always light */
  font-family:var(--mono);font-size:calc(var(--scale)*9.5px);letter-spacing:.12em;text-transform:uppercase}
.item.sel .mdl.win .wbar{background:linear-gradient(90deg,var(--accent2) 0%,color-mix(in srgb,var(--accent2) 26%,var(--wf)) 100%)}
.item.play .mdl.win .wbar{background:linear-gradient(90deg,var(--accent) 0%,color-mix(in srgb,var(--accent) 26%,var(--wf)) 100%)}
/* the name keeps its width; the stats give theirs up first on a narrow window */
.mdl.win .wnm{flex:0 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.mdl.win .wmeta{flex:1 1 0;min-width:0;text-align:right;opacity:.72;white-space:nowrap;overflow:hidden;text-overflow:clip;font-size:calc(var(--scale)*8.5px)}
.mdl.win .wbtns{display:flex;gap:calc(var(--scale)*2px);flex:none}
.mdl.win .wbtns i{display:grid;place-items:center;font-style:normal;color:var(--ink);
  width:calc(var(--scale)*14px);height:calc(var(--scale)*12px);
  font-size:calc(var(--scale)*8px);line-height:1;background:var(--wf);
  box-shadow:inset var(--wb) var(--wb) 0 var(--wl),inset calc(var(--wb)*-1) calc(var(--wb)*-1) 0 var(--wd)}
.mdl.win .wpane{margin-top:calc(var(--scale)*4px);padding:var(--wb);
  background:linear-gradient(180deg,color-mix(in srgb,var(--paper) 93%,var(--ink)),color-mix(in srgb,var(--paper) 76%,var(--ink)));
  box-shadow:inset var(--wb) var(--wb) 0 var(--wd),inset calc(var(--wb)*-1) calc(var(--wb)*-1) 0 var(--wl)}
.mdl.win figcaption{margin-top:calc(var(--scale)*4px);padding:calc(var(--scale)*3px) calc(var(--scale)*6px);
  background:var(--wf);color:var(--ink);opacity:.85;letter-spacing:.02em;
  box-shadow:inset var(--wb) var(--wb) 0 var(--wd),inset calc(var(--wb)*-1) calc(var(--wb)*-1) 0 var(--wl)}
`);
/* its tile in the palette */
defineTool({ kind:'model', cat:'media', label:'3D model', icon:'model', order:30,
  hint:'A .obj out of Blender — pick its .mtl and textures too, if you have them' });
