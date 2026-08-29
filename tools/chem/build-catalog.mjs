#!/usr/bin/env node
/* Build Open Note's offline molecule-name catalog from PubChem.

   The app never runs this file and never contacts PubChem.  It consumes the
   generated js/data/molecules.js file directly.  Run this tool only when the
   catalog is deliberately refreshed.

   Source: PubChem PUG REST, compound properties by CID
   https://pubchem.ncbi.nlm.nih.gov/docs/pug-rest
*/
import fs from 'node:fs/promises';
import vm from 'node:vm';

const ROOT = new URL('../../', import.meta.url);
const TARGET = +(process.argv.find(a => /^--target=/.test(a)) || '').split('=')[1] || 10000;
const BATCH = 100;
const CONCURRENCY = 4;
const MAX_ATOMS = 96;

const elements = await fs.readFile(new URL('js/data/elements.js', ROOT), 'utf8');
const chemistry = await fs.readFile(new URL('js/lib/chem.js', ROOT), 'utf8');
const box = { console };
vm.createContext(box);
vm.runInContext(elements + '\n' + chemistry +
  '\nglobalThis.__catalogApi = { CHEM_LIB_SRC, chemParse, chemLayout, chemHash };', box);
const { CHEM_LIB_SRC, chemParse, chemLayout, chemHash } = box.__catalogApi;

const clean = value => String(value || '')
  .replace(/[\t\r\n\x00-\x1f]+/g, ' ')
  .replace(/`/g, "'")
  .replace(/\$\{/g, '$ {')
  .replace(/\s+/g, ' ')
  .trim();
const key = value => clean(value).toLowerCase();

const baseHashes = new Set();
for(const line of CHEM_LIB_SRC.trim().split('\n')){
  const smiles = line.split('|')[1];
  const molecule = chemParse(smiles);
  if(!molecule.err.length) baseHashes.add(chemHash(molecule));
}

const wanted = TARGET - baseHashes.size;
if(wanted < 1) throw new Error(`target ${TARGET} is smaller than the ${baseHashes.size} built-in structures`);

const rows = [];
const seenHashes = new Set(baseHashes);

function accept(title, iupac, smiles, cid){
  title = clean(title); iupac = clean(iupac); smiles = clean(smiles);
  if(!title || !smiles) return;
  const molecule = chemParse(smiles);
  if(molecule.err.length || !molecule.atoms.length || molecule.atoms.length > MAX_ATOMS) return;
  let laid;
  try { laid = chemLayout(molecule); } catch { return; }
  if(laid.atoms.some(a => !Number.isFinite(a.x) || !Number.isFinite(a.y))) return;
  const hash = chemHash(molecule);
  if(seenHashes.has(hash)) return;
  seenHashes.add(hash);
  rows.push({ hash, name: title, smiles, alias: key(iupac) === key(title) ? '' : iupac, cid });
}

/* The molecule that prompted the larger catalog lives far outside the early
   CID range used below, so keep it as an explicit, source-identifiable seed. */
accept('3-Oxetanone', 'oxetan-3-one', 'C1C(=O)CO1', 15024254);

async function fetchBatch(first){
  const ids = Array.from({ length: BATCH }, (_, i) => first + i).join(',');
  const url = 'https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/cid/' + ids +
    '/property/Title,IUPACName,CanonicalSMILES/JSON';
  for(let attempt = 1; attempt <= 5; attempt++){
    const response = await fetch(url, { headers: { 'user-agent': 'OpenNote-catalog-builder/1.0' } });
    if(response.ok){
      const json = await response.json();
      return json.PropertyTable?.Properties || [];
    }
    if(attempt === 5) throw new Error(`PubChem ${response.status} for CIDs ${first}-${first + BATCH - 1}`);
    await new Promise(resolve => setTimeout(resolve, attempt * 750));
  }
}

let nextCid = 1;
while(rows.length < wanted){
  const starts = Array.from({ length: CONCURRENCY }, (_, i) => nextCid + i * BATCH);
  const groups = await Promise.all(starts.map(fetchBatch));
  const compounds = groups.flat().sort((a, b) => a.CID - b.CID);
  for(const p of compounds){
    if(rows.length >= wanted) break;
    accept(p.Title, p.IUPACName, p.ConnectivitySMILES || p.CanonicalSMILES, p.CID);
  }
  nextCid += BATCH * CONCURRENCY;
  if(nextCid % 2000 === 1) console.error(`${baseHashes.size + rows.length}/${TARGET} structures (through CID ${nextCid - 1})`);
}

rows.sort((a, b) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }) || a.cid - b.cid);
const body = rows.map(r => [r.hash, r.name, r.smiles, r.alias, r.cid].join('\t')).join('\n');
const today = new Date().toISOString().slice(0, 10);
const output = `/* Open Note — generated offline molecule catalog
   ${rows.length} additional unique structures; ${TARGET} with the hand-picked catalog.
   PubChem PUG REST snapshot ${today}.  Regenerate with:
     node tools/chem/build-catalog.mjs --target=${TARGET}

   hash<TAB>canonical name<TAB>SMILES<TAB>IUPAC alias<TAB>PubChem CID
*/
const CHEM_CATALOG_SRC = String.raw\`
${body}\`;
`;
await fs.writeFile(new URL('js/data/molecules.js', ROOT), output);
console.error(`wrote ${rows.length} records; ${TARGET} unique structures total`);
