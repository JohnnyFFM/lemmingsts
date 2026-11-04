// Draw the app icons from an original 16×16 pixel sketch of a lemming, so no
// artwork from the game ships with the app. Writes public/icons/*.png.
import { mkdirSync, writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SKETCH = [
  '................',
  '......gggg......',
  '.....gggggg.....',
  '....ggggggg.....',
  '....gffffgg.....',
  '....gfkffkg.....',
  '.....ffffff.....',
  '......ffff......',
  '.....bbbbbb.....',
  '....bbbbbbbb....',
  '....bbbbbbbb....',
  '....bbbbbbbb....',
  '.....bbbbbb.....',
  '.....bb..bb.....',
  '.....bb..bb.....',
  '....ggg..ggg....',
];
const COLORS = { g: [0x30, 0xc0, 0x30], f: [0xf8, 0xc0, 0xa0], k: [0x10, 0x10, 0x10], b: [0x30, 0x40, 0xf0] };
const BACKGROUND = [0x10, 0x10, 0x10];

function png(width, height, rgba) {
  const table = new Uint32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = buf => { let c = 0xffffffff; for (const b of buf) c = table[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const body = Buffer.concat([Buffer.from(type), data]); const sum = Buffer.alloc(4); sum.writeUInt32BE(crc(body)); return Buffer.concat([len, body, sum]); };
  const header = Buffer.alloc(13); header.writeUInt32BE(width, 0); header.writeUInt32BE(height, 4); header[8] = 8; header[9] = 6;
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) Buffer.from(rgba.buffer, y * width * 4, width * 4).copy(raw, y * (width * 4 + 1) + 1);
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', header), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

/** Paint the sketch centred in a square; `inset` leaves a safe margin for maskable icons. */
function icon(size, inset) {
  const rgba = new Uint8Array(size * size * 4);
  const cell = Math.floor((size - 2 * inset) / SKETCH.length);
  const origin = Math.floor((size - cell * SKETCH.length) / 2);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const sx = Math.floor((x - origin) / cell), sy = Math.floor((y - origin) / cell);
    const key = SKETCH[sy]?.[sx];
    const color = key && COLORS[key] ? COLORS[key] : BACKGROUND;
    rgba.set([...color, 255], (y * size + x) * 4);
  }
  return png(size, size, rgba);
}

const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'icons');
mkdirSync(out, { recursive: true });
writeFileSync(join(out, 'icon-192.png'), icon(192, 8));
writeFileSync(join(out, 'icon-512.png'), icon(512, 24));
writeFileSync(join(out, 'maskable-512.png'), icon(512, 96));
console.log('icons written to', out);
