// Dessine les icônes de l'appli (un battement d'ECG vert sur écran noir) et les range dans icons/.
// Lancer depuis la racine du dossier : node outils/icones.js
// Aucun module à installer : le PNG est encodé à la main avec zlib.
const fs = require('fs'), zlib = require('zlib'), path = require('path');

const hex = h => [parseInt(h.slice(1,3),16), parseInt(h.slice(3,5),16), parseInt(h.slice(5,7),16)];
const BG = hex('#030605'), GRID = hex('#0c2414'), GREEN = hex('#39f26a'), CORE = hex('#c8ffd6');
const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * Math.min(1, Math.max(0, t)));

// Le battement : même forme que dans l'appli (onde P, complexe QRS, onde T)
const g = (u, c, s) => Math.exp(-(((u - c) / s) ** 2));
const shape = u => 0.1*g(u,.16,.045) - 0.12*g(u,.33,.02) + g(u,.38,.028) - 0.32*g(u,.44,.026) + 0.22*g(u,.68,.08);
const BASE = 0.6, AMP = 0.4, X0 = 0.12, WIDTH = 0.76;
const f = x => BASE - AMP * shape((x - X0) / WIDTH);
const XMIN = -0.2, STEP = 0.0008, WIN = 0.06;
const PTS = Array.from({ length: Math.ceil(1.4 / STEP) + 1 }, (_, i) => { const x = XMIN + i * STEP; return [x, f(x)]; });

// Couleur d'un point (repère 0..1, y vers le bas)
function color(x, y){
  let c = BG;
  // grille fine
  const gx = Math.abs(x * 10 - Math.round(x * 10)), gy = Math.abs((y - BASE) * 10 - Math.round((y - BASE) * 10));
  if(gx < 0.04 || gy < 0.04) c = GRID;
  // distance au tracé : on cherche le point le plus proche parmi les points voisins de la courbe
  let d = Infinity;
  const i0 = Math.max(0, Math.floor((x - WIN - XMIN) / STEP)), i1 = Math.min(PTS.length - 1, Math.ceil((x + WIN - XMIN) / STEP));
  for(let i = i0; i <= i1; i++){ const p = PTS[i], dd = Math.hypot(x - p[0], y - p[1]); if(dd < d) d = dd; }
  c = mix(c, GREEN, 0.55 * Math.exp(-((d / 0.045) ** 2)));   // halo
  if(d < 0.016) c = mix(GREEN, CORE, 1 - d / 0.016);          // trait
  return c;
}

function render(size, maskable){
  const ss = 2, px = Buffer.alloc(size * size * 3);
  // l'icône maskable est un peu réduite pour rester dans la zone sûre
  const k = maskable ? 0.82 : 1;
  for(let j = 0; j < size; j++) for(let i = 0; i < size; i++){
    let r = 0, gr = 0, b = 0;
    for(let sj = 0; sj < ss; sj++) for(let si = 0; si < ss; si++){
      const x = ((i + (si + .5) / ss) / size - .5) / k + .5, y = ((j + (sj + .5) / ss) / size - .5) / k + .5;
      const c = color(x, y); r += c[0]; gr += c[1]; b += c[2];
    }
    const o = (j * size + i) * 3, n = ss * ss;
    px[o] = Math.round(r / n); px[o+1] = Math.round(gr / n); px[o+2] = Math.round(b / n);
  }
  return png(size, px);
}

// --- encodeur PNG (RVB 8 bits) ---
const CRC = new Int32Array(256).map((_, n) => { let c = n; for(let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; return c; });
const crc32 = buf => { let c = -1; for(const b of buf) c = CRC[(c ^ b) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; };
function chunk(type, data){
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]), crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(size, px){
  const raw = Buffer.alloc((size * 3 + 1) * size);
  for(let y = 0; y < size; y++){ raw[y * (size * 3 + 1)] = 0; px.copy(raw, y * (size * 3 + 1) + 1, y * size * 3, (y + 1) * size * 3); }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level:9 })), chunk('IEND', Buffer.alloc(0))]);
}

const out = path.join(__dirname, '..', 'icons');
fs.mkdirSync(out, { recursive:true });
for(const [name, size, maskable] of [['icon-192.png',192], ['icon-512.png',512], ['icon-maskable-512.png',512,true], ['apple-touch-icon.png',180], ['favicon-32.png',32]]){
  fs.writeFileSync(path.join(out, name), render(size, maskable));
  console.log('icons/' + name);
}
