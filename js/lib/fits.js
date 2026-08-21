/* Open Note — lib/fits.js
   reading a FITS file: the headers, and what shape the data is */

/* ================= FITS =================
   Owes nothing to the rest of the app: hand it a File and it hands back the
   headers, and a description of every data unit — never the data itself.

     await fitsOpen(file)
       → { name, size, blob, hdus:[ …one per header/data unit… ] }

   A FITS file is a chain of HDUs — header/data units — laid end to end, each a
   whole number of 2880-byte blocks: a header of 80-column ASCII card images
   ending at END, then optionally a data unit. Nothing in the file says how many
   there are or where the third one starts; you find out by adding up what the
   second one's NAXIS keywords say it is carrying. So opening a file means
   walking it, one HDU at a time.

   The rule this whole file is built around: **the data is never read.** One
   exposure can be four gigabytes and one table a hundred million rows, and
   neither is a thing to put on a page — printing them would be no help anyway.
   What comes back is the headers (small, and the part worth reading) plus, for
   each data unit, its shape, its type and where it sits in the file.
   `dataOff` / `dataLen` are recorded for whoever one day wants a slice of it;
   opening a file reads a few kilobytes per HDU and nothing else.

   Two things worth knowing about the values that come out:

   - **A card's value is the value, not the picture of it.** `T` comes back as
     true, `1.2E-4` as a number, `'NGC 6357 '` as a trimmed string. The 80
     columns it was written in are kept beside it in `raw`, so the header can be
     handed back byte-for-byte when somebody wants to copy it.
   - **The type a column or an image is *stored* in is not always the type it
     *means*.** BITPIX 16 with BZERO 32768 is unsigned; a table column with
     TSCALn/TZEROn is scaled on the way out. Both are reported — the stored form
     and what it rescales to — because getting this wrong silently shifts
     everyone's numbers. */

const FITS_BLOCK = 2880, FITS_CARDW = 80;
const FITS_MAXHDU = 1000;               // a chain longer than this is a damaged file, not a deep one
const FITS_MAXHBLK = 400;               // …and 14,400 cards is not a header either
const FITS_MAXCOL = 4096;               // TFIELDS beyond this is nonsense

const FITS_RE = /\.(fits?|fts|fz)(\.gz)?$/i;
const fitsIsName = n => FITS_RE.test(String(n || ''));
const fitsIsFile = f => !!f && fitsIsName(f.name);
const fitsGzipped = f => /\.gz$/i.test(String((f && f.name) || ''));

/* A header is ASCII in fixed 80-column fields, so one byte has to stay one
   character — a TextDecoder that folds anything would slide every column. */
function fitsAscii(buf){
  const u = new Uint8Array(buf);
  let s = '';
  for(let i = 0; i < u.length; i += 4096)
    s += String.fromCharCode.apply(null, u.subarray(i, Math.min(u.length, i + 4096)));
  return s;
}
const fitsPad = n => Math.ceil(n / FITS_BLOCK) * FITS_BLOCK;

/* ---- is this one at all ----
   The first card of a FITS file is SIMPLE, always, in columns 1-8. A .gz has to
   be taken on the strength of its name: the magic is under the compression. */
async function fitsSniff(file){
  if(!file) return false;
  if(fitsGzipped(file)) return fitsIsName(file.name);
  try{
    const s = fitsAscii(await file.slice(0, 9).arrayBuffer());
    return s.slice(0, 6) === 'SIMPLE' || s.slice(0, 8) === 'XTENSION';
  }catch(e){ return fitsIsName(file.name); }
}

/* ================= one card =================
   `KEYWORD = value / comment`, in 80 columns: the keyword in 1-8, the equals in
   9, the value from 11 on, and a comment after the first slash that is not
   inside a string. Cards with no equals sign — COMMENT, HISTORY, a blank
   keyword — are free text and are kept as such. */
function fitsParseVal(s){
  const src = String(s == null ? '' : s);
  let i = 0;
  while(src[i] === ' ') i++;
  const after = j => {
    const rest = src.slice(j);
    const k = rest.indexOf('/');
    return k < 0 ? '' : rest.slice(k + 1).trim();
  };
  if(src[i] === "'"){                                /* a string: '' inside it is one quote */
    let out = '', j = i + 1;
    for(; j < src.length; j++){
      if(src[j] !== "'"){ out += src[j]; continue; }
      if(src[j + 1] === "'"){ out += "'"; j++; continue; }
      j++; break;
    }
    return { v: out.replace(/\s+$/, ''), t: 'str', cmt: after(j) };
  }
  if(src[i] === '('){                                /* a complex pair, kept as written */
    const j = src.indexOf(')', i);
    return { v: src.slice(i, j < 0 ? src.length : j + 1).trim(), t: 'cpx', cmt: after(j < 0 ? src.length : j + 1) };
  }
  const cut = src.indexOf('/', i);
  const tok = (cut < 0 ? src.slice(i) : src.slice(i, cut)).trim();
  const cmt = cut < 0 ? '' : src.slice(cut + 1).trim();
  if(tok === '') return { v: null, t: 'none', cmt };
  if(tok === 'T') return { v: true,  t: 'bool', cmt };
  if(tok === 'F') return { v: false, t: 'bool', cmt };
  /* Fortran writes an exponent with D as readily as with E, and both mean the
     same thing — 1.0D-3 is a number, and left as a string it would stop being one */
  const num = tok.replace(/[dD]/, 'E');
  if(/^[+-]?(\d+\.?\d*|\.\d+)(E[+-]?\d+)?$/i.test(num))
    return { v: +num, t: /[.E]/i.test(num) ? 'float' : 'int', cmt };
  return { v: tok, t: 'str', cmt };
}
function fitsParseCard(raw){
  /* ESO and friends put a long dotted keyword behind HIERARCH, which spends the
     8-column field on the word HIERARCH itself and puts the real name after it */
  if(raw.slice(0, 9) === 'HIERARCH '){
    const eq = raw.indexOf('=');
    if(eq > 9){
      const p = fitsParseVal(raw.slice(eq + 1));
      return { key: raw.slice(9, eq).trim(), val: p.v, t: p.t, cmt: p.cmt, raw, hier: 1 };
    }
  }
  const key = raw.slice(0, 8).trim();
  if(raw[8] !== '=' || key === '' || key === 'COMMENT' || key === 'HISTORY' || key === 'CONTINUE')
    return { key, val: null, t: 'txt', cmt: raw.slice(8).replace(/\s+$/, ''), raw };
  const p = fitsParseVal(raw.slice(9));
  return { key, val: p.v, t: p.t, cmt: p.cmt, raw };
}
/* A string too long for one card is broken with a trailing & and carried on by
   CONTINUE cards. They are joined back into the one card they always were. */
function fitsJoin(cards){
  const out = [];
  for(const c of cards){
    const p = out[out.length - 1];
    if(c.key === 'CONTINUE' && p && p.t === 'str' && /&$/.test(String(p.val))){
      const q = fitsParseVal(c.cmt);
      p.val = String(p.val).replace(/&$/, '') + (q.v == null ? '' : String(q.v));
      if(q.cmt) p.cmt = p.cmt ? p.cmt + ' ' + q.cmt : q.cmt;
      p.cont = (p.cont || 1) + 1;
      continue;
    }
    out.push(c);
  }
  return out;
}

/* ================= one header =================
   Blocks are read until the END card turns up. `end` comes back block-aligned —
   which is exactly where the data unit begins. */
async function fitsReadHeader(blob, off){
  const cards = [];
  let p = off, done = false, blk = 0;
  while(!done && p < blob.size){
    if(++blk > FITS_MAXHBLK) throw new Error('a header with no END in it — this file is damaged');
    const buf = await blob.slice(p, p + FITS_BLOCK).arrayBuffer();
    if(buf.byteLength < FITS_CARDW){ p = blob.size; break; }
    const txt = fitsAscii(buf);
    for(let i = 0; i + FITS_CARDW <= txt.length; i += FITS_CARDW){
      const raw = txt.slice(i, i + FITS_CARDW);
      if(raw.slice(0, 3) === 'END' && raw.slice(3).trim() === ''){ done = true; break; }
      /* trailing padding at the end of a file is NULs, not cards — that is the
         file finishing, not a header starting */
      if(blk === 1 && !cards.length && !/^[ -~]/.test(raw)) return { cards: [], end: blob.size, bad: 1 };
      if(raw.trim() === '') continue;                // a blank card separates, it does not say anything
      cards.push(fitsParseCard(raw));
    }
    p += FITS_BLOCK;
  }
  return { cards: fitsJoin(cards), end: p, bad: done ? 0 : 1 };
}

/* ================= what a data unit is =================
   BITPIX says how each number is stored; a negative one means floating point.
   BZERO shifts it, and the two usual shifts are how FITS spells "unsigned". */
const FITS_BPX = { 8:'uint8', 16:'int16', 32:'int32', 64:'int64', '-32':'float32', '-64':'float64' };
function fitsDType(bitpix, bzero){
  const b = +bitpix;
  if(b === 16 && +bzero === 32768) return 'uint16';
  if(b === 32 && +bzero === 2147483648) return 'uint32';
  if(b === 8 && +bzero === -128) return 'int8';
  return FITS_BPX[b] || ('bitpix ' + (b || '?'));
}
/* a binary table column: how wide one cell is, and what is in it */
const FITS_TCODE = { L:'bool', X:'bit', B:'uint8', I:'int16', J:'int32', K:'int64', A:'char',
                     E:'float32', D:'float64', C:'complex64', M:'complex128',
                     P:'array ptr', Q:'array ptr' };
const FITS_TW = { L:1, B:1, I:2, J:4, K:8, A:1, E:4, D:8, C:8, M:16, P:8, Q:16 };
function fitsColBytes(code, rep){
  if(code === 'X') return Math.ceil(rep / 8);        // X counts BITS, not bytes
  return (FITS_TW[code] || 0) * rep;
}
function fitsBinCols(h, n){
  const cols = [];
  let off = 0;
  for(let k = 1; k <= n; k++){
    const form = String(h['TFORM' + k] == null ? '' : h['TFORM' + k]).trim();
    const m = form.match(/^(\d*)\s*([LXBIJKAEDCMPQ])/i);
    const rep = m ? (m[1] === '' ? 1 : +m[1]) : 0;
    const code = m ? m[2].toUpperCase() : '';
    const w = fitsColBytes(code, rep);
    const tdim = String(h['TDIM' + k] == null ? '' : h['TDIM' + k]).trim();
    cols.push({ n: k, name: String(h['TTYPE' + k] == null ? '' : h['TTYPE' + k]).trim() || ('col ' + k),
      unit: String(h['TUNIT' + k] == null ? '' : h['TUNIT' + k]).trim(),
      form, code, rep, bytes: w, off, type: FITS_TCODE[code] || 'unknown',
      /* TDIMn overrides the flat repeat count with the shape it really is */
      shape: tdim ? tdim.replace(/[()\s]/g, '').split(',').filter(Boolean).reverse().map(Number)
                  : (code === 'A' ? [] : rep > 1 ? [rep] : []),
      chars: code === 'A' ? rep : 0,
      scale: h['TSCAL' + k] == null ? null : +h['TSCAL' + k],
      zero:  h['TZERO' + k] == null ? null : +h['TZERO' + k],
      nul:   h['TNULL' + k] == null ? null : h['TNULL' + k],
      disp:  String(h['TDISP' + k] == null ? '' : h['TDISP' + k]).trim() });
    off += w;
  }
  return cols;
}
/* an ASCII table says where each field starts and prints it in a Fortran format */
function fitsAscCols(h, n){
  const cols = [];
  for(let k = 1; k <= n; k++){
    const form = String(h['TFORM' + k] == null ? '' : h['TFORM' + k]).trim();
    const m = form.match(/^([AIFEDaifed])\s*(\d+)/);
    const code = m ? m[1].toUpperCase() : '';
    cols.push({ n: k, name: String(h['TTYPE' + k] == null ? '' : h['TTYPE' + k]).trim() || ('col ' + k),
      unit: String(h['TUNIT' + k] == null ? '' : h['TUNIT' + k]).trim(),
      form, code, rep: 1, bytes: m ? +m[2] : 0, off: (+h['TBCOL' + k] || 1) - 1,
      type: code === 'A' ? 'char' : code === 'I' ? 'int' : code ? 'float' : 'unknown',
      shape: [], chars: code === 'A' && m ? +m[2] : 0,
      scale: h['TSCAL' + k] == null ? null : +h['TSCAL' + k],
      zero:  h['TZERO' + k] == null ? null : +h['TZERO' + k],
      nul:   h['TNULL' + k] == null ? null : h['TNULL' + k], disp: '' });
  }
  return cols;
}

const clampInt = (v, lo, hi) => Math.max(lo, Math.min(hi, Math.round(+v || 0)));

/* one HDU, from its cards and where its data begins */
function fitsHDU(cards, i, dataOff, hdrOff){
  const h = {};
  for(const c of cards) if(c.key && c.val !== null && !(c.key in h)) h[c.key] = c.val;
  const num = (k, d) => { const v = h[k]; return v == null || v === '' ? d : (+v || 0); };
  const xt = String(h.XTENSION == null ? '' : h.XTENSION).trim().toUpperCase();
  const bitpix = num('BITPIX', 0);
  const naxis = Math.max(0, num('NAXIS', 0) | 0);
  const dims = [];                                   // in FITS order: NAXIS1 runs fastest
  for(let k = 1; k <= naxis; k++) dims.push(Math.max(0, num('NAXIS' + k, 0)));
  const gcount = num('GCOUNT', 1), pcount = num('PCOUNT', 0);
  const vals = dims.reduce((a, b) => a * b, 1);
  const dataLen = naxis ? Math.abs(bitpix) / 8 * gcount * (pcount + vals) : 0;

  const table = xt === 'BINTABLE' || xt === 'A3DTABLE' ? 'bin' : xt === 'TABLE' ? 'asc' : '';
  const zip = table === 'bin' && h.ZIMAGE === true;   // a tile-compressed image, wearing a table as a coat
  const kind = zip ? 'zimage' : table ? 'table' : (naxis ? 'image' : 'empty');
  const klass = i === 0 ? 'PrimaryHDU'
    : zip ? 'CompImageHDU'
    : table === 'bin' ? 'BinTableHDU'
    : table === 'asc' ? 'TableHDU'
    : xt === 'IMAGE' ? 'ImageHDU'
    : xt ? xt.charAt(0) + xt.slice(1).toLowerCase() + 'HDU' : 'HDU';

  const nfld = clampInt(num('TFIELDS', 0), 0, FITS_MAXCOL);
  const cols = table === 'bin' ? fitsBinCols(h, nfld) : table === 'asc' ? fitsAscCols(h, nfld) : [];

  /* a compressed image is described by its own Z-keywords; the table under it is
     only how the tiles are stored */
  const zdims = [];
  if(zip) for(let k = 1, zn = Math.max(0, num('ZNAXIS', 0) | 0); k <= zn; k++) zdims.push(num('ZNAXIS' + k, 0));

  return {
    i, cards, keys: h, kind, klass, xtension: xt, hdrOff,
    name: String(h.EXTNAME == null ? (i === 0 ? 'PRIMARY' : '') : h.EXTNAME).trim() || (i === 0 ? 'PRIMARY' : ''),
    ver: num('EXTVER', 1) | 0,
    bitpix, naxis, dims, gcount, pcount,
    dtype: zip ? fitsDType(num('ZBITPIX', 0), null) : fitsDType(bitpix, h.BZERO),
    stored: fitsDType(bitpix, null),
    bzero: h.BZERO == null ? null : +h.BZERO, bscale: h.BSCALE == null ? null : +h.BSCALE,
    zdims, zcmp: String(h.ZCMPTYPE == null ? '' : h.ZCMPTYPE).trim(),
    values: naxis ? vals : 0,
    rows: table ? Math.max(0, num('NAXIS2', 0)) : 0,
    rowBytes: table ? Math.max(0, num('NAXIS1', 0)) : 0,
    cols, heap: table === 'bin' ? pcount : 0,
    dataOff, dataLen, dataEnd: dataOff + fitsPad(dataLen)
  };
}

/* ---- .gz: the whole thing has to come out before any of it can be read ---- */
async function fitsGunzip(file){
  if(typeof DecompressionStream !== 'function')
    throw new Error('this browser cannot unpack a .gz — unzip the file first');
  const b = await new Response(file.stream().pipeThrough(new DecompressionStream('gzip'))).blob();
  return new File([b], String(file.name).replace(/\.gz$/i, ''), { type: 'application/fits' });
}

/* ================= the walk =================
   Header, then skip the data, then the next header, until the file runs out. */
async function fitsOpen(file){
  let src = file;
  if(fitsGzipped(file)) src = await fitsGunzip(file);
  const first = await fitsReadHeader(src, 0);
  if(first.bad || !first.cards.length || (first.cards[0].key !== 'SIMPLE' && first.cards[0].key !== 'XTENSION'))
    throw new Error('that file does not start with a FITS header');
  const hdus = [];
  let cards = first.cards, end = first.end, at = 0;
  while(hdus.length < FITS_MAXHDU){
    const hd = fitsHDU(cards, hdus.length, end, at);
    hdus.push(hd);
    const next = hd.dataEnd;
    if(next >= src.size || next <= end - FITS_BLOCK) break;
    const h = await fitsReadHeader(src, next);
    if(h.bad || !h.cards.length) break;
    cards = h.cards; end = h.end; at = next;
  }
  return { name: file.name, size: file.size, blob: src, hdus };
}

/* ================= saying what came back =================
   The three columns astropy's own .info() prints, so what is on the page and
   what is in a terminal agree with each other. Shapes are written the way numpy
   writes them — outermost axis first, which is NAXIS backwards. */
const fitsShape = d => '(' + (d || []).slice().reverse().join(', ') + ')';
function fitsDim(hd){
  if(hd.kind === 'table') return hd.rows.toLocaleString() + 'R x ' + hd.cols.length + 'C';
  if(hd.kind === 'zimage') return fitsShape(hd.zdims);
  return hd.naxis ? fitsShape(hd.dims) : '()';
}
function fitsFormat(hd){
  if(hd.kind === 'table') return '[' + hd.cols.map(c => c.form).join(', ') + ']';
  if(hd.kind === 'empty') return '';
  return hd.dtype;
}
const fitsInfo = f => (f.hdus || []).map(hd => ({
  no: hd.i, name: hd.name, ver: hd.ver, klass: hd.klass,
  cards: hd.cards.length, dim: fitsDim(hd), format: fitsFormat(hd),
  bytes: hd.dataLen, kind: hd.kind }));

/* how many numbers one cell of a column holds, and what shape they are in */
function fitsCellShape(c){
  if(c.chars) return c.chars + ' chars';
  if(c.shape && c.shape.length > 1) return '(' + c.shape.join(', ') + ')';
  if(c.rep > 1) return '(' + c.rep + ',)';
  return 'scalar';
}
/* the header, back in the 80 columns it arrived in */
const fitsHeaderText = hd => (hd.cards || []).map(c => c.raw).concat('END').join('\n');

/* ---- looking for a keyword ----
   Over the key, the value and the comment alike: half of what anyone is hunting
   for in a header is a filter name or a date sitting in the value field. */
function fitsFind(hdus, q){
  const s = String(q || '').trim().toLowerCase();
  if(!s) return null;
  const hit = c => (c.key + ' ' + (c.val == null ? '' : c.val) + ' ' + (c.cmt || '')).toLowerCase().includes(s);
  const out = [];
  for(const hd of hdus) for(const c of hd.cards) if(hit(c)) out.push({ hdu: hd, card: c });
  return out;
}
