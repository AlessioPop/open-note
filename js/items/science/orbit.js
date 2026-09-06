/* Open Note — items/science/orbit.js
   a static, directly manipulated two-body orbit for the page */

/* ================= a binary orbit =================
   The record stores physical quantities, not screen coordinates. `a` is the
   relative semi-major axis in AU, masses are in solar masses and `mean` is the
   mean anomaly in degrees. That last choice matters: equal steps on the scrubber
   are equal steps in time, so the unevenly spaced dots are Kepler's second law
   rather than decoration. A future play button only has to advance `mean`.

   The drawing is normalised to the card. Sizes of the bodies are illustrative;
   paths, barycentre, separation, period and speeds are calculated from the
   stored model. */

const ORB_W = 460, ORB_H = 276, ORB_CX = 230, ORB_CY = 137, ORB_A = 158;

const ORB_TEXTURES = [
  { v:'sun',     label:'Gold star',   hint:'A warm main-sequence star' },
  { v:'red',     label:'Red star',    hint:'A cool red star' },
  { v:'blue',    label:'Blue star',   hint:'A hot blue-white star' },
  { v:'white',   label:'White dwarf', hint:'A hot, compact stellar remnant' },
  { v:'earth',   label:'Ocean world', hint:'A terrestrial world with oceans' },
  { v:'rock',    label:'Rocky world', hint:'A dry terrestrial planet' },
  { v:'gas',     label:'Gas giant',   hint:'A banded giant planet' },
  { v:'moon',    label:'Moon',        hint:'An airless cratered body' },
  { v:'black',   label:'Black hole',  hint:'A dark compact object with an accretion ring' },
  { v:'pulsar',  label:'Neutron star',hint:'A compact, rapidly rotating neutron star' }
];
const ORB_LOOKS = [
  { v:'notebook', label:'Notebook',  hint:'Quiet lines that inherit the note’s ink and accents', bg:'#f1eee6', fg:'#273136' },
  { v:'colour',   label:'Colour',    hint:'A blue and amber pair of orbital paths', bg:'#e9f0f2', fg:'#376f80' },
  { v:'draft',    label:'Draft',     hint:'Fine dashed construction lines', bg:'#eceae3', fg:'#626a6a' },
  { v:'mono',     label:'Graphite',  hint:'A restrained monochrome diagram for notes and print', bg:'#e9e8e3', fg:'#252728' }
];
const ORB_PRESETS = [
  { v:'equal', label:'Equal stars', hint:'A clean 1 + 1 solar-mass example',
    m1:1, m2:1, a:1, e:.35, tex1:'sun', tex2:'red' },
  { v:'sunearth', label:'Sun–Earth', hint:'The solar system scaled down to two bodies',
    m1:1, m2:3.003e-6, a:1, e:.0167, tex1:'sun', tex2:'earth' },
  { v:'earthmoon', label:'Earth–Moon', hint:'The Earth and Moon around their shared barycentre',
    m1:3.003e-6, m2:3.694e-8, a:.00257, e:.0549, tex1:'earth', tex2:'moon' },
  { v:'sirius', label:'Sirius A/B', hint:'The eccentric orbit of Sirius A and its white dwarf companion',
    m1:2.063, m2:1.018, a:20, e:.592, tex1:'blue', tex2:'white' },
  { v:'blackpair', label:'Black-hole pair', hint:'A compact, nearly circular illustrative binary',
    m1:30, m2:25, a:.2, e:.1, tex1:'black', tex2:'black' }
];

/* Mean anomalies and orbital elements are a compact J2000 classroom model.
   Planet sizes are physical Earth radii, but deliberately drawn on a separate
   visual scale: a literally scaled Earth would disappear beside the Sun. */
const ORB_SOLAR = [
  { id:'mercury', name:'Mercury', symbol:'☿', a:.3871, e:.2056, period:87.969,   mass:.0553, radius:.383, m0:174.796, peri:77.46,  tex:'mercury' },
  { id:'venus',   name:'Venus',   symbol:'♀', a:.7233, e:.0068, period:224.701,  mass:.815,  radius:.949, m0:50.115,  peri:131.60, tex:'venus' },
  { id:'earth',   name:'Earth',   symbol:'⊕', a:1,     e:.0167, period:365.256,  mass:1,     radius:1,    m0:357.517, peri:102.95, tex:'earth' },
  { id:'mars',    name:'Mars',    symbol:'♂', a:1.5237,e:.0934, period:686.980,  mass:.1074, radius:.532, m0:19.373,  peri:336.04, tex:'mars' },
  { id:'jupiter', name:'Jupiter', symbol:'♃', a:5.2026,e:.0485, period:4332.59,  mass:317.8, radius:11.21,m0:20.020,  peri:14.75,  tex:'jupiter' },
  { id:'saturn',  name:'Saturn',  symbol:'♄', a:9.5549,e:.0555, period:10759.22, mass:95.16, radius:9.45, m0:317.020, peri:92.43,  tex:'saturn' },
  { id:'uranus',  name:'Uranus',  symbol:'⛢', a:19.218,e:.0463, period:30688.5,  mass:14.54, radius:4.01, m0:142.238, peri:170.96, tex:'uranus' },
  { id:'neptune', name:'Neptune', symbol:'♆', a:30.11, e:.009,  period:60182,    mass:17.15, radius:3.88, m0:256.228, peri:44.97,  tex:'neptune' }
];
const ORB_SOLAR_SPAN = 60182;
const ORB_SOLAR_VIEWS = [
  { v:'overview', label:'All planets', hint:'Square-root distance keeps the entire system legible' },
  { v:'inner', label:'Inner system', hint:'A linear-distance view of Mercury through Mars' }
];

const orbClamp = (v, lo, hi, d) => Number.isFinite(+v) ? clamp(+v, lo, hi) : d;
const orbTexture = v => ORB_TEXTURES.some(x => x.v === v) ? v : 'sun';
const orbLook = v => ORB_LOOKS.some(x => x.v === v) ? v : 'notebook';
const orbVector = v => ['none','velocity','force','both'].includes(v) ? v : 'velocity';
const orbRound = (v, n) => Math.round(v * Math.pow(10, n)) / Math.pow(10, n);
const orbMod = v => ((v % 360) + 360) % 360;

/* Small, seeded RGB maps keep the planets convincing when the note is printed
   or exported, without bringing a texture library (or a network request) into
   the page. Noise is sampled on a sphere embedded in 3D, so there is no UV seam
   or pinching at the poles. Elevation, humidity and clouds use independent fBm
   fields; moons and rocky worlds add a seeded spherical crater field. */
const ORB_PLANET_TEXTURES = new Set(['earth','rock','gas','moon']);
const ORB_SOLAR_TEXTURES = new Set(['mercury','venus','mars','jupiter','saturn','uranus','neptune']);
const ORB_MAP_SIZE = 96, ORB_MAP_CACHE = new Map();

function orbHash(value){
  const s = String(value == null ? '' : value);
  let h = 2166136261;
  for(let i = 0; i < s.length; i++){
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) || 1;
}
function orbSeed(value, fallback){
  return Number.isFinite(+value) ? (+value >>> 0) || 1 : orbHash(fallback);
}
function orbResetSeeds(it){
  const key = it.id || 'orbit';
  it.seed1 = orbHash(key + ':primary');
  it.seed2 = orbHash(key + ':secondary');
}
function orbReroll(it, body){
  orbNorm(it);
  const key = body === 1 ? 'seed1' : 'seed2';
  it[key] = orbHash(it[key] + ':next');
  return it[key];
}
function orbNoiseHash(x, y, z, seed){
  let h = (seed ^ Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(z, 1442695041)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 2147483647.5 - 1;
}
function orbFade(t){ return t*t*t*(t*(t*6-15)+10); }
function orbLerp(a, b, t){ return a + (b-a)*t; }
function orbNoise3(x, y, z, seed){
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const u = orbFade(x-xi), v = orbFade(y-yi), w = orbFade(z-zi);
  const a00 = orbLerp(orbNoiseHash(xi,yi,zi,seed), orbNoiseHash(xi+1,yi,zi,seed), u);
  const a10 = orbLerp(orbNoiseHash(xi,yi+1,zi,seed), orbNoiseHash(xi+1,yi+1,zi,seed), u);
  const a01 = orbLerp(orbNoiseHash(xi,yi,zi+1,seed), orbNoiseHash(xi+1,yi,zi+1,seed), u);
  const a11 = orbLerp(orbNoiseHash(xi,yi+1,zi+1,seed), orbNoiseHash(xi+1,yi+1,zi+1,seed), u);
  return orbLerp(orbLerp(a00,a10,v), orbLerp(a01,a11,v), w);
}
function orbFbm3(x, y, z, seed, octaves){
  let sum = 0, amp = .5, norm = 0, freq = 1;
  for(let i = 0; i < octaves; i++){
    sum += orbNoise3(x*freq, y*freq, z*freq, (seed + Math.imul(i, 0x9e3779b9)) >>> 0) * amp;
    norm += amp; freq *= 2.03; amp *= .5;
  }
  return sum / norm;
}
function orbSmooth(lo, hi, value){
  const t = clamp((value-lo)/(hi-lo), 0, 1);
  return t*t*(3-2*t);
}
function orbMixRGB(a, b, t){
  t = clamp(t, 0, 1);
  return [orbLerp(a[0],b[0],t), orbLerp(a[1],b[1],t), orbLerp(a[2],b[2],t)];
}
function orbToneRGB(c, n){ return [clamp(c[0]*n,0,255),clamp(c[1]*n,0,255),clamp(c[2]*n,0,255)]; }
function orbRandom(seed){
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function orbCraters(seed, count){
  const random = orbRandom(seed), out = [];
  for(let i = 0; i < count; i++){
    const y = random()*2-1, a = random()*Math.PI*2, q = Math.sqrt(1-y*y);
    out.push({ x:q*Math.cos(a), y, z:q*Math.sin(a), r:.035 + Math.pow(random(),2)*.14 });
  }
  return out;
}
function orbCraterShade(x, y, z, craters){
  let shade = 0;
  for(const c of craters){
    const d2 = Math.max(0, 2-2*(x*c.x+y*c.y+z*c.z)), q = d2/(c.r*c.r);
    if(q < .72) shade -= (1-q/.72)*.28;
    else if(q < 1.35) shade += (1-Math.abs(q-1)/.35)*.16;
  }
  return clamp(shade, -.4, .3);
}
function orbPlanetRGB(tex, x, y, z, u, v, seed, craters){
  if(tex === 'earth'){
    const elevation = orbFbm3(x*1.18,y*1.18,z*1.18,seed^0x29a,6);
    const humidity = (orbFbm3(x*1.8,y*1.8,z*1.8,seed^0x91f,5)+1)/2;
    const sea = -.04 + ((seed & 255)/255-.5)*.08;
    let color;
    if(elevation <= sea){
      const depth = clamp((sea-elevation)/.5, 0, 1);
      color = orbMixRGB([48,142,181],[12,43,91],depth);
    }else{
      const altitude = clamp((elevation-sea)/.62, 0, 1);
      const warmth = clamp(1-Math.abs(y)*1.12-altitude*.35,0,1);
      const dry = orbMixRGB([126,117,91],[191,148,80],warmth);
      const lush = orbMixRGB([75,102,79],[45,116,65],warmth);
      color = orbMixRGB(dry,lush,orbSmooth(.28,.72,humidity));
      color = orbMixRGB(color,[126,120,111],orbSmooth(.42,.82,altitude));
      const snow = Math.max(orbSmooth(.72,.94,altitude),orbSmooth(.7,.96,Math.abs(y)+altitude*.14));
      color = orbMixRGB(color,[232,237,224],snow);
      color = orbMixRGB([208,183,125],color,orbSmooth(.015,.08,altitude));
    }
    const cloudNoise = (orbFbm3(x*2.65,y*1.25,z*2.65,seed^0x71c,5)+1)/2;
    const clouds = orbSmooth(.58,.73,cloudNoise) * .62;
    return orbMixRGB(color,[242,246,239],clouds);
  }
  if(tex === 'venus'){
    const swirl = (orbFbm3(x*2.2+y*.35,y*.72,z*2.2,seed^0x19e,6)+1)/2;
    const soft = (orbFbm3(x*.8,y*.8,z*.8,seed^0x6b4,4)+1)/2;
    let color = orbMixRGB([174,121,58],[250,224,156],orbSmooth(.18,.86,swirl));
    color = orbMixRGB(color,[239,190,103],soft*.28);
    return color;
  }
  if(tex === 'gas' || tex === 'jupiter' || tex === 'saturn'){
    const warp = orbFbm3(x*2.1,y*.85,z*2.1,seed^0x37b,4)*.075;
    const broad = .5+.5*Math.sin((y+warp)*38 + (seed%31));
    const fine = .5+.5*Math.sin((y+warp*.45)*91 + (seed%17));
    const dark = tex === 'saturn' ? [169,144,103] : [127,72,64];
    const light = tex === 'saturn' ? [240,220,170] : [235,210,160];
    let color = orbMixRGB(dark,light,orbSmooth(.12,.88,broad));
    color = orbMixRGB(color,tex === 'saturn'?[248,235,201]:[244,228,190],fine*.22);
    const sx = (u-.34)/.25, sy = (v-.24)/.105, storm = 1-(sx*sx+sy*sy);
    if(tex !== 'saturn' && storm > 0) color = orbMixRGB(color,[151,65,52],orbSmooth(0,1,storm)*.72);
    return color;
  }
  if(tex === 'uranus' || tex === 'neptune'){
    const bands = .5+.5*Math.sin((y+orbFbm3(x*1.3,y*.8,z*1.3,seed^0x821,4)*.035)*54);
    const deep = tex === 'neptune';
    let color = orbMixRGB(deep?[26,70,174]:[113,185,191],deep?[72,135,229]:[187,226,220],bands*.46);
    const sx = (u+.28)/.19, sy = (v+.18)/.1, storm = 1-(sx*sx+sy*sy);
    if(deep && storm > 0) color = orbMixRGB(color,[22,39,87],orbSmooth(0,1,storm)*.62);
    return color;
  }
  const elevation = (orbFbm3(x*1.7,y*1.7,z*1.7,seed^0x4d3,6)+1)/2;
  const crater = orbCraterShade(x,y,z,craters);
  if(tex === 'moon' || tex === 'mercury'){
    const maria = orbSmooth(.58,.8,(orbFbm3(x*.82,y*.82,z*.82,seed^0x83a,4)+1)/2);
    let color = tex === 'mercury'
      ? orbMixRGB([177,163,143],[92,92,88],maria*.62)
      : orbMixRGB([191,190,183],[111,116,119],maria*.66);
    color = orbToneRGB(color,.82+elevation*.34+crater);
    return color;
  }
  const oxide = (orbFbm3(x*2.4,y*2.4,z*2.4,seed^0xb27,4)+1)/2;
  let color = tex === 'mars'
    ? orbMixRGB([91,45,38],[218,116,62],oxide)
    : orbMixRGB([94,63,59],[198,137,88],oxide);
  color = orbMixRGB(color,[219,180,125],orbSmooth(.64,.88,elevation)*.45);
  if(tex === 'mars') color = orbMixRGB(color,[234,225,199],orbSmooth(.74,.94,Math.abs(y))*.8);
  return orbToneRGB(color,.82+elevation*.3+crater);
}
function orbPlanetMap(tex, seed, size){
  if((!ORB_PLANET_TEXTURES.has(tex) && !ORB_SOLAR_TEXTURES.has(tex)) || typeof document === 'undefined') return '';
  size = Math.max(32, Math.round(size || ORB_MAP_SIZE));
  seed = orbSeed(seed, tex);
  const key = tex+':'+seed+':'+size;
  if(ORB_MAP_CACHE.has(key)) return ORB_MAP_CACHE.get(key);
  const canvas = document.createElement('canvas'); canvas.width = size; canvas.height = size;
  const ctx = canvas.getContext('2d');
  if(!ctx) return '';
  const image = ctx.createImageData(size,size), data = image.data;
  const angle = (seed%360)*Math.PI/180, ca = Math.cos(angle), sa = Math.sin(angle);
  const craters = tex === 'moon' ? orbCraters(seed^0x51f,28) : tex === 'mercury' ? orbCraters(seed^0x51f,34) :
    (tex === 'rock' || tex === 'mars') ? orbCraters(seed^0xa97,15) : [];
  for(let py = 0; py < size; py++) for(let px = 0; px < size; px++){
    const u = (px+.5)/size*2-1, v = (py+.5)/size*2-1, rr = u*u+v*v;
    if(rr >= 1) continue;
    const front = Math.sqrt(1-rr), x = u*ca+front*sa, y = -v, z = -u*sa+front*ca;
    const color = orbPlanetRGB(tex,x,y,z,u,v,seed,craters), i = (py*size+px)*4;
    data[i] = Math.round(color[0]); data[i+1] = Math.round(color[1]); data[i+2] = Math.round(color[2]);
    data[i+3] = Math.round(255*clamp((1-Math.sqrt(rr))*size*.72,0,1));
  }
  ctx.putImageData(image,0,0);
  const url = canvas.toDataURL('image/png');
  if(ORB_MAP_CACHE.size >= 128) ORB_MAP_CACHE.delete(ORB_MAP_CACHE.keys().next().value);
  ORB_MAP_CACHE.set(key,url);
  return url;
}

function orbNorm(it){
  it.mode = it.mode === 'solar' ? 'solar' : 'binary';
  it.m1 = orbClamp(it.m1, 1e-12, 100, 1.1);
  it.m2 = orbClamp(it.m2, 1e-12, 100, .8);
  it.a = orbClamp(it.a, .0001, 1000, 1.4);
  it.e = orbClamp(it.e, 0, .92, .42);
  it.inc = orbClamp(it.inc, 0, 80, 28);
  it.arg = orbMod(Number.isFinite(+it.arg) ? +it.arg : 342);
  it.mean = orbMod(Number.isFinite(+it.mean) ? +it.mean : 62);
  it.look = orbLook(it.look);
  it.tex1 = orbTexture(it.tex1 || 'sun');
  it.tex2 = orbTexture(it.tex2 || 'red');
  it.seed1 = orbSeed(it.seed1, (it.id || 'orbit') + ':primary');
  it.seed2 = orbSeed(it.seed2, (it.id || 'orbit') + ':secondary');
  it.seedSolar = orbSeed(it.seedSolar, (it.id || 'orbit') + ':solar-system');
  it.solarDay = orbClamp(it.solarDay, 0, ORB_SOLAR_SPAN, 0);
  it.planet = ORB_SOLAR.some(p => p.id === it.planet) ? it.planet : 'earth';
  it.solarView = ORB_SOLAR_VIEWS.some(v => v.v === it.solarView) ? it.solarView : 'overview';
  if(!['selected','all'].includes(it.solarLabels)) it.solarLabels = 'selected';
  it.vectors = orbVector(it.vectors);
  if(it.area == null) it.area = 1;
  if(it.marks == null) it.marks = 1;
  return it;
}

/* E − e sin E = M, converged well inside a pixel even at the allowed e=.92. */
function orbKepler(mean, e){
  const M = orbMod(mean) * Math.PI / 180;
  let E = e < .8 ? M : Math.PI;
  for(let i = 0; i < 10; i++) E -= (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
  return E;
}
function orbState(it, mean){
  orbNorm(it);
  const M = mean == null ? it.mean : orbMod(mean), E = orbKepler(M, it.e);
  const b = Math.sqrt(1 - it.e * it.e), den = 1 - it.e * Math.cos(E);
  return {
    M, E, b, den,
    x: ORB_A * (Math.cos(E) - it.e),
    y: ORB_A * b * Math.sin(E),
    dx: -ORB_A * Math.sin(E) / den,
    dy: ORB_A * b * Math.cos(E) / den
  };
}
function orbProject(it, x, y){
  const inc = it.inc * Math.PI / 180, a = it.arg * Math.PI / 180;
  y *= Math.cos(inc);
  return { x:x * Math.cos(a) - y * Math.sin(a), y:x * Math.sin(a) + y * Math.cos(a) };
}
function orbScreen(it, x, y){
  const p = orbProject(it, x, y);
  return { x:ORB_CX + p.x, y:ORB_CY - p.y };
}
function orbFactors(it){
  const mt = it.m1 + it.m2;
  return { one:it.m2 / mt, two:it.m1 / mt, mt };
}
function orbBodyPoint(it, body, mean){
  const s = orbState(it, mean), f = orbFactors(it);
  const k = body === 1 ? -f.one : f.two;
  return { ...orbScreen(it, s.x * k, s.y * k), vx:s.dx * k, vy:s.dy * k, state:s, k };
}
function orbPath(it, body){
  let d = '';
  for(let i = 0; i <= 120; i++){
    const p = orbBodyPoint(it, body, i / 120 * 360);
    d += (i ? 'L' : 'M') + orbRound(p.x, 2) + ' ' + orbRound(p.y, 2);
  }
  return d + 'Z';
}
function orbSector(it){
  const f = orbFactors(it), body = f.one > f.two ? 1 : 2;
  let d = 'M' + ORB_CX + ' ' + ORB_CY;
  const steps = Math.max(2, Math.ceil(it.mean / 5));
  for(let i = 0; i <= steps; i++){
    const p = orbBodyPoint(it, body, it.mean * i / steps);
    d += 'L' + orbRound(p.x, 2) + ' ' + orbRound(p.y, 2);
  }
  return d + 'Z';
}
function orbApsis(it, body, mean){ return orbBodyPoint(it, body, mean); }

function orbSig(v, digits){
  if(!Number.isFinite(v)) return '—';
  const a = Math.abs(v);
  if(digits == null && a && (a >= 1e5 || a < .001)) return v.toExponential(2);
  const n = digits == null ? (a >= 100 ? 0 : a >= 10 ? 1 : 2) : digits;
  return v.toLocaleString(undefined, { maximumFractionDigits:n, minimumFractionDigits:0 });
}
function orbMassText(m){
  if(m >= .08) return orbSig(m) + ' M☉';
  if(m >= .0002) return orbSig(m * 1047.56) + ' M♃';
  return orbSig(m * 332946) + ' M⊕';
}
function orbDistance(au){
  if(au >= .1) return orbSig(au) + ' AU';
  const km = au * 149597870.7;
  return km >= 1e6 ? orbSig(km / 1e6) + 'm km' : orbSig(km, km < 1000 ? 1 : 0) + ' km';
}
function orbPeriod(years){
  const days = years * 365.25;
  if(days >= 730) return orbSig(years) + ' yr';
  if(days >= 2) return orbSig(days) + ' d';
  const hours = days * 24;
  if(hours >= 2) return orbSig(hours) + ' h';
  return orbSig(hours * 60) + ' min';
}
function orbSpeed(v){ return v >= 1 ? orbSig(v) + ' km/s' : orbSig(v * 1000) + ' m/s'; }
function orbFacts(it){
  const s = orbState(it), f = orbFactors(it);
  const r = it.a * s.den;
  return {
    period:Math.sqrt(Math.pow(it.a, 3) / f.mt),
    r,
    speed:29.7847 * Math.sqrt(f.mt * (2 / r - 1 / it.a)),
    a1:it.a * f.one,
    a2:it.a * f.two,
    q:it.m2 / it.m1,
    time:it.mean / 360
  };
}

function orbId(it){ return 'orb' + String(it.id || 'x').replace(/[^a-zA-Z0-9_-]/g, ''); }
function orbDefs(it){
  const p = orbId(it);
  return '<defs>' +
    '<radialGradient id="'+p+'sun" cx="35%" cy="30%"><stop stop-color="#fff8c7"/><stop offset=".42" stop-color="#ffd86a"/><stop offset="1" stop-color="#e78d19"/></radialGradient>' +
    '<radialGradient id="'+p+'red" cx="35%" cy="30%"><stop stop-color="#ffe0bc"/><stop offset=".42" stop-color="#ff8b5b"/><stop offset="1" stop-color="#a92f36"/></radialGradient>' +
    '<radialGradient id="'+p+'blue" cx="35%" cy="30%"><stop stop-color="#fff"/><stop offset=".38" stop-color="#bce9ff"/><stop offset="1" stop-color="#4a7dde"/></radialGradient>' +
    '<radialGradient id="'+p+'white" cx="35%" cy="30%"><stop stop-color="#fff"/><stop offset=".48" stop-color="#eefaff"/><stop offset="1" stop-color="#91b8d2"/></radialGradient>' +
    '<radialGradient id="'+p+'earth" cx="35%" cy="30%"><stop stop-color="#7de1ff"/><stop offset=".65" stop-color="#287ac4"/><stop offset="1" stop-color="#153f79"/></radialGradient>' +
    '<radialGradient id="'+p+'rock" cx="35%" cy="30%"><stop stop-color="#e0b68d"/><stop offset=".65" stop-color="#a5684b"/><stop offset="1" stop-color="#68413d"/></radialGradient>' +
    '<radialGradient id="'+p+'moon" cx="35%" cy="30%"><stop stop-color="#f2f0e8"/><stop offset=".68" stop-color="#aaa9a6"/><stop offset="1" stop-color="#66676c"/></radialGradient>' +
    '<linearGradient id="'+p+'gas" x2="0" y2="1"><stop stop-color="#ead6ae"/><stop offset=".28" stop-color="#b46d55"/><stop offset=".42" stop-color="#f3dfb4"/><stop offset=".65" stop-color="#9d5c53"/><stop offset=".82" stop-color="#e8c68e"/><stop offset="1" stop-color="#80504d"/></linearGradient>' +
    '<radialGradient id="'+p+'planetshade" cx="30%" cy="25%" r="76%"><stop stop-color="#fff" stop-opacity=".25"/><stop offset=".46" stop-color="#fff" stop-opacity="0"/><stop offset=".76" stop-color="#071321" stop-opacity=".12"/><stop offset="1" stop-color="#02060a" stop-opacity=".66"/></radialGradient>' +
    '<linearGradient id="'+p+'disk"><stop stop-color="#ff6a52" stop-opacity="0"/><stop offset=".35" stop-color="#ff8a55"/><stop offset=".55" stop-color="#fff4b0"/><stop offset=".72" stop-color="#65baff"/><stop offset="1" stop-color="#65baff" stop-opacity="0"/></linearGradient>' +
    '<radialGradient id="'+p+'pulse"><stop stop-color="#fff"/><stop offset=".35" stop-color="#bff6ff"/><stop offset="1" stop-color="#5884ff"/></radialGradient>' +
    '<filter id="'+p+'glow" x="-100%" y="-100%" width="300%" height="300%"><feGaussianBlur stdDeviation="3" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>' +
    '<marker id="'+p+'arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0 0 8 4 0 8Z"/></marker>' +
    '</defs>';
}
function orbRadius(tex, mass, main){
  if(tex === 'sun' || tex === 'red' || tex === 'blue') return clamp(14 + Math.log10(Math.max(mass, .08)) * 2, 11, 18);
  if(tex === 'white') return 9;
  if(tex === 'gas') return main ? 14 : 13;
  if(tex === 'black') return 12;
  if(tex === 'pulsar') return 9;
  return main ? 11.5 : 10.5;
}
function orbBodySVG(it, body, pnt){
  const tex = body === 1 ? it.tex1 : it.tex2, mass = body === 1 ? it.m1 : it.m2;
  const r = orbRadius(tex, mass, body === 1), id = orbId(it), label = ORB_TEXTURES.find(x => x.v === tex).label;
  let art = '';
  if(tex === 'sun' || tex === 'red' || tex === 'blue' || tex === 'white'){
    art = '<circle class="orbhalo" r="'+orbRound(r + 5, 1)+'"/><circle r="'+r+'" fill="url(#'+id+tex+')"/>' +
      '<path class="orbsurface" d="M-'+(r*.72)+' -'+(r*.2)+'Q0 -'+(r*.55)+' '+(r*.72)+' -'+(r*.18)+'M-'+(r*.62)+' '+(r*.35)+'Q0 '+(r*.04)+' '+(r*.67)+' '+(r*.35)+'"/>';
  }else if(ORB_PLANET_TEXTURES.has(tex)){
    const seed = body === 1 ? it.seed1 : it.seed2, map = orbPlanetMap(tex,seed);
    art = '<circle r="'+r+'" fill="url(#'+id+tex+')"/>' +
      (map ? '<image class="orbmap" x="-'+r+'" y="-'+r+'" width="'+(r*2)+'" height="'+(r*2)+'" href="'+map+'" aria-hidden="true"/>' : '') +
      '<circle class="orbshade" r="'+r+'" fill="url(#'+id+'planetshade)"/>' +
      (tex === 'earth' ? '<circle class="orbatmos" r="'+(r+.35)+'"/>' : '');
  }else if(tex === 'black'){
    art = '<ellipse class="orbdisk" rx="'+(r*1.8)+'" ry="'+(r*.42)+'" fill="url(#'+id+'disk)"/><circle class="orbhole" r="'+(r*.76)+'"/><circle class="orblens" r="'+(r*.92)+'"/>';
  }else{
    art = '<path class="orbbeam" d="M0 -'+(r*2.6)+'V'+(r*2.6)+'"/><circle class="orbhalo" r="'+(r+5)+'"/><circle r="'+r+'" fill="url(#'+id+'pulse)"/><path class="orbspin" d="M-'+(r*.85)+' 0Q0 '+(r*.45)+' '+(r*.85)+' 0Q0 -'+(r*.45)+' -'+(r*.85)+' 0Z"/>';
  }
  return '<g class="orbobject tex-'+tex+'" data-body="'+body+'" transform="translate('+orbRound(pnt.x,2)+' '+orbRound(pnt.y,2)+')" role="img" aria-label="'+(body === 1 ? 'Primary' : 'Secondary')+': '+label+'">' +
    '<circle class="orbhit" r="'+Math.max(24, r + 8)+'"/>'+art+'</g>';
}
function orbArrow(it, p, vx, vy, cls){
  const q = orbProject(it, vx, vy), n = Math.hypot(q.x, q.y) || 1, len = 29;
  return '<path class="orbarrow '+cls+'" d="M'+orbRound(p.x,1)+' '+orbRound(p.y,1)+'l'+orbRound(q.x/n*len,1)+' '+orbRound(-q.y/n*len,1)+'" marker-end="url(#'+orbId(it)+'arrow)"/>';
}

function orbSolarPlanet(it){ return ORB_SOLAR.find(p => p.id === it.planet) || ORB_SOLAR[2]; }
function orbSolarRadius(it, au){
  return it.solarView === 'inner' ? au / 1.72 * 183 : Math.sqrt(au / 30.5) * 183;
}
function orbSolarVisible(it, planet){ return it.solarView !== 'inner' || planet.a < 2; }
function orbSolarPoint(it, planet, day, meanOverride){
  const mean = meanOverride == null ? orbMod(planet.m0 + (day == null ? it.solarDay : day) / planet.period * 360) : orbMod(meanOverride);
  const E = orbKepler(mean, planet.e), b = Math.sqrt(1-planet.e*planet.e);
  let x = planet.a*(Math.cos(E)-planet.e), y = planet.a*b*Math.sin(E);
  const peri = planet.peri*Math.PI/180, xr = x*Math.cos(peri)-y*Math.sin(peri), yr = x*Math.sin(peri)+y*Math.cos(peri);
  const distance = Math.hypot(xr,yr), radius = orbSolarRadius(it,distance), n = distance || 1;
  const projected = orbProject(it,xr/n*radius,yr/n*radius);
  return { x:ORB_CX+projected.x, y:ORB_CY-projected.y, r:distance, mean, E };
}
function orbSolarPath(it, planet){
  let d = '';
  for(let i=0;i<=180;i++){
    const p = orbSolarPoint(it,planet,0,i/180*360);
    d += (i?'L':'M')+orbRound(p.x,2)+' '+orbRound(p.y,2);
  }
  return d+'Z';
}
function orbSolarBodyRadius(planet){ return clamp(3.1+Math.log2(planet.radius+1)*1.4,3.4,8.8); }
function orbSolarBodySVG(it, planet, point){
  const r = orbSolarBodyRadius(planet), selected = planet.id === it.planet, id = orbId(it);
  const map = orbPlanetMap(planet.tex,orbHash(it.seedSolar+':'+planet.id));
  const ring = planet.id === 'saturn'
    ? '<ellipse class="solarring" rx="'+orbRound(r*1.85,1)+'" ry="'+orbRound(r*.55,1)+'" transform="rotate(-18)"/>' : '';
  const label = it.solarLabels === 'all' || selected
    ? '<text class="solarlab" y="'+orbRound(-r-6,1)+'">'+planet.name+'</text>' : '';
  return '<g class="solarplanet'+(selected?' selected':'')+'" data-planet="'+planet.id+'" transform="translate('+orbRound(point.x,2)+' '+orbRound(point.y,2)+')" role="img" aria-label="'+planet.name+', '+orbDistance(point.r)+' from the Sun">' +
    '<title>'+planet.name+' · '+orbDistance(point.r)+'</title><circle class="solarhit" r="'+Math.max(12,r+6)+'"/>' +
    (selected?'<circle class="solarselect" r="'+orbRound(r+4,1)+'"/>':'')+ring+
    '<circle r="'+r+'" fill="url(#'+id+(planet.id === 'earth'?'earth':'planetshade')+')"/>' +
    (map?'<image class="orbmap" x="-'+r+'" y="-'+r+'" width="'+(r*2)+'" height="'+(r*2)+'" href="'+map+'" aria-hidden="true"/>':'')+
    '<circle class="orbshade" r="'+r+'" fill="url(#'+id+'planetshade)"/>' +
    (planet.id === 'earth'?'<circle class="orbatmos" r="'+(r+.3)+'"/>':'')+label+'</g>';
}
function orbSolarFacts(it){
  const planet = orbSolarPlanet(it), point = orbSolarPoint(it,planet);
  return { planet, point, period:planet.period/365.25, r:point.r,
    speed:29.7847*Math.sqrt(2/point.r-1/planet.a) };
}
function orbSolarScene(it){
  orbNorm(it);
  const visible = ORB_SOLAR.filter(p => orbSolarVisible(it,p));
  let paths = '', bodies = '';
  for(const planet of visible){
    paths += '<path class="solarorbit'+(planet.id===it.planet?' selected':'')+'" data-planet="'+planet.id+'" d="'+orbSolarPath(it,planet)+'"/>';
    bodies += orbSolarBodySVG(it,planet,orbSolarPoint(it,planet));
  }
  let belt = '';
  if(it.solarView === 'overview'){
    const asteroid = { a:2.77,e:.04,period:1686,m0:0,peri:80 };
    belt = '<path class="solarbelt" d="'+orbSolarPath(it,asteroid)+'"/><text class="solarbeltlabel" x="'+(ORB_CX+orbSolarRadius(it,2.77)-12)+'" y="'+(ORB_CY-6)+'">asteroid belt</text>';
  }
  return orbDefs(it)+paths+belt+
    '<g class="solarsun" transform="translate('+ORB_CX+' '+ORB_CY+')"><circle class="orbhalo" r="20"/><circle r="13.5" fill="url(#'+orbId(it)+'sun)"/><path class="orbsurface" d="M-9 -3Q0 -7 9 -2M-8 5Q0 1 8 5"/></g>'+bodies;
}

function orbBinaryScene(it){
  orbNorm(it);
  const one = orbBodyPoint(it, 1), two = orbBodyPoint(it, 2), f = orbFactors(it);
  const large = f.one > f.two ? 1 : 2, peri = orbApsis(it, large, 0), apo = orbApsis(it, large, 180);
  let marks = '';
  if(it.marks) for(let m = 0; m < 360; m += 30){
    const p = orbBodyPoint(it, large, m);
    marks += '<circle class="orbtick" cx="'+orbRound(p.x,2)+'" cy="'+orbRound(p.y,2)+'" r="2"/>' +
      '<circle class="orbtickhit" data-mean="'+m+'" cx="'+orbRound(p.x,2)+'" cy="'+orbRound(p.y,2)+'" r="9"/>';
  }
  let vectors = '';
  if(it.vectors === 'velocity' || it.vectors === 'both'){
    vectors += orbArrow(it, one, one.vx, one.vy, 'velocity') + orbArrow(it, two, two.vx, two.vy, 'velocity');
  }
  if(it.vectors === 'force' || it.vectors === 'both'){
    const s = orbState(it);
    vectors += orbArrow(it, one, s.x, s.y, 'force') + orbArrow(it, two, -s.x, -s.y, 'force');
  }
  const nudge1 = one.x < ORB_CX ? -1 : 1, nudge2 = two.x < ORB_CX ? -1 : 1;
  return orbDefs(it) +
    (it.area ? '<path class="orbsector" d="'+orbSector(it)+'"/>' : '') +
    '<path class="orbpath one" d="'+orbPath(it,1)+'"/><path class="orbpath two" d="'+orbPath(it,2)+'"/>' + marks +
    '<path class="orbaxis" d="M'+orbRound(peri.x,1)+' '+orbRound(peri.y,1)+'L'+orbRound(apo.x,1)+' '+orbRound(apo.y,1)+'"/>' +
    '<path class="orbjoin" d="M'+orbRound(one.x,1)+' '+orbRound(one.y,1)+'L'+orbRound(two.x,1)+' '+orbRound(two.y,1)+'"/>' +
    '<g class="orbbary" transform="translate('+ORB_CX+' '+ORB_CY+')"><circle r="4"/><path d="M-8 0H8M0-8V8"/></g>' +
    '<text class="orbbarylabel" x="'+(ORB_CX+9)+'" y="'+(ORB_CY-9)+'">barycentre</text>' +
    '<text class="orbapsis" x="'+orbRound(peri.x,1)+'" y="'+orbRound(peri.y-9,1)+'">periapsis</text>' +
    vectors + orbBodySVG(it,1,one) + orbBodySVG(it,2,two) +
    '<g class="orblabel" transform="translate('+orbRound(one.x+nudge1*22,1)+' '+orbRound(one.y-18,1)+')"><text text-anchor="'+(nudge1<0?'end':'start')+'">M₁</text></g>' +
    '<g class="orblabel" transform="translate('+orbRound(two.x+nudge2*19,1)+' '+orbRound(two.y-15,1)+')"><text text-anchor="'+(nudge2<0?'end':'start')+'">M₂</text></g>';
}
function orbScene(it){ return it.mode === 'solar' ? orbSolarScene(it) : orbBinaryScene(it); }

function orbHTML(it){
  orbNorm(it);
  const solar = it.mode === 'solar';
  const legend = solar ? '<nav class="solarlegend" aria-label="Choose a planet">'+ORB_SOLAR.map(p =>
    '<button type="button" data-planet="'+p.id+'" title="Study '+p.name+'"><span>'+p.symbol+'</span>'+p.name+'</button>').join('')+'</nav>' : '';
  return '<figure class="body orb" data-look="'+it.look+'" data-mode="'+it.mode+'">' +
    '<div class="orbview"><svg class="orbsvg" viewBox="0 0 '+ORB_W+' '+ORB_H+'" role="img" aria-label="'+(solar?'Solar System overview. Choose or drag a planet to study its orbit.':'Static binary orbit. Drag either body to change the time.')+'"></svg>' +
      '<div class="orbhint">'+(solar?'drag a planet · choose below':'drag a body · tap a time mark')+'</div></div>' + legend +
    '<label class="orbphase"><span><i>'+(solar?'years from J2000':'t / T')+'</i><output></output></span>' +
      '<input type="range" min="0" max="'+(solar?ORB_SOLAR_SPAN:360)+'" step="'+(solar?1:.5)+'" aria-label="'+(solar?'Date in days since J2000':'Time since periapsis, as mean anomaly')+'"></label>' +
    '<div class="orbmetrics" aria-live="polite"><span data-k="period"></span><span data-k="separation"></span>' +
      '<span data-k="speed"></span><span data-k="axes"></span></div>' +
    '<div class="orbformula"><span>'+(solar?'P² = a³ · solar masses / years / AU':'P² = a³ / (M₁ + M₂)')+'</span><span class="orbmass"></span></div>' +
    '<figcaption></figcaption></figure>';
}
function orbMetric(el, key, label, value, title){
  const x = el.querySelector('[data-k="'+key+'"]');
  if(x){ x.title = title || label; x.innerHTML = '<small>'+label+'</small><b>'+value+'</b>'; }
}
function orbPaint(el, it){
  if(!el) return;
  orbNorm(it);
  const fig = el.querySelector('.orb'), svg = el.querySelector('.orbsvg');
  if(!fig || !svg) return;
  fig.dataset.look = it.look;
  fig.dataset.mode = it.mode;
  svg.innerHTML = orbScene(it);
  const input = fig.querySelector('.orbphase input'), out = fig.querySelector('.orbphase output');
  if(it.mode === 'solar'){
    const facts = orbSolarFacts(it), year = it.solarDay/365.25;
    if(input && document.activeElement !== input) input.value = it.solarDay;
    if(out) out.textContent = year.toFixed(1)+' yr · '+(2000+year).toFixed(1);
    orbMetric(fig,'period','year',orbPeriod(facts.period),'Sidereal orbital period');
    orbMetric(fig,'separation','r',orbDistance(facts.r),'Current distance from the Sun');
    orbMetric(fig,'speed','v',orbSpeed(facts.speed),'Current heliocentric orbital speed');
    orbMetric(fig,'axes','mass',orbSig(facts.planet.mass)+' M⊕','Planet mass in Earth masses');
    const detail = fig.querySelector('.orbmass');
    if(detail) detail.textContent = facts.planet.name+' · a '+orbDistance(facts.planet.a)+' · e '+orbSig(facts.planet.e,3)+' · R '+orbSig(facts.planet.radius)+' R⊕';
    fig.querySelectorAll('.solarlegend button').forEach(b => {
      const on = b.dataset.planet === facts.planet.id;
      b.classList.toggle('on',on); b.setAttribute('aria-pressed',on?'true':'false');
    });
    svg.setAttribute('aria-label','Solar System at '+year.toFixed(1)+' years after J2000. Studying '+facts.planet.name+', '+orbDistance(facts.r)+' from the Sun.');
    return;
  }
  const facts = orbFacts(it);
  if(input && document.activeElement !== input) input.value = it.mean;
  if(out) out.textContent = Math.round(facts.time * 100) + '% · M ' + Math.round(it.mean) + '°';
  orbMetric(fig, 'period', 'P', orbPeriod(facts.period), 'Orbital period');
  orbMetric(fig, 'separation', 'r', orbDistance(facts.r), 'Separation now');
  orbMetric(fig, 'speed', 'vᵣₑₗ', orbSpeed(facts.speed), 'Relative orbital speed');
  orbMetric(fig, 'axes', 'a₁ / a₂', orbDistance(facts.a1) + ' / ' + orbDistance(facts.a2), 'Barycentric semi-major axes');
  const mass = fig.querySelector('.orbmass');
  if(mass) mass.textContent = orbMassText(it.m1) + ' + ' + orbMassText(it.m2) + ' · e ' + orbSig(it.e);
  svg.setAttribute('aria-label', 'Static binary orbit. Period '+orbPeriod(facts.period)+', separation '+orbDistance(facts.r)+'. Drag either body to change the time.');
}

function orbPreset(it, id){
  const p = ORB_PRESETS.find(x => x.v === id);
  if(!p) return;
  ['m1','m2','a','e','tex1','tex2'].forEach(k => { it[k] = p[k]; });
  it.mean = 62;
}
function orbPresetOf(it){
  const hit = ORB_PRESETS.find(p => Math.abs(p.m1-it.m1) < Math.max(1e-9,p.m1*1e-5) &&
    Math.abs(p.m2-it.m2) < Math.max(1e-9,p.m2*1e-5) && Math.abs(p.a-it.a) < Math.max(1e-9,p.a*1e-5) &&
    Math.abs(p.e-it.e) < 1e-5 && p.tex1 === it.tex1 && p.tex2 === it.tex2);
  return hit ? hit.v : 'custom';
}
function orbPhysics(anchor, it, el, page){
  openProps(anchor, { title:'Orbital model', rows:[
    { t:'pick', label:'Preset', opts:ORB_PRESETS.map(p => ({ v:p.v, label:p.label, hint:p.hint })).concat([{v:'custom',label:'Custom',hint:'The values currently shown'}]),
      get:() => orbPresetOf(it), pick:v => { if(v !== 'custom') orbPreset(it,v); } },
    { t:'range', label:'Semi-major axis', min:-4, max:3, step:.02, get:() => Math.log10(it.a), set:v => { it.a=Math.pow(10,v); }, fmt:() => orbDistance(it.a) },
    { t:'range', label:'Primary mass', min:-12, max:2, step:.03, get:() => Math.log10(it.m1), set:v => { it.m1=Math.pow(10,v); }, fmt:() => orbMassText(it.m1) },
    { t:'range', label:'Secondary mass', min:-12, max:2, step:.03, get:() => Math.log10(it.m2), set:v => { it.m2=Math.pow(10,v); }, fmt:() => orbMassText(it.m2) },
    { t:'range', label:'Eccentricity', min:0, max:.92, step:.01, get:() => it.e, set:v => { it.e=v; }, fmt:v => orbSig(v,2) },
    { t:'range', label:'Inclination', min:0, max:80, step:1, get:() => it.inc, set:v => { it.inc=v; }, fmt:v => Math.round(v)+'°' },
    { t:'angle', label:'Orientation', min:0, get:() => it.arg, set:v => { it.arg=v; } }
  ], onchange(){ orbPaint(el,it); }, onsave(){ queueSave(page.id); }, onreset(){
    it.m1=1.1;it.m2=.8;it.a=1.4;it.e=.42;it.inc=28;it.arg=342;it.mean=62;orbPaint(el,it);
  }});
}
function orbAppearance(anchor, it, el, page){
  openProps(anchor, { title:'Orbit appearance', rows:[
    { t:'pick', label:'Style', opts:ORB_LOOKS, get:() => it.look, pick:v => { it.look=orbLook(v); } },
    { t:'pick', label:'Primary', opts:ORB_TEXTURES, get:() => it.tex1, pick:v => { it.tex1=orbTexture(v); } },
    { t:'pick', label:'Secondary', opts:ORB_TEXTURES, get:() => it.tex2, pick:v => { it.tex2=orbTexture(v); } },
    { t:'btn', label:'Primary map', text:'New variation', hint:'Generate another seeded RGB surface for the primary planet or moon',
      act(){ orbReroll(it,1);orbPaint(el,it);queueSave(page.id);SND.tick(); } },
    { t:'btn', label:'Secondary map', text:'New variation', hint:'Generate another seeded RGB surface for the secondary planet or moon',
      act(){ orbReroll(it,2);orbPaint(el,it);queueSave(page.id);SND.tick(); } },
    { t:'pick', label:'Vectors', opts:[{v:'none',label:'None'},{v:'velocity',label:'Velocity'},{v:'force',label:'Force'},{v:'both',label:'Both'}],
      get:() => it.vectors, pick:v => { it.vectors=orbVector(v); } },
    { t:'pick', label:'Time marks', opts:[{v:'1',label:'Shown'},{v:'0',label:'Hidden'}], get:() => it.marks?'1':'0', pick:v => { it.marks=v==='1'?1:0; } },
    { t:'pick', label:'Swept area', opts:[{v:'1',label:'Shown'},{v:'0',label:'Hidden'}], get:() => it.area?'1':'0', pick:v => { it.area=v==='1'?1:0; } }
  ], onchange(){ orbPaint(el,it); }, onsave(){ queueSave(page.id); }, onreset(){
    it.look='notebook';it.tex1='sun';it.tex2='red';it.vectors='velocity';it.marks=1;it.area=1;orbResetSeeds(it);orbPaint(el,it);
  }});
}

function orbSolarModel(anchor,it,el,page){
  openProps(anchor,{title:'Solar System',rows:[
    { t:'pick',label:'Study',opts:ORB_SOLAR.map(p => ({v:p.id,label:p.name,hint:'Focus the readout on '+p.name})),
      get:() => it.planet,pick:v => {it.planet=v;if(!orbSolarVisible(it,orbSolarPlanet(it))) it.solarView='overview';} },
    { t:'range',label:'Years from J2000',min:0,max:165,step:.1,get:() => it.solarDay/365.25,
      set:v => {it.solarDay=v*365.25;},fmt:v => v.toFixed(1)+' yr' },
    { t:'range',label:'View tilt',min:0,max:65,step:1,get:() => it.inc,set:v => {it.inc=v;},fmt:v => Math.round(v)+'°' },
    { t:'angle',label:'Orientation',min:0,get:() => it.arg,set:v => {it.arg=v;} }
  ],onchange(){orbPaint(el,it);},onsave(){queueSave(page.id);},onreset(){
    it.planet='earth';it.solarDay=0;it.inc=28;it.arg=342;orbPaint(el,it);
  }});
}
function orbSolarAppearance(anchor,it,el,page){
  openProps(anchor,{title:'System appearance',rows:[
    { t:'pick',label:'Style',opts:ORB_LOOKS,get:() => it.look,pick:v => {it.look=orbLook(v);} },
    { t:'pick',label:'Scale',opts:ORB_SOLAR_VIEWS,get:() => it.solarView,pick:v => {
      it.solarView=ORB_SOLAR_VIEWS.some(x => x.v===v)?v:'overview';
      if(!orbSolarVisible(it,orbSolarPlanet(it))) it.planet='earth';
    } },
    { t:'pick',label:'Planet labels',opts:[{v:'selected',label:'Selected'},{v:'all',label:'All'}],
      get:() => it.solarLabels,pick:v => {it.solarLabels=v==='all'?'all':'selected';} },
    { t:'btn',label:'Surface maps',text:'New variations',hint:'Generate a new coherent set of procedural planet surfaces',act(){
      it.seedSolar=orbHash(it.seedSolar+':next');orbPaint(el,it);queueSave(page.id);SND.tick();
    } }
  ],onchange(){orbPaint(el,it);},onsave(){queueSave(page.id);},onreset(){
    it.look='notebook';it.solarView='overview';it.solarLabels='selected';it.seedSolar=orbHash((it.id||'orbit')+':solar-system');orbPaint(el,it);
  }});
}

function orbPointFromEvent(svg, e){
  const r = svg.getBoundingClientRect();
  return { x:(e.clientX-r.left)/r.width*ORB_W, y:(e.clientY-r.top)/r.height*ORB_H };
}
function orbMeanFromPoint(it, body, p){
  const f = orbFactors(it), k = body === 1 ? -f.one : f.two;
  if(Math.abs(k) < 1e-8) return it.mean;
  const dx = p.x - ORB_CX, dy = ORB_CY - p.y, a = it.arg * Math.PI / 180;
  const xp = dx * Math.cos(a) + dy * Math.sin(a);
  const yp = -dx * Math.sin(a) + dy * Math.cos(a);
  const yr = yp / Math.max(.17, Math.cos(it.inc * Math.PI / 180)) / k;
  const xr = xp / k, b = Math.sqrt(1-it.e*it.e);
  const E = Math.atan2(yr/(ORB_A*b), xr/ORB_A+it.e);
  return orbMod((E-it.e*Math.sin(E))*180/Math.PI);
}
function orbSolarDayFromPoint(it,planet,p){
  const dx=p.x-ORB_CX,dy=ORB_CY-p.y,a=it.arg*Math.PI/180;
  const xp=dx*Math.cos(a)+dy*Math.sin(a),yp=(-dx*Math.sin(a)+dy*Math.cos(a))/Math.max(.42,Math.cos(it.inc*Math.PI/180));
  const trueAnomaly=Math.atan2(yp,xp)-planet.peri*Math.PI/180;
  const E=2*Math.atan2(Math.sqrt(1-planet.e)*Math.sin(trueAnomaly/2),Math.sqrt(1+planet.e)*Math.cos(trueAnomaly/2));
  const mean=orbMod((E-planet.e*Math.sin(E))*180/Math.PI);
  const first=orbMod(mean-planet.m0)/360*planet.period;
  let day=first+Math.round((it.solarDay-first)/planet.period)*planet.period;
  while(day<0) day+=planet.period;
  while(day>ORB_SOLAR_SPAN && day-planet.period>=0) day-=planet.period;
  return clamp(day,0,ORB_SOLAR_SPAN);
}
function orbWire(el, it, page){
  const fig = el.querySelector('.orb'), svg = el.querySelector('.orbsvg'), input = el.querySelector('.orbphase input');
  if(!fig || !svg || !input) return;
  const take = () => { if(!el.classList.contains('dwidget')) select(it.id); };
  fig.querySelector('.orbphase').addEventListener('pointerdown', e => { e.stopPropagation(); take(); });
  input.addEventListener('input', e => {
    if(it.mode==='solar') it.solarDay=orbClamp(e.target.value,0,ORB_SOLAR_SPAN,0);
    else it.mean=orbMod(+e.target.value);
    orbPaint(el,it);
  });
  input.addEventListener('change', () => { queueSave(page.id);SND.tick(); });
  const legend=fig.querySelector('.solarlegend');
  if(legend) legend.addEventListener('click',e => {
    const b=e.target.closest('button[data-planet]');if(!b)return;
    e.preventDefault();e.stopPropagation();take();it.planet=b.dataset.planet;
    if(!orbSolarVisible(it,orbSolarPlanet(it))) it.solarView='overview';
    orbPaint(el,it);queueSave(page.id);SND.tick();
  });
  svg.addEventListener('pointerdown', e => {
    if(it.mode==='solar'){
      const target=e.target.closest&&e.target.closest('[data-planet]');
      if(!target)return;
      e.preventDefault();e.stopPropagation();take();it.planet=target.dataset.planet;orbPaint(el,it);
      if(!target.classList.contains('solarplanet')){queueSave(page.id);SND.tick();return;}
      const planet=orbSolarPlanet(it),pid=e.pointerId;
      try{svg.setPointerCapture(pid);}catch(err){}
      let raf=0;
      const paint=()=>{raf=0;orbPaint(el,it);};
      const mv=ev=>{if(ev.pointerId!==pid)return;it.solarDay=orbSolarDayFromPoint(it,planet,orbPointFromEvent(svg,ev));if(!raf)raf=requestAnimationFrame(paint);};
      const up=ev=>{if(ev.pointerId!==pid)return;svg.removeEventListener('pointermove',mv);svg.removeEventListener('pointerup',up);svg.removeEventListener('pointercancel',up);if(raf){cancelAnimationFrame(raf);paint();}try{svg.releasePointerCapture(pid);}catch(err){}if(ev.type==='pointerup'){queueSave(page.id);SND.tick();}};
      svg.addEventListener('pointermove',mv);svg.addEventListener('pointerup',up);svg.addEventListener('pointercancel',up);return;
    }
    const tick = e.target.closest && e.target.closest('.orbtickhit');
    if(tick){
      e.preventDefault();e.stopPropagation();take();it.mean=+tick.dataset.mean;orbPaint(el,it);queueSave(page.id);SND.tick();return;
    }
    const target = e.target.closest && e.target.closest('.orbobject');
    if(!target) return;
    e.preventDefault();e.stopPropagation();take();
    const body = +target.dataset.body, pid = e.pointerId;
    try{svg.setPointerCapture(pid);}catch(err){}
    let raf = 0;
    const paint = () => { raf=0;orbPaint(el,it); };
    const mv = ev => {
      if(ev.pointerId !== pid) return;
      it.mean = orbMeanFromPoint(it,body,orbPointFromEvent(svg,ev));
      if(!raf) raf=requestAnimationFrame(paint);
    };
    const up = ev => {
      if(ev.pointerId !== pid) return;
      svg.removeEventListener('pointermove',mv);svg.removeEventListener('pointerup',up);svg.removeEventListener('pointercancel',up);
      if(raf){cancelAnimationFrame(raf);paint();}
      try{svg.releasePointerCapture(pid);}catch(err){}
      if(ev.type === 'pointerup'){queueSave(page.id);SND.tick();}
    };
    svg.addEventListener('pointermove',mv);svg.addEventListener('pointerup',up);svg.addEventListener('pointercancel',up);
  });
}

defineItem('orbit', {
  add:{ orbit:base => ({ ...base, type:'orbit', w:76, m1:1.1, m2:.8, a:1.4, e:.42,
    inc:28, arg:342, mean:62, look:'notebook', tex1:'sun', tex2:'red',
    seed1:orbHash((base.id || 'orbit')+':primary'), seed2:orbHash((base.id || 'orbit')+':secondary'),
    vectors:'velocity', marks:1, area:1, cap:'' }),
    solar:base => ({ ...base, type:'orbit', mode:'solar', w:82, inc:28, arg:342, look:'notebook',
      solarDay:0, planet:'earth', solarView:'overview', solarLabels:'selected',
      seedSolar:orbHash((base.id || 'orbit')+':solar-system'), cap:'' }) },
  sound:'tape',
  html:it => orbHTML(it),
  mount(el,it){ orbPaint(el,it); },
  after(it){ select(it.id); },
  tools(mk,it,el,page){
    if(it.mode==='solar'){
      mk('System','Planet focus, date, viewing tilt and orientation',b => orbSolarModel(b,it,el,page));
      mk('View','Diagram style, distance scale, labels and procedural surfaces',b => orbSolarAppearance(b,it,el,page));
      mk('⟲','Return the system to the J2000 epoch',() => {it.solarDay=0;orbPaint(el,it);queueSave(page.id);SND.pop();});
      return;
    }
    mk('Orbit','Masses, semi-major axis, eccentricity, inclination and physical presets',b => orbPhysics(b,it,el,page));
    mk('Bodies','Diagram style, surfaces, time marks, swept area and vector overlays',b => orbAppearance(b,it,el,page));
    mk('⟲','Return both bodies to periapsis',() => {it.mean=0;orbPaint(el,it);queueSave(page.id);SND.pop();});
  },
  wire:orbWire,
  css:`
/* ---------- the binary-orbit study ---------- */
.orb{--obg:transparent;--opanel:transparent;--oink:var(--ink);--osoft:var(--soft);--oline:color-mix(in srgb,var(--accent2) 68%,var(--ink));--oline2:color-mix(in srgb,var(--accent) 62%,var(--ink));--ogrid:color-mix(in srgb,var(--ink) 13%,transparent);--osector:color-mix(in srgb,var(--accent2) 9%,transparent);--oborder:transparent;container-type:inline-size;overflow:visible;padding:0;border-radius:0;background:none;color:var(--ink);font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;box-shadow:none}
.orb[data-look="colour"]{--oline:#397f9a;--oline2:#bf7444;--osector:rgba(57,127,154,.09)}
.orb[data-look="draft"]{--oline:color-mix(in srgb,var(--ink) 58%,transparent);--oline2:color-mix(in srgb,var(--ink) 36%,transparent);--osector:color-mix(in srgb,var(--ink) 5%,transparent)}
.orb[data-look="mono"]{--oline:color-mix(in srgb,var(--ink) 72%,transparent);--oline2:color-mix(in srgb,var(--ink) 44%,transparent);--osector:color-mix(in srgb,var(--ink) 6%,transparent)}
.orbview{position:relative;margin:0;overflow:visible;background:none;box-shadow:none}
.orbsvg{display:block;width:100%;height:auto;overflow:visible;touch-action:none;color:var(--ink)}
.orbgrid{fill:none;stroke:var(--ogrid);stroke-width:1}.orbgrid circle{stroke-dasharray:2 7}.orbsector{fill:var(--osector);stroke:none}.orbpath{fill:none;stroke-width:1.35}.orbpath.one{stroke:var(--oline)}.orbpath.two{stroke:var(--oline2)}.orbaxis{fill:none;stroke:var(--ogrid);stroke-width:1;stroke-dasharray:4 5}.orbjoin{fill:none;stroke:var(--osoft);stroke-width:.75;stroke-dasharray:2 4;opacity:.48}.orbtick{fill:var(--oink);opacity:.62}.orbtickhit{fill:transparent;cursor:pointer}.orbbary circle{fill:var(--obg);stroke:var(--oink);stroke-width:1}.orbbary path{fill:none;stroke:var(--oink);stroke-width:1;opacity:.8}.orbbarylabel,.orbapsis{fill:var(--osoft);font-family:var(--mono);font-size:7px;letter-spacing:.06em}.orbapsis{text-anchor:middle}.orblabel text{fill:var(--oink);font-family:var(--mono);font-size:9px;font-weight:600;paint-order:stroke;stroke:var(--obg);stroke-width:3px;stroke-linejoin:round}.orbobject{cursor:grab;filter:drop-shadow(0 3px 5px rgba(0,0,0,.34))}.orbobject:active{cursor:grabbing}.orbhit{fill:transparent;stroke:none}.orbhalo{fill:currentColor;opacity:.13}.orbsurface{fill:none;stroke:#fff;stroke-width:1;stroke-linecap:round;opacity:.24}.orbmap,.orbshade,.orbatmos{pointer-events:none}.orbshade{mix-blend-mode:multiply}.orbatmos{fill:none;stroke:#b6efff;stroke-width:.7;opacity:.72}.orbdisk{opacity:.93;filter:drop-shadow(0 0 4px #ff9b60)}.orbhole{fill:#020306;stroke:#090b10;stroke-width:1}.orblens{fill:none;stroke:#d9f3ff;stroke-width:1;opacity:.7}.orbbeam{fill:none;stroke:#8deaff;stroke-width:2;stroke-linecap:round;opacity:.36}.orbspin{fill:none;stroke:#fff;stroke-width:1;opacity:.7}.orbarrow{fill:none;stroke-width:1.5;stroke-linecap:round}.orbarrow.velocity{stroke:#79e1bd;fill:#79e1bd}.orbarrow.force{stroke:#ff7d77;fill:#ff7d77}.orb[data-look="paper"] .orbarrow.velocity,.orb[data-look="mono"] .orbarrow.velocity{stroke:#218168;fill:#218168}.orb[data-look="paper"] .orbarrow.force,.orb[data-look="mono"] .orbarrow.force{stroke:#b74742;fill:#b74742}
.orbhint{position:absolute;left:50%;bottom:calc(var(--scale)*4px);transform:translateX(-50%);padding:calc(var(--scale)*3px) calc(var(--scale)*7px);border-radius:999px;background:color-mix(in srgb,var(--paper) 78%,transparent);backdrop-filter:blur(8px) saturate(130%);box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--ink) 8%,transparent);color:var(--soft);font-family:var(--mono);font-size:calc(var(--scale)*7px);letter-spacing:.04em;white-space:nowrap;opacity:0;transition:opacity .16s ease}.item.sel .orbhint,.orbview:hover .orbhint{opacity:.86}
.item[data-type="orbit"] .tools button:first-child,.item[data-type="orbit"] .tools button:nth-child(2){letter-spacing:.02em}.item[data-type="orbit"] .tools button:active{transform:scale(.96)}
@media (pointer:coarse){.orbhint{opacity:1}.orbtickhit{r:12}}
@media (prefers-reduced-motion:reduce){.orbhint,.orbphase input::-webkit-slider-thumb,.solarorbit,.solarlegend button{transition:none}}
/* Like the molecule, this belongs to the paper rather than sitting on a card.
   The drawing is permanent; chrome is quiet, transparent and subordinate. */
.item.sel[data-type="orbit"]>.orb{border-radius:calc(var(--scale)*5px);box-shadow:0 0 0 1px color-mix(in srgb,var(--accent2) 55%,transparent)}
.orb .orbbary circle{fill:var(--paper)}
.orb .orbbarylabel,.orb .orbapsis,.orb .orblabel text{paint-order:stroke;stroke:var(--paper);stroke-width:3px;stroke-linejoin:round}
.orb .orbbarylabel,.orb .orbapsis{opacity:.58}.item.sel .orbbarylabel,.item.sel .orbapsis{opacity:.82}
.orb .orbobject{filter:drop-shadow(0 calc(var(--scale)*1px) calc(var(--scale)*2px) rgba(0,0,0,.2))}
.orb .orbhalo{fill:var(--accent2);opacity:.09}.orb .orbarrow.velocity{stroke:var(--accent2);fill:var(--accent2)}.orb .orbarrow.force{stroke:var(--accent);fill:var(--accent)}
.orb[data-look="draft"] .orbpath{stroke-dasharray:7 5;stroke-width:1}.orb[data-look="draft"] .orbaxis{stroke-dasharray:2 6}
.orb[data-look="mono"] .orbobject:not(.tex-black){filter:grayscale(.72) drop-shadow(0 calc(var(--scale)*1px) calc(var(--scale)*2px) rgba(0,0,0,.16))}
.solarorbit{fill:none;stroke:var(--ogrid);stroke-width:.8;transition:stroke .16s ease,stroke-width .16s ease}.solarorbit.selected{stroke:var(--oline);stroke-width:1.55}.orb[data-look="draft"] .solarorbit{stroke-dasharray:3 5}.solarbelt{fill:none;stroke:var(--osoft);stroke-width:4;stroke-dasharray:.4 3.4;stroke-linecap:round;opacity:.15}.solarbeltlabel{fill:var(--osoft);font-family:var(--mono);font-size:6px;letter-spacing:.04em;opacity:.5;paint-order:stroke;stroke:var(--paper);stroke-width:3px}.solarsun{filter:drop-shadow(0 calc(var(--scale)*1px) calc(var(--scale)*3px) rgba(211,139,38,.27))}.solarplanet{cursor:grab;filter:drop-shadow(0 calc(var(--scale)*1px) calc(var(--scale)*1.5px) rgba(0,0,0,.2))}.solarplanet:active{cursor:grabbing}.solarhit{fill:transparent}.solarselect{fill:none;stroke:var(--oline);stroke-width:1;stroke-dasharray:1.5 2.5;opacity:.75}.solarring{fill:none;stroke:#c8aa76;stroke-width:2.3;opacity:.82}.solarlab{fill:var(--oink);font-family:var(--mono);font-size:7px;font-weight:600;text-anchor:middle;letter-spacing:.015em;paint-order:stroke;stroke:var(--paper);stroke-width:3px;stroke-linejoin:round;pointer-events:none}.orb[data-look="mono"] .solarplanet,.orb[data-look="mono"] .solarsun{filter:grayscale(.82) drop-shadow(0 calc(var(--scale)*1px) calc(var(--scale)*1.5px) rgba(0,0,0,.16))}
.solarlegend{display:flex;align-items:center;justify-content:center;flex-wrap:wrap;gap:calc(var(--scale)*2px);padding:0 calc(var(--scale)*3px) calc(var(--scale)*3px)}.solarlegend button{display:inline-flex;align-items:center;gap:calc(var(--scale)*2px);padding:calc(var(--scale)*3px) calc(var(--scale)*5px);border-radius:999px;color:var(--soft);background:transparent;box-shadow:none;font-family:var(--mono);font-size:calc(var(--scale)*6.5px);line-height:1;cursor:pointer;transition:color .12s ease,background .12s ease,transform .1s ease}.solarlegend button span{font-size:1.14em}.solarlegend button:hover{color:var(--ink);background:color-mix(in srgb,var(--ink) 5%,transparent)}.solarlegend button.on{color:var(--ink);background:color-mix(in srgb,var(--accent2) 10%,transparent);box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--accent2) 18%,transparent)}.solarlegend button:active{transform:scale(.96)}
.orbphase{display:block;padding:calc(var(--scale)*2px) calc(var(--scale)*3px) calc(var(--scale)*3px);opacity:.48;transition:opacity .16s ease}.item.sel .orbphase,.orbphase:focus-within,.orbphase:hover{opacity:1}
.orbphase>span{display:flex;align-items:baseline;justify-content:space-between;color:var(--soft);font-family:var(--mono);font-size:calc(var(--scale)*7px);letter-spacing:.04em;text-transform:none}
.orbphase>span i{font-style:normal;color:var(--ink)}.orbphase output{font-size:inherit;letter-spacing:.02em;color:var(--soft);font-variant-numeric:tabular-nums}
.orbphase input{display:block;appearance:none;width:100%;height:calc(var(--scale)*13px);margin:0;background:transparent;cursor:pointer}
.orbphase input::-webkit-slider-runnable-track{height:1px;border-radius:0;background:color-mix(in srgb,var(--ink) 20%,transparent);box-shadow:none}.orbphase input::-webkit-slider-thumb{appearance:none;width:calc(var(--scale)*9px);height:calc(var(--scale)*9px);margin-top:calc(var(--scale)*-4px);border:0;border-radius:50%;background:var(--accent2);box-shadow:0 0 0 calc(var(--scale)*2px) var(--paper);transition:transform .1s ease}.orbphase input:active::-webkit-slider-thumb{transform:scale(1.16)}
.orbphase input::-moz-range-track{height:1px;border-radius:0;background:color-mix(in srgb,var(--ink) 20%,transparent)}.orbphase input::-moz-range-thumb{width:calc(var(--scale)*9px);height:calc(var(--scale)*9px);border:0;border-radius:50%;background:var(--accent2);box-shadow:0 0 0 calc(var(--scale)*2px) var(--paper)}
.orbmetrics{display:flex;align-items:baseline;flex-wrap:wrap;gap:calc(var(--scale)*2px) calc(var(--scale)*6px);margin:0;padding:calc(var(--scale)*1px) calc(var(--scale)*3px) 0;background:none;border:0;border-radius:0;overflow:visible;font-family:var(--mono)}
.orbmetrics>span{display:flex;align-items:baseline;gap:calc(var(--scale)*3px);min-width:0;padding:0;background:none}.orbmetrics>span+span::before{content:"·";margin-right:calc(var(--scale)*3px);color:var(--soft);opacity:.48}
.orbmetrics small,.orbmetrics b{display:inline;overflow:visible;text-overflow:clip;white-space:nowrap;line-height:1.3}.orbmetrics small{font-family:inherit;font-size:calc(var(--scale)*7px);letter-spacing:.02em;text-transform:none;color:var(--soft)}.orbmetrics b{margin:0;font-family:inherit;font-size:calc(var(--scale)*8px);font-weight:500;letter-spacing:0;color:var(--ink);font-variant-numeric:tabular-nums}
.orbformula{display:flex;align-items:baseline;justify-content:space-between;flex-wrap:wrap;gap:calc(var(--scale)*2px) calc(var(--scale)*8px);padding:calc(var(--scale)*3px);color:var(--soft);font-family:var(--mono);font-size:calc(var(--scale)*7px);line-height:1.35;letter-spacing:.02em}.orbformula span:first-child{color:var(--soft)}.orbformula .orbmass{text-align:left;font-variant-numeric:tabular-nums}
.orb figcaption{min-height:0;padding:calc(var(--scale)*2px) calc(var(--scale)*3px) 0;color:var(--soft);font-size:calc(var(--scale)*7px)}.orb figcaption:empty{display:none}
@media (pointer:coarse){.orbphase input{height:calc(var(--scale)*20px)}.orbphase input::-webkit-slider-thumb{width:calc(var(--scale)*13px);height:calc(var(--scale)*13px);margin-top:calc(var(--scale)*-6px)}}
@container (max-width:430px){.solarlegend button{padding-inline:calc(var(--scale)*4px)}.solarlegend button span{display:none}}
@media (prefers-reduced-transparency:reduce){.orbhint{background:var(--paper);backdrop-filter:none}}
@media (prefers-contrast:more){.orbpath{stroke-width:2}.orbhint{background:var(--paper);box-shadow:inset 0 0 0 1px currentColor}.orbphase{opacity:1}}
` 
});

defineIcon('orbit','<ellipse cx="12" cy="12" rx="9" ry="4.8" transform="rotate(-22 12 12)"/><circle cx="5.8" cy="14.7" r="2.2" fill="currentColor" stroke="none"/><circle cx="18.2" cy="8.7" r="1.6" fill="currentColor" stroke="none"/><path d="M9.5 12h5M12 9.5v5"/>');
defineIcon('solar','<circle cx="12" cy="12" r="2.3" fill="currentColor" stroke="none"/><ellipse cx="12" cy="12" rx="6" ry="3.1"/><ellipse cx="12" cy="12" rx="10" ry="5.4"/><circle cx="21.1" cy="10.4" r="1.25" fill="currentColor" stroke="none"/>');
defineTool({ kind:'orbit', cat:'science', label:'Binary orbit', icon:'orbit', order:20,
  hint:'Explore a two-body Kepler orbit — drag time, compare masses, eccentricity, period, speed, barycentre and object surfaces' });
defineTool({ kind:'solar', cat:'science', label:'Solar system', icon:'solar', order:21,
  hint:'Explore all eight planets at one date — select or drag a planet and compare years, distances, speeds, masses and surfaces' });
