// Pixel-art picture definitions + optional PNG pictures from /public/images.
// Each picture: a palette map (char → colour) and rows of chars ('.' = empty).
// All six are original, generic subjects.
import pngFiles from 'virtual:png-pictures';

export const PICTURES = [
  {
    name: 'Apple',
    bg: '#8fd3ff',
    palette: { r: '#e8373e', d: '#b01f30', h: '#ff7b7b', w: '#ffffff', g: '#46c44f', G: '#2b8f37', b: '#6b3b1f' },
    rows: [
      '........b.ggG...',
      '........bggggG..',
      '.......b.gggG...',
      '....rr.b..gG....',
      '..rrrrrrrrrrrr..',
      '.rrhhhrrrrrrrrr.',
      'rrrhwhrrrrrrrrrr',
      'rrrhwhrrrrrrrrrr',
      'rrrwhhrrrrrrrrrr',
      'rrrrrrrrrrrrrrrd',
      'rrrrrrrrrrrrrddd',
      'rrrrrrrrrrrrdddd',
      '.rrrrrrrrrrdddd.',
      '..rrrrrrrddddd..',
      '....rrrrdddd....',
      '................',
    ],
  },
  {
    name: 'Fish',
    bg: '#a8f0e4',
    palette: { o: '#ff8a1e', O: '#e5630c', f: '#ff5d2e', w: '#ffffff', k: '#23233a' },
    rows: [
      '.........f..........',
      '........fff........f',
      '......fffff........f',
      '...ooowoooowwo....ff',
      '..oooowoooowwoo..fff',
      '.oowkowoooowwoooofff',
      '.ookkowoooowwoooof..',
      '.ooooowoooowwoooof..',
      '.koooowoooowwoooof..',
      '..oooowoooowwoooofff',
      '...OOOwOOOOwwO...fff',
      '.....Owffffw......ff',
      '........ff.........f',
      '.........f..........',
    ],
  },
  {
    name: 'Heart',
    bg: '#d9c9ff',
    palette: { r: '#ff2d55', d: '#c3123a', h: '#ff8aa3', w: '#ffffff' },
    rows: [
      '...rrr....rrr...',
      '.rrrrrr..rrrrrr.',
      'rrhhrrrrrrrrrrrr',
      'rhwhrrrrrrrrrrrd',
      'rhhrrrrrrrrrrrrd',
      'rrrrrrrrrrrrrrrd',
      'rrrrrrrrrrrrrrdd',
      '.rrrrrrrrrrrrdd.',
      '..rrrrrrrrrrdd..',
      '...rrrrrrrrdd...',
      '....rrrrrrdd....',
      '.....rrrrdd.....',
      '......rrdd......',
      '.......dd.......',
    ],
  },
  {
    name: 'Cupcake',
    bg: '#c4f3d4',
    palette: { t: '#2bb5c9', T: '#1f8fa3', p: '#ff8fc4', P: '#e0609f', l: '#ffc4e1', c: '#e8233a', w: '#ffffff', k: '#5a8a1e', y: '#ffd83a', b: '#4a7dff', g: '#3fcf6a' },
    rows: [
      '.........k......',
      '.......wc.......',
      '......cccc......',
      '.....ppccpg.....',
      '....pllppppp....',
      '...ppppppyppp...',
      '..pplllpyppppp..',
      '..pppbpppppbpp..',
      '.pllllpgpppppgp.',
      '.PPbppppppppyPP.',
      '.TtppppppppppTt.',
      '.TtTtTtTtTtTtTt.',
      '..tTtTtTtTtTtT..',
      '..tTtTtTtTtTtT..',
      '..tTtTtTtTtTtT..',
      '..tTtTtTtTtTtT..',
      '...TtTtTtTtTt...',
      '...TtTtTtTtTt...',
    ],
  },
  {
    name: 'Cat',
    bg: '#fff0a6',
    palette: { o: '#ff9a3c', O: '#d9661a', p: '#ffb3c8', w: '#fff8ef', e: '#2d2d44', n: '#ff6f91', k: '#5a3a2a' },
    rows: [
      '..o............o..',
      '..oo..........oo..',
      '..opoo......oopo..',
      '..oppooooooooppo..',
      '..opppooOOoopppo..',
      '.oooooOoOOoOooooo.',
      '.ooooOooooooOoooo.',
      '.oooooooooooooooo.',
      '.oooewooooooewooo.',
      '.oooeeooooooeeooo.',
      '.oooeeooooooeeooo.',
      '.koooowwnnwwooook.',
      '..kkowwwkkwwwokk..',
      '..oooowkwwkwoooo..',
      '....OOOwwwwOOO....',
      '......OOOOOO......',
    ],
  },
  {
    name: 'Rocket',
    bg: '#34427a',
    palette: { w: '#ffffff', W: '#e3e8f5', s: '#b9c2da', r: '#ff3b3b', R: '#c9202b', g: '#8a93ad', b: '#4ec3ff', l: '#c6f0ff', f: '#ff8a1e', y: '#ffe14d' },
    rows: [
      '.......rr.......',
      '.......rr.......',
      '......rrrr......',
      '......rrrr......',
      '.....rrrrrr.....',
      '.....rrrrrr.....',
      '.....Wwwwws.....',
      '.....Wwggws.....',
      '.....Wglbgs.....',
      '.....Wgbbgs.....',
      '.....Wwggws.....',
      '.....Wwwwws.....',
      '.....Wwwwws.....',
      '....rrrrrrrR....',
      '...rrWwwwwsRR...',
      '...rrWwwwwsRR...',
      '..rr..gggg..RR..',
      '......fyyf......',
      '.......yy.......',
      '.......ff.......',
    ],
  },
];

const MAX_SIZE = 24; // largest grid we accept (bigger PNGs are downscaled)

// Backgrounds auto-assigned to PNG pictures: the one contrasting most wins.
const AUTO_BGS = ['#8fd3ff', '#ffe28a', '#c4f3d4', '#d9c9ff', '#ffc9d9', '#34427a', '#a8f0e4'];

// Turn a string picture into { name, bg, cols, rows, colors[] } cropped to its
// bounding box so it always stands on the floor.
function parseStrings(def) {
  const rows = def.rows;
  const h = rows.length;
  const w = Math.max(...rows.map((r) => r.length));
  const cells = [];
  for (let r = 0; r < h; r++) {
    for (let c = 0; c < w; c++) {
      const ch = rows[r][c] || '.';
      cells.push(ch === '.' || ch === ' ' ? null : def.palette[ch] || null);
    }
  }
  return crop({ name: def.name, bg: def.bg, cols: w, rows: h, colors: cells });
}

function crop(pic) {
  let minC = pic.cols, maxC = -1, minR = pic.rows, maxR = -1;
  for (let r = 0; r < pic.rows; r++) {
    for (let c = 0; c < pic.cols; c++) {
      if (!pic.colors[r * pic.cols + c]) continue;
      if (c < minC) minC = c;
      if (c > maxC) maxC = c;
      if (r < minR) minR = r;
      if (r > maxR) maxR = r;
    }
  }
  if (maxC < 0) return null;
  const cols = maxC - minC + 1;
  const rows = maxR - minR + 1;
  const colors = new Array(cols * rows);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) colors[r * cols + c] = pic.colors[(r + minR) * pic.cols + c + minC];
  }
  return { name: pic.name, bg: pic.bg, cols, rows, colors };
}

const toHex = (r, g, b) => '#' + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1);
const hexRgb = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];

function pickBackground(colors) {
  let r = 0, g = 0, b = 0, n = 0;
  for (const c of colors) {
    if (!c) continue;
    const [cr, cg, cb] = hexRgb(c);
    r += cr; g += cg; b += cb; n++;
  }
  if (!n) return AUTO_BGS[0];
  r /= n; g /= n; b /= n;
  let best = AUTO_BGS[0], bestD = -1;
  for (const bg of AUTO_BGS) {
    const [br, bgc, bb] = hexRgb(bg);
    const d = (br - r) ** 2 + (bgc - g) ** 2 + (bb - b) ** 2;
    if (d > bestD) { bestD = d; best = bg; }
  }
  return best;
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

// PNG → picture. Alpha < 128 = empty. Oversized images are nearest-downscaled.
async function parsePng(url) {
  const img = await loadImage(url);
  let w = img.naturalWidth, h = img.naturalHeight;
  const k = Math.min(1, MAX_SIZE / Math.max(w, h));
  w = Math.max(1, Math.round(w * k));
  h = Math.max(1, Math.round(h * k));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const g = canvas.getContext('2d', { willReadFrequently: true });
  g.imageSmoothingEnabled = false;
  g.drawImage(img, 0, 0, w, h);
  const data = g.getImageData(0, 0, w, h).data;
  const colors = new Array(w * h);
  for (let i = 0; i < w * h; i++) {
    colors[i] = data[i * 4 + 3] < 128 ? null : toHex(data[i * 4], data[i * 4 + 1], data[i * 4 + 2]);
  }
  const file = url.split('/').pop().replace(/\.png$/i, '');
  const name = file.replace(/[-_]+/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase());
  return crop({ name, bg: pickBackground(colors), cols: w, rows: h, colors });
}

const parsed = PICTURES.map(parseStrings);

// Load every PNG listed by the Vite plugin and append it after the built-ins.
export async function loadPngPictures() {
  const base = import.meta.env.BASE_URL || './';
  for (const file of pngFiles) {
    try {
      const pic = await parsePng(base + file);
      if (pic) parsed.push(pic);
    } catch (err) {
      console.warn('[pictures] could not load', file, err);
    }
  }
}

export function pictureCount() {
  return parsed.length;
}

// The list loops forever; HP scaling by index happens in grid.js.
export function getPicture(index) {
  return parsed[((index % parsed.length) + parsed.length) % parsed.length];
}
