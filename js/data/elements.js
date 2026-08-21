/* Open Note — data/elements.js
   the two tables js/lib/chem.js works from: the 118 elements, and a library of
   molecules it can name what you draw against. Data only — no code, no DOM. */

/* ================= the elements =================
   One line each: symbol name mass electronegativity group period block
   category covalent-radius vdW-radius CPK-colour valences. '-' is none; a
   group of 0 is the f-block rows drawn under the table. Masses are the IUPAC
   abridged weights, radii in Å (Cordero / Mantina), colours the Jmol set. */
const CHEM_EL_SRC = `
H Hydrogen 1.008 2.20 1 1 s n .31 1.20 #FFFFFF 1
He Helium 4.0026 - 18 1 s g .28 1.40 #D9FFFF 0
Li Lithium 6.94 .98 1 2 s a 1.28 1.82 #CC80FF 1
Be Beryllium 9.0122 1.57 2 2 s e .96 1.53 #C2FF00 2
B Boron 10.81 2.04 13 2 p m .84 1.92 #FFB5B5 3
C Carbon 12.011 2.55 14 2 p n .76 1.70 #909090 4
N Nitrogen 14.007 3.04 15 2 p n .71 1.55 #3050F8 3
O Oxygen 15.999 3.44 16 2 p n .66 1.52 #FF0D0D 2
F Fluorine 18.998 3.98 17 2 p h .57 1.47 #90E050 1
Ne Neon 20.180 - 18 2 p g .58 1.54 #B3E3F5 0
Na Sodium 22.990 .93 1 3 s a 1.66 2.27 #AB5CF2 1
Mg Magnesium 24.305 1.31 2 3 s e 1.41 1.73 #8AFF00 2
Al Aluminium 26.982 1.61 13 3 p p 1.21 1.84 #BFA6A6 3
Si Silicon 28.085 1.90 14 3 p m 1.11 2.10 #F0C8A0 4
P Phosphorus 30.974 2.19 15 3 p n 1.07 1.80 #FF8000 3,5
S Sulfur 32.06 2.58 16 3 p n 1.05 1.80 #FFFF30 2,4,6
Cl Chlorine 35.45 3.16 17 3 p h 1.02 1.75 #1FF01F 1,3,5,7
Ar Argon 39.948 - 18 3 p g 1.06 1.88 #80D1E3 0
K Potassium 39.098 .82 1 4 s a 2.03 2.75 #8F40D4 1
Ca Calcium 40.078 1.00 2 4 s e 1.76 2.31 #3DFF00 2
Sc Scandium 44.956 1.36 3 4 d t 1.70 2.11 #E6E6E6 3
Ti Titanium 47.867 1.54 4 4 d t 1.60 2.00 #BFC2C7 4
V Vanadium 50.942 1.63 5 4 d t 1.53 2.00 #A6A6AB 5
Cr Chromium 51.996 1.66 6 4 d t 1.39 2.00 #8A99C7 3,6
Mn Manganese 54.938 1.55 7 4 d t 1.39 2.00 #9C7AC7 2,4,7
Fe Iron 55.845 1.83 8 4 d t 1.32 2.00 #E06633 2,3
Co Cobalt 58.933 1.88 9 4 d t 1.26 2.00 #F090A0 2,3
Ni Nickel 58.693 1.91 10 4 d t 1.24 1.63 #50D050 2
Cu Copper 63.546 1.90 11 4 d t 1.32 1.40 #C88033 1,2
Zn Zinc 65.38 1.65 12 4 d t 1.22 1.39 #7D80B0 2
Ga Gallium 69.723 1.81 13 4 p p 1.22 1.87 #C28F8F 3
Ge Germanium 72.630 2.01 14 4 p m 1.20 2.11 #668F8F 4
As Arsenic 74.922 2.18 15 4 p m 1.19 1.85 #BD80E3 3,5
Se Selenium 78.971 2.55 16 4 p n 1.20 1.90 #FFA100 2,4,6
Br Bromine 79.904 2.96 17 4 p h 1.20 1.85 #A62929 1,3,5,7
Kr Krypton 83.798 3.00 18 4 p g 1.16 2.02 #5CB8D1 0,2
Rb Rubidium 85.468 .82 1 5 s a 2.20 3.03 #702EB0 1
Sr Strontium 87.62 .95 2 5 s e 1.95 2.49 #00FF00 2
Y Yttrium 88.906 1.22 3 5 d t 1.90 2.19 #94FFFF 3
Zr Zirconium 91.224 1.33 4 5 d t 1.75 2.06 #94E0E0 4
Nb Niobium 92.906 1.6 5 5 d t 1.64 2.07 #73C2C9 5
Mo Molybdenum 95.95 2.16 6 5 d t 1.54 2.09 #54B5B5 6
Tc Technetium 97 1.9 7 5 d t 1.47 2.09 #3B9E9E 7
Ru Ruthenium 101.07 2.2 8 5 d t 1.46 2.07 #248F8F 3,4
Rh Rhodium 102.91 2.28 9 5 d t 1.42 1.95 #0A7D8C 3
Pd Palladium 106.42 2.20 10 5 d t 1.39 2.02 #006985 2,4
Ag Silver 107.87 1.93 11 5 d t 1.45 1.72 #C0C0C0 1
Cd Cadmium 112.41 1.69 12 5 d t 1.44 1.58 #FFD98F 2
In Indium 114.82 1.78 13 5 p p 1.42 1.93 #A67573 3
Sn Tin 118.71 1.96 14 5 p p 1.39 2.17 #668080 2,4
Sb Antimony 121.76 2.05 15 5 p m 1.39 2.06 #9E63B5 3,5
Te Tellurium 127.60 2.1 16 5 p m 1.38 2.06 #D47A00 2,4,6
I Iodine 126.90 2.66 17 5 p h 1.39 1.98 #940094 1,3,5,7
Xe Xenon 131.29 2.6 18 5 p g 1.40 2.16 #429EB0 0,2,4,6
Cs Caesium 132.91 .79 1 6 s a 2.44 3.43 #57178F 1
Ba Barium 137.33 .89 2 6 s e 2.15 2.68 #00C900 2
La Lanthanum 138.91 1.1 3 6 f l 2.07 2.40 #70D4FF 3
Ce Cerium 140.12 1.12 0 6 f l 2.04 2.35 #FFFFC7 3,4
Pr Praseodymium 140.91 1.13 0 6 f l 2.03 2.39 #D9FFC7 3
Nd Neodymium 144.24 1.14 0 6 f l 2.01 2.29 #C7FFC7 3
Pm Promethium 145 1.13 0 6 f l 1.99 2.36 #A3FFC7 3
Sm Samarium 150.36 1.17 0 6 f l 1.98 2.29 #8FFFC7 3
Eu Europium 151.96 1.2 0 6 f l 1.98 2.33 #61FFC7 3
Gd Gadolinium 157.25 1.2 0 6 f l 1.96 2.37 #45FFC7 3
Tb Terbium 158.93 1.2 0 6 f l 1.94 2.21 #30FFC7 3
Dy Dysprosium 162.50 1.22 0 6 f l 1.92 2.29 #1FFFC7 3
Ho Holmium 164.93 1.23 0 6 f l 1.92 2.16 #00FF9C 3
Er Erbium 167.26 1.24 0 6 f l 1.89 2.35 #00E675 3
Tm Thulium 168.93 1.25 0 6 f l 1.90 2.27 #00D452 3
Yb Ytterbium 173.05 1.1 0 6 f l 1.87 2.42 #00BF38 3
Lu Lutetium 174.97 1.27 0 6 f l 1.87 2.21 #00AB24 3
Hf Hafnium 178.49 1.3 4 6 d t 1.75 2.12 #4DC2FF 4
Ta Tantalum 180.95 1.5 5 6 d t 1.70 2.17 #4DA6FF 5
W Tungsten 183.84 2.36 6 6 d t 1.62 2.10 #2194D6 6
Re Rhenium 186.21 1.9 7 6 d t 1.51 2.17 #267DAB 7
Os Osmium 190.23 2.2 8 6 d t 1.44 2.16 #266696 4
Ir Iridium 192.22 2.20 9 6 d t 1.41 2.02 #175487 3,4
Pt Platinum 195.08 2.28 10 6 d t 1.36 1.75 #D0D0E0 2,4
Au Gold 196.97 2.54 11 6 d t 1.36 1.66 #FFD123 1,3
Hg Mercury 200.59 2.00 12 6 d t 1.32 1.55 #B8B8D0 1,2
Tl Thallium 204.38 1.62 13 6 p p 1.45 1.96 #A6544D 1,3
Pb Lead 207.2 2.33 14 6 p p 1.46 2.02 #575961 2,4
Bi Bismuth 208.98 2.02 15 6 p p 1.48 2.07 #9E4FB5 3,5
Po Polonium 209 2.0 16 6 p p 1.40 1.97 #AB5C00 2,4
At Astatine 210 2.2 17 6 p h 1.50 2.02 #754F45 1
Rn Radon 222 2.2 18 6 p g 1.50 2.20 #428296 0
Fr Francium 223 .7 1 7 s a 2.60 3.48 #420066 1
Ra Radium 226 .9 2 7 s e 2.21 2.83 #007D00 2
Ac Actinium 227 1.1 3 7 f c 2.15 2.47 #70ABFA 3
Th Thorium 232.04 1.3 0 7 f c 2.06 2.45 #00BAFF 4
Pa Protactinium 231.04 1.5 0 7 f c 2.00 2.43 #00A1FF 5
U Uranium 238.03 1.38 0 7 f c 1.96 2.41 #008FFF 6
Np Neptunium 237 1.36 0 7 f c 1.90 2.39 #0080FF 5
Pu Plutonium 244 1.28 0 7 f c 1.87 2.43 #006BFF 4
Am Americium 243 1.3 0 7 f c 1.80 2.44 #545CF2 3
Cm Curium 247 1.3 0 7 f c 1.69 2.45 #785CE3 3
Bk Berkelium 247 1.3 0 7 f c 1.68 2.44 #8A4FE3 3
Cf Californium 251 1.3 0 7 f c 1.68 2.45 #A136D4 3
Es Einsteinium 252 1.3 0 7 f c 1.65 2.45 #B31FD4 3
Fm Fermium 257 1.3 0 7 f c 1.67 2.45 #B31FBA 3
Md Mendelevium 258 1.3 0 7 f c 1.73 2.46 #B30DA6 3
No Nobelium 259 1.3 0 7 f c 1.76 2.46 #BD0D87 2,3
Lr Lawrencium 266 1.3 0 7 f c 1.61 2.46 #C70066 3
Rf Rutherfordium 267 - 4 7 d t 1.57 2.46 #CC0059 4
Db Dubnium 268 - 5 7 d t 1.49 2.46 #D1004F 5
Sg Seaborgium 269 - 6 7 d t 1.43 2.46 #D90045 6
Bh Bohrium 270 - 7 7 d t 1.41 2.46 #E00038 7
Hs Hassium 269 - 8 7 d t 1.34 2.46 #E6002E 8
Mt Meitnerium 278 - 9 7 d u 1.29 2.46 #EB0026 0
Ds Darmstadtium 281 - 10 7 d u 1.28 2.46 #EB0026 0
Rg Roentgenium 282 - 11 7 d u 1.21 2.46 #EB0026 0
Cn Copernicium 285 - 12 7 d u 1.22 2.46 #EB0026 0
Nh Nihonium 286 - 13 7 p u 1.36 2.46 #EB0026 0
Fl Flerovium 289 - 14 7 p u 1.43 2.46 #EB0026 0
Mc Moscovium 290 - 15 7 p u 1.62 2.46 #EB0026 0
Lv Livermorium 293 - 16 7 p u 1.75 2.46 #EB0026 0
Ts Tennessine 294 - 17 7 p u 1.65 2.46 #EB0026 0
Og Oganesson 294 - 18 7 p u 1.57 2.46 #EB0026 0`;


/* ================= the library =================
   Molecules a student meets, as name|SMILES|shelf. Typed into the ⌕ box they
   come onto the page laid out; drawn by hand they are recognised through
   their hash and named in the info strip. Shelves: i inorganic & ions,
   o organic, a aromatic & heterocycles, b biochemistry, d everyday & medicines. */
const CHEM_LIB_SRC = `
water|O|i
hydrogen peroxide|OO|i
ammonia|N|i
hydrazine|NN|i
methane|C|i
carbon dioxide|O=C=O|i
carbon monoxide|[C-]#[O+]|i
hydrogen chloride|Cl|i
hydrogen fluoride|F|i
hydrogen sulfide|S|i
hydrogen cyanide|C#N|i
sulfur dioxide|O=S=O|i
sulfur trioxide|O=S(=O)=O|i
nitric oxide|[N]=O|i
nitrogen dioxide|O=[N+][O-]|i
nitrous oxide|[N-]=[N+]=O|i
ozone|[O-][O+]=O|i
boron trifluoride|FB(F)F|i
phosphorus trichloride|ClP(Cl)Cl|i
phosphorus pentachloride|ClP(Cl)(Cl)(Cl)Cl|i
sulfur tetrafluoride|FS(F)(F)F|i
sulfur hexafluoride|FS(F)(F)(F)(F)F|i
chlorine trifluoride|FCl(F)F|i
xenon difluoride|F[Xe]F|i
xenon tetrafluoride|F[Xe](F)(F)F|i
sulfuric acid|OS(=O)(=O)O|i
nitric acid|O[N+](=O)[O-]|i
phosphoric acid|OP(=O)(O)O|i
carbonic acid|OC(=O)O|i
ammonium|[NH4+]|i
hydronium|[OH3+]|i
hydroxide|[OH-]|i
nitrate|[O-][N+](=O)[O-]|i
nitrite|[O-]N=O|i
sulfate|[O-]S(=O)(=O)[O-]|i
carbonate|[O-]C(=O)[O-]|i
bicarbonate|OC(=O)[O-]|i
phosphate|[O-]P(=O)([O-])[O-]|i
perchlorate|[O-]Cl(=O)(=O)=O|i
permanganate|[O-][Mn](=O)(=O)=O|i
cyanide|[C-]#N|i
sodium chloride|[Na+].[Cl-]|i
ethane|CC|o
propane|CCC|o
butane|CCCC|o
isobutane|CC(C)C|o
pentane|CCCCC|o
hexane|CCCCCC|o
octane|CCCCCCCC|o
ethene|C=C|o
propene|CC=C|o
ethyne|C#C|o
1,3-butadiene|C=CC=C|o
isoprene|CC(=C)C=C|o
cyclopropane|C1CC1|o
cyclobutane|C1CCC1|o
cyclopentane|C1CCCC1|o
cyclohexane|C1CCCCC1|o
cyclohexene|C1CCC=CC1|o
methanol|CO|o
ethanol|CCO|o
propanol|CCCO|o
isopropanol|CC(C)O|o
tert-butanol|CC(C)(C)O|o
ethylene glycol|OCCO|o
glycerol|OCC(O)CO|o
diethyl ether|CCOCC|o
tetrahydrofuran|C1CCOC1|o
1,4-dioxane|C1COCCO1|o
ethylene oxide|C1CO1|o
formaldehyde|C=O|o
acetaldehyde|CC=O|o
acetone|CC(C)=O|o
butanone|CCC(C)=O|o
formic acid|OC=O|o
acetic acid|CC(=O)O|o
propanoic acid|CCC(=O)O|o
butanoic acid|CCCC(=O)O|o
oxalic acid|OC(=O)C(=O)O|o
lactic acid|CC(O)C(=O)O|o
citric acid|OC(=O)CC(O)(CC(=O)O)C(=O)O|o
ethyl acetate|CCOC(C)=O|o
methyl acetate|COC(C)=O|o
acetic anhydride|CC(=O)OC(C)=O|o
acetyl chloride|CC(=O)Cl|o
acetamide|CC(N)=O|o
acetonitrile|CC#N|o
methylamine|CN|o
dimethylamine|CNC|o
trimethylamine|CN(C)C|o
ethylamine|CCN|o
urea|NC(N)=O|o
dimethyl sulfoxide|CS(C)=O|o
dimethylformamide|CN(C)C=O|o
chloromethane|CCl|o
dichloromethane|ClCCl|o
chloroform|ClC(Cl)Cl|o
carbon tetrachloride|ClC(Cl)(Cl)Cl|o
chloroethane|CCCl|o
vinyl chloride|C=CCl|o
tetrafluoroethene|FC(F)=C(F)F|o
acrylic acid|C=CC(=O)O|o
methyl methacrylate|COC(=O)C(C)=C|o
acetylacetone|CC(=O)CC(C)=O|o
benzene|c1ccccc1|a
toluene|Cc1ccccc1|a
o-xylene|Cc1ccccc1C|a
p-xylene|Cc1ccc(C)cc1|a
ethylbenzene|CCc1ccccc1|a
cumene|CC(C)c1ccccc1|a
mesitylene|Cc1cc(C)cc(C)c1|a
styrene|C=Cc1ccccc1|a
phenol|Oc1ccccc1|a
anisole|COc1ccccc1|a
aniline|Nc1ccccc1|a
benzaldehyde|O=Cc1ccccc1|a
benzoic acid|OC(=O)c1ccccc1|a
acetophenone|CC(=O)c1ccccc1|a
nitrobenzene|[O-][N+](=O)c1ccccc1|a
chlorobenzene|Clc1ccccc1|a
bromobenzene|Brc1ccccc1|a
benzyl alcohol|OCc1ccccc1|a
biphenyl|c1ccc(cc1)-c1ccccc1|a
naphthalene|c1ccc2ccccc2c1|a
anthracene|c1ccc2cc3ccccc3cc2c1|a
phenanthrene|c1ccc2c(c1)ccc1ccccc12|a
pyridine|c1ccncc1|a
pyrimidine|c1cncnc1|a
pyrazine|c1cnccn1|a
pyrrole|c1cc[nH]c1|a
furan|c1ccoc1|a
thiophene|c1ccsc1|a
imidazole|c1cnc[nH]1|a
pyrazole|c1cn[nH]c1|a
oxazole|c1cocn1|a
thiazole|c1cscn1|a
indole|c1ccc2[nH]ccc2c1|a
quinoline|c1ccc2ncccc2c1|a
purine|c1ncc2[nH]cnc2n1|a
hydroquinone|Oc1ccc(O)cc1|a
p-benzoquinone|O=C1C=CC(=O)C=C1|a
salicylic acid|OC(=O)c1ccccc1O|a
terephthalic acid|OC(=O)c1ccc(cc1)C(=O)O|a
phthalic anhydride|O=C1OC(=O)c2ccccc12|a
glycine|NCC(=O)O|b
alanine|CC(N)C(=O)O|b
valine|CC(C)C(N)C(=O)O|b
leucine|CC(C)CC(N)C(=O)O|b
isoleucine|CCC(C)C(N)C(=O)O|b
serine|NC(CO)C(=O)O|b
threonine|CC(O)C(N)C(=O)O|b
cysteine|NC(CS)C(=O)O|b
methionine|CSCCC(N)C(=O)O|b
phenylalanine|NC(Cc1ccccc1)C(=O)O|b
tyrosine|NC(Cc1ccc(O)cc1)C(=O)O|b
tryptophan|NC(Cc1c[nH]c2ccccc12)C(=O)O|b
histidine|NC(Cc1c[nH]cn1)C(=O)O|b
aspartic acid|NC(CC(=O)O)C(=O)O|b
glutamic acid|NC(CCC(=O)O)C(=O)O|b
asparagine|NC(CC(N)=O)C(=O)O|b
glutamine|NC(CCC(N)=O)C(=O)O|b
lysine|NCCCCC(N)C(=O)O|b
arginine|NC(CCCNC(N)=N)C(=O)O|b
proline|OC(=O)C1CCCN1|b
glucose|OCC1OC(O)C(O)C(O)C1O|b
glucose (open chain)|OCC(O)C(O)C(O)C(O)C=O|b
fructose|OCC1(O)OCC(O)C(O)C1O|b
ribose|OCC1OC(O)C(O)C1O|b
deoxyribose|OCC1OC(O)CC1O|b
sucrose|OCC1OC(OC2(CO)OC(CO)C(O)C2O)C(O)C(O)C1O|b
adenine|Nc1ncnc2[nH]cnc12|b
guanine|Nc1nc2[nH]cnc2c(=O)[nH]1|b
cytosine|Nc1cc[nH]c(=O)n1|b
thymine|Cc1c[nH]c(=O)[nH]c1=O|b
uracil|O=c1cc[nH]c(=O)[nH]1|b
pyruvic acid|CC(=O)C(=O)O|b
GABA|NCCCC(=O)O|b
ethanolamine|NCCO|b
choline|C[N+](C)(C)CCO|b
acetylcholine|CC(=O)OCC[N+](C)(C)C|b
dopamine|NCCc1ccc(O)c(O)c1|b
adrenaline|CNCC(O)c1ccc(O)c(O)c1|b
serotonin|NCCc1c[nH]c2ccc(O)cc12|b
histamine|NCCc1c[nH]cn1|b
ascorbic acid|OCC(O)C1OC(=O)C(O)=C1O|b
palmitic acid|CCCCCCCCCCCCCCCC(=O)O|b
stearic acid|CCCCCCCCCCCCCCCCCC(=O)O|b
oleic acid|CCCCCCCCC=CCCCCCCCC(=O)O|b
cholesterol|CC(C)CCCC(C)C1CCC2C1(CCC3C2CC=C4C3(CCC(C4)O)C)C|b
testosterone|CC12CCC3C(CCC4=CC(=O)CCC34C)C1CCC2O|b
estradiol|CC12CCC3c4ccc(O)cc4CCC3C1CCC2O|b
caffeine|Cn1cnc2c1c(=O)n(C)c(=O)n2C|d
theobromine|Cn1cnc2c1c(=O)[nH]c(=O)n2C|d
aspirin|CC(=O)Oc1ccccc1C(=O)O|d
paracetamol|CC(=O)Nc1ccc(O)cc1|d
ibuprofen|CC(C)Cc1ccc(cc1)C(C)C(=O)O|d
penicillin G|CC1(C)SC2C(NC(=O)Cc3ccccc3)C(=O)N2C1C(=O)O|d
nicotine|CN1CCCC1c1cccnc1|d
vanillin|COc1cc(C=O)ccc1O|d
menthol|CC(C)C1CCC(C)CC1O|d
limonene|CC1=CCC(CC1)C(C)=C|d
capsaicin|COc1cc(CNC(=O)CCCCC=CC(C)C)ccc1O|d
baking soda|OC(=O)[O-].[Na+]|d
bleach|[O-]Cl.[Na+]|d`;
