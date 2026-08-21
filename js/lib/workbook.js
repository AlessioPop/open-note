/* Open Note — lib/workbook.js
   reading a workbook off the disk: .xlsx, .ods, .csv */

/* ================= workbooks =================
   Owes nothing to the rest of the app: hand it a File and it hands back plain
   rows of plain strings, which is exactly what a table is made of.

     await sheetRead(file)
       → { kind:'xlsx', name:'runs.xlsx', sheets:[{ name:'Sheet1', rows, rowsTotal }] }

   No library is vendored in for this. An .xlsx and an .ods are both a zip of
   XML, the browser already has an unzipper (DecompressionStream) and an XML
   parser, and the rest is bookkeeping — which parts to read, and what a cell
   means once you have it.

   Two things are worth knowing about the values that come out:

   - **A date comes out written down.** A date in a workbook is a *number* —
     45352 — and only the format attached to the cell says it is the 1st of
     March. Nobody wants 45352 in a table, so the styles are read and those
     cells come out as `2024-03-01`, which sorts and reads the same everywhere.
   - **Everything else comes out as the number it is.** A cell shown as `15%`
     holds 0.15 and arrives as 0.15; one shown to two decimals arrives with all
     of them. The file's numbers are the data, and rounding it on the way in
     would be inventing readings that were never taken. */

const SHEET_MAXR = 50000;                // as many rows as one table may hold
const SHEET_MAXC = 256;                  // …and as many columns
const SHEET_XMLMAX = 220 * 1024 * 1024;  // a part bigger than this is not worth unpacking

const sheetExt = f => ((String((f && f.name) || '').match(/\.([a-z0-9]{1,5})$/i) || ['', ''])[1] || '').toLowerCase();
/* what we would do with a dropped file, without opening it */
function sheetKind(f){
  const e = sheetExt(f);
  if(e === 'xlsx' || e === 'xlsm') return 'xlsx';
  if(e === 'ods') return 'ods';
  if(e === 'csv' || e === 'tsv' || e === 'tab') return 'csv';
  if(e === 'xls') return 'xls';          // the old binary one — recognised only to say so
  return null;
}

/* ---- the zip a workbook is ----
   Read from the central directory at the end rather than by walking the local
   headers: a writer is allowed to leave the sizes out of a local header and put
   them after the data, and the directory always has them right. */
function zipOpen(buf){
  const V = new DataView(buf), U = new Uint8Array(buf), n = U.length;
  const td = new TextDecoder();
  let e = -1;
  for(let i = n - 22; i >= Math.max(0, n - 66000); i--)   /* behind a comment of up to 64k */
    if(V.getUint32(i, true) === 0x06054b50){ e = i; break; }
  if(e < 0) throw new Error('that file is not a zip, so it is not a workbook either');
  let count = V.getUint16(e + 10, true), off = V.getUint32(e + 16, true);
  /* zip64 keeps the real count and offset in a record of its own, pointed at by
     a locator sitting just in front of the end record */
  if(count === 0xffff || off === 0xffffffff){
    for(let i = e - 20; i >= 0; i--)
      if(V.getUint32(i, true) === 0x07064b50){
        const z = Number(V.getBigUint64(i + 8, true));
        if(z + 56 <= n && V.getUint32(z, true) === 0x06064b50){
          count = Number(V.getBigUint64(z + 32, true));
          off = Number(V.getBigUint64(z + 48, true));
        }
        break;
      }
  }
  const at = {};
  for(let i = 0, p = off; i < count && p + 46 <= n; i++){
    if(V.getUint32(p, true) !== 0x02014b50) break;
    const nl = V.getUint16(p + 28, true), xl = V.getUint16(p + 30, true), cl = V.getUint16(p + 32, true);
    at[td.decode(U.subarray(p + 46, p + 46 + nl))] =
      { m: V.getUint16(p + 10, true), z: V.getUint32(p + 20, true),
        u: V.getUint32(p + 24, true), at: V.getUint32(p + 42, true) };
    p += 46 + nl + xl + cl;
  }
  return { V, U, at };
}
/* One part of it, found and checked but not yet unpacked. A slide deck is the
   same kind of zip (lib/pptx.js), so `what` is simply the word the messages use
   for the file in hand. */
function zipPart(z, name, what){
  const e = z.at[name];
  if(!e) return null;
  const w = what || 'file';
  if(e.at === 0xffffffff || e.z === 0xffffffff)
    throw new Error('that ' + w + ' is stored in a way this cannot read (zip64 entries)');
  if(e.u > SHEET_XMLMAX) throw new Error('that ' + w + ' has a part too big to unpack (' +
    Math.round(e.u / 1048576) + ' MB of ' + name + ')');
  if(z.V.getUint32(e.at, true) !== 0x04034b50) return null;
  const nl = z.V.getUint16(e.at + 26, true), xl = z.V.getUint16(e.at + 28, true);
  const raw = z.U.subarray(e.at + 30 + nl + xl, e.at + 30 + nl + xl + e.z);
  if(e.m !== 0 && e.m !== 8)
    throw new Error('that ' + w + ' is packed in a way this cannot read (method ' + e.m + ')');
  if(e.m === 8 && typeof DecompressionStream === 'undefined')
    throw new Error('this browser cannot unpack a zip on its own' +
      (w === 'workbook' ? ' — save the sheet as .csv instead' : ''));
  return { raw, m: e.m };
}
const zipFlate = p => new Blob([p.raw]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
/* one part of it, as text — every part of a workbook that matters is XML */
async function zipText(z, name, what){
  const p = zipPart(z, name, what || 'workbook');
  if(!p) return null;
  return p.m === 0 ? new TextDecoder().decode(p.raw) : await new Response(zipFlate(p)).text();
}
/* …and as the bytes themselves, which is what a picture inside a deck is */
async function zipBytes(z, name, what){
  const p = zipPart(z, name, what);
  if(!p) return null;
  return p.m === 0 ? p.raw : new Uint8Array(await new Response(zipFlate(p)).arrayBuffer());
}

/* ---- XML, read by hand ----
   The small parts of a workbook go through DOMParser, which is clearer. The two
   that can run to hundreds of megabytes — the sheet itself and its strings — are
   scanned instead: building a DOM node per cell for a million cells is how a tab
   runs out of memory. */
const XENT = { amp:'&', lt:'<', gt:'>', quot:'"', apos:"'" };
const xdec = s => s.indexOf('&') < 0 ? s : s.replace(/&(#x[0-9a-fA-F]+|#[0-9]+|[a-z]+);/g, (m, k) =>
  k.charAt(0) !== '#' ? (XENT[k] != null ? XENT[k] : m)
  : String.fromCodePoint(parseInt(k.charAt(1) === 'x' ? k.slice(2) : k.slice(1),
                                  k.charAt(1) === 'x' ? 16 : 10) || 32));
const RE_R = /\br="([^"]*)"/, RE_T = /\bt="([^"]*)"/, RE_S = /\bs="([^"]*)"/;
const xat = (tag, re) => { const m = re.exec(tag); return m ? m[1] : null; };
/* the text of the first <name> inside a fragment, entities and all */
function xtext(s, name, from){
  const a = s.indexOf('<' + name, from || 0);
  if(a < 0) return null;
  const gt = s.indexOf('>', a);
  if(gt < 0) return null;
  if(s.charAt(gt - 1) === '/') return '';              /* <v/> — there, and empty */
  const b = s.indexOf('</' + name + '>', gt);
  return b < 0 ? null : xdec(s.slice(gt + 1, b));
}
/* "B7" → column 1. Stops at the first digit, so AB12 is column 27. */
function a1col(s){
  let c = 0;
  for(let i = 0; i < s.length; i++){
    const k = s.charCodeAt(i) & ~32;                   /* upper-case it */
    if(k < 65 || k > 90) break;
    c = c * 26 + (k - 64);
  }
  return c - 1;
}
const a1row = s => (parseInt(s.replace(/^[A-Za-z]+/, ''), 10) || 0) - 1;

/* ---- what a number in a cell is really saying ----
   14–22 and 45–47 are the built-in date and time formats; anything else with a
   y, d, h or s left in it once the quoted bits and the [colour] brackets are
   gone is a date format somebody wrote themselves. A lone m is a month. */
const XL_DATEFMT = { 14:1, 15:1, 16:1, 17:1, 18:2, 19:2, 20:2, 21:2, 22:3, 45:2, 46:2, 47:3 };
function fmtIsDate(id, code){
  if(code == null) return XL_DATEFMT[id] || 0;
  const c = String(code).replace(/"[^"]*"/g, '').replace(/\[[^\]]*\]/g, '').replace(/\\./g, '');
  if(/general/i.test(c) || !c) return 0;
  const date = /[yd]/i.test(c), time = /[hs]/i.test(c);
  if(date && time) return 3;
  if(time) return 2;
  return (date || /m/i.test(c)) ? 1 : 0;
}
/* the format each cell style points at, as one array indexed by the cell's s="" */
function xlsxStyles(xml){
  const codes = {};
  if(xml){
    const re = /<numFmt\b[^>]*>/g;
    let m;
    while((m = re.exec(xml))){
      const id = xat(m[0], /\bnumFmtId="([^"]*)"/), c = xat(m[0], /\bformatCode="([^"]*)"/);
      if(id != null) codes[+id] = xdec(c || '');
    }
  }
  const out = [];
  const a = xml ? xml.indexOf('<cellXfs') : -1;
  if(a < 0) return out;
  const b = xml.indexOf('</cellXfs>', a);
  const re = /<xf\b[^>]*>/g;
  re.lastIndex = a;
  let m;
  while((m = re.exec(xml)) && (b < 0 || m.index < b)){
    const id = +(xat(m[0], /\bnumFmtId="([^"]*)"/) || 0);
    out.push(fmtIsDate(id, codes[id]));
  }
  return out;
}
/* a workbook's day zero. 1900 counts a 29th of February that never happened, so
   everything from the 1st of March 1900 on is a day further along than the
   arithmetic says — which is why the epoch below is the 30th of December. */
function xlDate(serial, mode1904, kind){
  const base = mode1904 ? Date.UTC(1904, 0, 1) : Date.UTC(1899, 11, 30);
  const n = mode1904 ? serial : (serial < 60 ? serial + 1 : serial);
  /* to the second: a time in a workbook is a fraction of a day, and 15:30 is
     kept as …6458333, which lands a millisecond short of it */
  const ms = base + Math.round(n * 86400) * 1000;
  if(!isFinite(ms)) return null;
  const iso = new Date(ms).toISOString();
  if(kind === 2) return iso.slice(11, 19);
  return kind === 3 ? iso.slice(0, 10) + ' ' + iso.slice(11, 19) : iso.slice(0, 10);
}
/* Float noise from a spreadsheet — 1.2999999999999998 — is not a reading, so a
   decimal comes back at the fifteen digits a workbook actually keeps. A whole
   number is left exactly as it was written: a long one is an id, not a
   measurement, and rounding it would quietly change it. */
function numText(s){
  const t = String(s == null ? '' : s).trim();
  if(!/[.eE]/.test(t)) return t;
  const v = +t;
  return isFinite(v) ? String(+v.toPrecision(15)) : t;
}
const clamp0 = v => Number.isFinite(v) && v > 0 ? Math.min(v, 1048576) : 1;

/* ---- the strings a sheet points at ----
   Every repeated word in a workbook is stored once here and referenced by
   number. A string can be built out of runs (<r><t>…), and <rPh> holds the
   phonetics of a Japanese one, which is not part of the text. */
function xlsxShared(xml){
  const out = [];
  if(!xml) return out;
  let p = xml.indexOf('<si'), guard = 0;
  while(p >= 0 && guard++ < 4000000){
    const gt = xml.indexOf('>', p);
    if(gt < 0) break;
    if(xml.charAt(gt - 1) === '/'){ out.push(''); p = xml.indexOf('<si', gt); continue; }
    const end = xml.indexOf('</si>', gt);
    if(end < 0) break;
    const body = xml.slice(gt + 1, end);
    let s = '', i = 0;
    for(;;){
      const a = body.indexOf('<t', i);
      if(a < 0) break;
      const ch = body.charAt(a + 2);
      if(ch !== '>' && ch !== ' ' && ch !== '/'){ i = a + 2; continue; }
      const ph = body.lastIndexOf('<rPh', a);
      if(ph >= 0 && body.lastIndexOf('</rPh>', a) < ph){ i = a + 2; continue; }   /* inside the phonetics */
      const g2 = body.indexOf('>', a);
      if(g2 < 0) break;
      if(body.charAt(g2 - 1) === '/'){ i = g2 + 1; continue; }
      const b2 = body.indexOf('</t>', g2);
      if(b2 < 0) break;
      s += xdec(body.slice(g2 + 1, b2));
      i = b2 + 4;
    }
    out.push(s);
    p = xml.indexOf('<si', end);
  }
  return out;
}

/* ---- one sheet ----
   Every cell carries its own address, so the rows build themselves out of what
   is actually there — which is the point, since a sheet declares itself a
   million rows deep and holds forty. */
function xlsxSheet(xml, shared, styles, mode1904){
  const rows = [];
  const sd = xml.indexOf('<sheetData');
  const shut = xml.indexOf('</sheetData>');
  const end = shut < 0 ? xml.length : shut;
  let p = sd < 0 ? 0 : sd, nr = xml.indexOf('<row', p);
  let row = 0, col = 0, total = 0, wide = false;
  const put = (r, c, v) => {
    if(v === '') return;
    total = Math.max(total, r + 1);
    if(c >= SHEET_MAXC){ wide = true; return; }
    if(r >= SHEET_MAXR) return;
    while(rows.length <= r) rows.push([]);
    const line = rows[r];
    while(line.length <= c) line.push('');
    line[c] = v;
  };
  for(let guard = 0; guard < 40000000; guard++){
    const q = xml.indexOf('<c', p);
    if(q < 0 || q >= end) break;
    const ch = xml.charAt(q + 2);
    if(ch !== ' ' && ch !== '>' && ch !== '/'){ p = q + 2; continue; }
    /* a cell may leave its address out, and then it is simply the next one along
       in whatever row we are in — so the rows are tracked as we pass them */
    while(nr >= 0 && nr < q){
      const g = xml.indexOf('>', nr);
      const r = xat(xml.slice(nr, g < 0 ? nr + 40 : g), RE_R);
      row = r ? (+r - 1) : row + 1;
      col = 0;
      nr = xml.indexOf('<row', nr + 4);
    }
    const gt = xml.indexOf('>', q);
    if(gt < 0) break;
    const tag = xml.slice(q, gt);
    const ref = xat(tag, RE_R);
    const r = ref ? a1row(ref) : row, c = ref ? a1col(ref) : col;
    col = c + 1;
    if(xml.charAt(gt - 1) === '/'){ p = gt + 1; continue; }   /* <c r="A1"/> — nothing in it */
    const ce = xml.indexOf('</c>', gt);
    if(ce < 0) break;
    const inner = xml.slice(gt + 1, ce);
    p = ce + 4;
    if(r < 0 || c < 0) continue;
    const t = xat(tag, RE_T) || 'n';
    let v;
    if(t === 's'){
      const k = +xtext(inner, 'v');
      v = shared[k] == null ? '' : shared[k];
    }else if(t === 'inlineStr'){
      v = '';
      let i = 0;
      for(;;){
        const a = inner.indexOf('<t', i);
        if(a < 0) break;
        const g2 = inner.indexOf('>', a);
        if(g2 < 0) break;
        if(inner.charAt(g2 - 1) === '/'){ i = g2 + 1; continue; }
        const b2 = inner.indexOf('</t>', g2);
        if(b2 < 0) break;
        v += xdec(inner.slice(g2 + 1, b2));
        i = b2 + 4;
      }
    }else if(t === 'b'){
      v = xtext(inner, 'v') === '1' ? 'TRUE' : 'FALSE';
    }else if(t === 'e' || t === 'str' || t === 'd'){
      v = xtext(inner, 'v') || '';
    }else{
      const raw = xtext(inner, 'v');
      if(raw == null || raw === '') v = '';
      else{
        const st = +(xat(tag, RE_S) || 0);
        const kind = styles[st] || 0;
        const num = +raw;
        v = (kind && isFinite(num) && num > 0 && num < 2958466)
          ? (xlDate(num, mode1904, kind) || numText(raw)) : numText(raw);
      }
    }
    put(r, c, v);
  }
  return { rows: squared(rows), rowsTotal: total, wide };
}
/* Cells arrive at whatever address they claim, so what comes out of that is a
   grid with gaps in it. A table wants a rectangle. */
function squared(rows){
  let w = 0;
  for(const r of rows) if(r && r.length > w) w = r.length;
  return rows.map(r => {
    const a = r || [];
    for(let i = 0; i < w; i++) if(a[i] == null) a[i] = '';
    return a;
  });
}

/* ---- the workbook, and the sheets in it ---- */
function xmlDoc(s){
  const d = new DOMParser().parseFromString(s || '<x/>', 'application/xml');
  return d.querySelector('parsererror') ? null : d;
}
async function xlsxRead(buf){
  const z = zipOpen(buf);
  const wbx = await zipText(z, 'xl/workbook.xml');
  const wb = wbx && xmlDoc(wbx);
  if(!wb) throw new Error('there is no workbook inside that file');
  const rels = xmlDoc(await zipText(z, 'xl/_rels/workbook.xml.rels'));
  const target = {};
  if(rels) rels.querySelectorAll('Relationship').forEach(r => {
    let t = r.getAttribute('Target') || '';
    if(t.charAt(0) === '/') t = t.replace(/^\/+/, '');
    else if(t.indexOf('xl/') !== 0) t = 'xl/' + t.replace(/^\.\//, '');
    target[r.getAttribute('Id')] = t;
  });
  const pr = wb.querySelector('workbookPr');
  const mode1904 = !!pr && /^(1|true)$/i.test(pr.getAttribute('date1904') || pr.getAttribute('dateCompatibility') || '');
  const styles = xlsxStyles(await zipText(z, 'xl/styles.xml'));
  const shared = xlsxShared(await zipText(z, 'xl/sharedStrings.xml'));
  const out = [];
  const list = [...wb.querySelectorAll('sheets > sheet')];
  for(let i = 0; i < list.length; i++){
    const s = list[i];
    /* a hidden sheet is usually a workbook's own scaffolding, not data */
    if((s.getAttribute('state') || 'visible') !== 'visible') continue;
    const rid = s.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id') ||
                s.getAttribute('r:id');
    const path = target[rid] || ('xl/worksheets/sheet' + (i + 1) + '.xml');
    const xml = await zipText(z, path);
    if(xml == null) continue;
    out.push({ name: s.getAttribute('name') || ('Sheet' + (i + 1)), ...xlsxSheet(xml, shared, styles, mode1904) });
  }
  if(!out.length) throw new Error('that workbook has no sheets this can read');
  return out;
}

/* ---- OpenDocument ----
   LibreOffice's own format, and worth reading: it is what half a university
   hands in. Same zip, one content.xml, and cells that repeat themselves rather
   than being written out — a row of 16384 empty cells is one tag. */
function odsCell(c){
  const NS = 'urn:oasis:names:tc:opendocument:xmlns:office:1.0';
  const type = c.getAttributeNS(NS, 'value-type') || '';
  if(type === 'float' || type === 'percentage' || type === 'currency')
    return numText(c.getAttributeNS(NS, 'value') || '');
  if(type === 'date') return String(c.getAttributeNS(NS, 'date-value') || '').replace('T', ' ').replace(/\.\d+$/, '');
  if(type === 'time'){
    const m = /P?T?(?:(\d+)H)?(?:(\d+)M)?(?:([\d.]+)S)?/.exec(c.getAttributeNS(NS, 'time-value') || '');
    return m ? [m[1] || '0', m[2] || '0', String(Math.round(+(m[3] || 0)))].map(x => String(x).padStart(2, '0')).join(':') : '';
  }
  if(type === 'boolean') return /true/i.test(c.getAttributeNS(NS, 'boolean-value') || '') ? 'TRUE' : 'FALSE';
  return [...c.getElementsByTagName('*')].filter(n => n.localName === 'p')
    .map(n => n.textContent).join('\n').trim();
}
function odsRead(xml){
  const doc = xmlDoc(xml);
  if(!doc) throw new Error('that document is not one this can read');
  const TB = 'urn:oasis:names:tc:opendocument:xmlns:table:1.0';
  const rep = (n, a) => clamp0(+(n.getAttributeNS(TB, a) || 1));
  const out = [];
  for(const t of [...doc.getElementsByTagNameNS(TB, 'table')]){
    const rows = [];
    let total = 0, wide = false, blank = 0;
    for(const r of [...t.getElementsByTagNameNS(TB, 'table-row')]){
      const line = [];
      let gap = 0;
      for(const c of [...r.children]){
        if(c.localName !== 'table-cell' && c.localName !== 'covered-table-cell') continue;
        const v = c.localName === 'covered-table-cell' ? '' : odsCell(c);
        const k = rep(c, 'number-columns-repeated');
        /* An empty run is held back rather than written out: a row ends with
           thousands of them, and they are padding. It is only really a gap once
           something turns up on the far side of it. */
        if(v === ''){ gap += k; continue; }
        for(let i = 0; i < gap && line.length < SHEET_MAXC; i++) line.push('');
        gap = 0;
        for(let i = 0; i < k; i++){
          if(line.length >= SHEET_MAXC){ wide = true; break; }
          line.push(v);
        }
      }
      const k = rep(r, 'number-rows-repeated');
      if(!line.length){ blank += k; continue; }        /* …and the same for empty rows */
      for(let i = 0; i < blank && rows.length < SHEET_MAXR; i++){ rows.push([]); total++; }
      blank = 0;
      for(let i = 0; i < k; i++){
        total++;
        if(rows.length < SHEET_MAXR) rows.push(line.slice());
      }
    }
    out.push({ name: t.getAttributeNS(TB, 'name') || ('Sheet' + (out.length + 1)),
               rows: squared(rows), rowsTotal: Math.max(total, rows.length), wide });
  }
  if(!out.length) throw new Error('that document has no sheets in it');
  return out;
}

/* ---- comma-separated anything ----
   Quoted fields the way every spreadsheet writes them: a "" inside quotes is one
   quote, and a newline inside quotes is part of the field rather than the end of
   the line. The separator is worked out from the file itself. */
function csvSniff(text){
  const head = text.slice(0, 65536).split('\n').slice(0, 30);
  let best = ',', bestScore = -1;
  for(const d of [',', ';', '\t', '|']){
    const counts = head.filter(l => l.length).map(l => (l.split(d).length - 1));
    if(!counts.length) continue;
    const n = counts.filter(v => v > 0).length;
    if(!n) continue;
    const first = counts[0];
    /* the one that shows up the same number of times on every line */
    const even = counts.filter(v => v === first && v > 0).length;
    const score = even * 10 + n + first;
    if(score > bestScore){ bestScore = score; best = d; }
  }
  return best;
}
function sheetCSV(text, delim){
  let s = String(text == null ? '' : text).replace(/^﻿/, '');
  const d = delim || csvSniff(s);
  const rows = [];
  let line = [], cell = '', q = false, total = 0;
  const endCell = () => { line.push(cell); cell = ''; };
  const endLine = () => {
    endCell();
    total++;
    if(rows.length < SHEET_MAXR) rows.push(line.length > SHEET_MAXC ? line.slice(0, SHEET_MAXC) : line);
    line = [];
  };
  for(let i = 0; i < s.length; i++){
    const c = s[i];
    if(q){
      if(c !== '"'){ cell += c; continue; }
      if(s[i + 1] === '"'){ cell += '"'; i++; continue; }
      q = false; continue;
    }
    if(c === '"' && cell === ''){ q = true; continue; }
    if(c === d){ endCell(); continue; }
    if(c === '\r'){ if(s[i + 1] === '\n') i++; endLine(); continue; }
    if(c === '\n'){ endLine(); continue; }
    cell += c;
  }
  if(cell !== '' || line.length) endLine();
  while(rows.length && rows[rows.length - 1].every(v => v === '')) rows.pop();
  /* a ; file is nearly always one written where the comma is the decimal point */
  if(d === ';'){
    let hit = 0, miss = 0;
    for(const r of rows) for(const v of r){
      if(/^[-+]?\d+,\d+$/.test(v)) hit++;
      else if(v !== '' && /\d/.test(v)) miss++;
    }
    if(hit > miss) for(const r of rows) for(let i = 0; i < r.length; i++)
      if(/^[-+]?\d+,\d+$/.test(r[i])) r[i] = r[i].replace(',', '.');
  }
  return [{ name:'', rows, rowsTotal: total, wide:false, delim: d }];
}

/* ---- the one call the app makes ---- */
async function sheetRead(file){
  const kind = sheetKind(file);
  if(kind === 'xls')
    throw new Error('that is the old binary .xls format — open it and save it again as .xlsx or .csv');
  if(kind === 'csv') return { kind, name:file.name, sheets: sheetCSV(await file.text()) };
  const buf = await file.arrayBuffer();
  const head = new Uint8Array(buf, 0, Math.min(4, buf.byteLength));
  /* a workbook is a zip; anything else with those extensions is not one */
  if(!(head[0] === 0x50 && head[1] === 0x4b))
    return { kind:'csv', name:file.name, sheets: sheetCSV(new TextDecoder().decode(buf)) };
  if(kind === 'ods') return { kind, name:file.name, sheets: odsRead(await zipText(zipOpen(buf), 'content.xml')) };
  return { kind:'xlsx', name:file.name, sheets: await xlsxRead(buf) };
}
