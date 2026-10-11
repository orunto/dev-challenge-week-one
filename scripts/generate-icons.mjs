import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

// Build the project-authored H monogram as actual installable raster icons.
const directory = fileURLToPath(new URL('../apps/web/public/icons/', import.meta.url));
await mkdir(directory, { recursive: true });

function crc32(bytes) {
  let value = 0xffffffff;
  for (const byte of bytes) {
    value ^= byte;
    for (let bit = 0; bit < 8; bit++) {
      value = (value >>> 1) ^ (value & 1 ? 0xedb88320 : 0);
    }
  }
  return (value ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const name = Buffer.from(type);
  const header = Buffer.alloc(4);
  header.writeUInt32BE(data.length);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(Buffer.concat([name, data])));
  return Buffer.concat([header, name, data, checksum]);
}

for (const size of [192, 512]) {
  const pixels = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const sx = (x * 64) / size;
      const sy = (y * 64) / size;
      let color = [61, 95, 88];
      if (
        (sx >= 14 && sx < 24 && sy >= 15 && sy < 49) ||
        (sx >= 40 && sx < 50 && sy >= 15 && sy < 49) ||
        (sx >= 24 && sx < 40 && sy >= 27 && sy < 37)
      ) {
        color = [242, 242, 235];
      }
      if (sx >= 40 && sx < 50 && sy >= 37 && sy < 49) {
        color = [233, 123, 119];
      }
      const offset = y * (size * 4 + 1) + 1 + x * 4;
      pixels[offset] = color[0];
      pixels[offset + 1] = color[1];
      pixels[offset + 2] = color[2];
      pixels[offset + 3] = 255;
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8;
  header[9] = 6;
  await writeFile(
    new URL(`../apps/web/public/icons/icon-${size}.png`, import.meta.url),
    Buffer.concat([
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
      chunk('IHDR', header),
      chunk('IDAT', deflateSync(pixels)),
      chunk('IEND', Buffer.alloc(0)),
    ]),
  );
}
