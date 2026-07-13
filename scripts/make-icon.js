// KafkaPilot 아이콘 생성 스크립트
// SVG → icon.ico (Windows BMP DIB) + icon.icns (macOS PNG-in-ICNS)
const sharp = require("sharp");
const fs = require("fs");
const path = require("path");

// Windows ICO 사이즈
const ICO_SIZES = [256, 48, 32, 16];

// macOS ICNS 사이즈 및 타입 코드 (PNG-in-ICNS, macOS 10.7+)
const ICNS_ENTRIES = [
  { size: 16,   type: "icp4" },
  { size: 32,   type: "icp5" },
  { size: 64,   type: "icp6" },
  { size: 128,  type: "ic07" },
  { size: 256,  type: "ic08" },
  { size: 512,  type: "ic09" },
  { size: 1024, type: "ic10" },
];

function makeSvg(size) {
  const border = Math.max(1.5, size * 0.055);
  const radius = size * 0.18;
  const half = border / 2;
  const inner = size - border;
  const fontSize = Math.max(6, Math.floor(size * 0.42));
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">
    <rect width="${size}" height="${size}" fill="#0d141f"/>
    <rect x="${half}" y="${half}" width="${inner}" height="${inner}"
          rx="${radius}" ry="${radius}"
          fill="none" stroke="#3794ff" stroke-width="${border}"/>
    <text x="${size / 2}" y="${size / 2}"
          text-anchor="middle" dominant-baseline="middle"
          font-family="Arial, Helvetica, sans-serif" font-weight="700"
          font-size="${fontSize}" fill="#3794ff">KP</text>
  </svg>`;
}

// RGBA → BMP DIB (bottom-up BGRA) + AND 마스크
function toDib(rgba, size) {
  const pixelCount = size * size;
  const maskStride = Math.ceil(size / 32) * 4;
  const buf = Buffer.alloc(40 + pixelCount * 4 + maskStride * size);
  let p = 0;

  buf.writeUInt32LE(40, p); p += 4;
  buf.writeInt32LE(size, p); p += 4;
  buf.writeInt32LE(size * 2, p); p += 4;
  buf.writeUInt16LE(1, p); p += 2;
  buf.writeUInt16LE(32, p); p += 2;
  buf.writeUInt32LE(0, p); p += 4;
  buf.writeUInt32LE(pixelCount * 4, p); p += 4;
  buf.writeInt32LE(0, p); p += 4;
  buf.writeInt32LE(0, p); p += 4;
  buf.writeUInt32LE(0, p); p += 4;
  buf.writeUInt32LE(0, p); p += 4;

  // 픽셀 데이터 (bottom-up, BGRA)
  for (let y = size - 1; y >= 0; y--) {
    for (let x = 0; x < size; x++) {
      const src = (y * size + x) * 4;
      buf[p++] = rgba[src + 2]; // B
      buf[p++] = rgba[src + 1]; // G
      buf[p++] = rgba[src + 0]; // R
      buf[p++] = rgba[src + 3]; // A
    }
  }

  // AND 마스크 (32-bit 알파로 처리하므로 전부 0)
  buf.fill(0, p);
  return buf;
}

async function getPng(size) {
  return sharp(Buffer.from(makeSvg(size))).resize(size, size).png().toBuffer();
}

async function buildIco() {
  const dibs = [];
  for (const size of ICO_SIZES) {
    const png = await getPng(size);
    const rgba = await sharp(png).ensureAlpha().raw().toBuffer();
    dibs.push(toDib(rgba, size));
  }

  const count = ICO_SIZES.length;
  const dirOffset = 6 + 16 * count;
  let totalSize = dirOffset;
  dibs.forEach((d) => (totalSize += d.length));

  const ico = Buffer.alloc(totalSize);
  let pos = 0;
  ico.writeUInt16LE(0, pos); pos += 2;
  ico.writeUInt16LE(1, pos); pos += 2;
  ico.writeUInt16LE(count, pos); pos += 2;

  let imgOffset = dirOffset;
  for (let i = 0; i < count; i++) {
    const s = ICO_SIZES[i];
    ico[pos++] = s >= 256 ? 0 : s;
    ico[pos++] = s >= 256 ? 0 : s;
    ico[pos++] = 0; ico[pos++] = 0;
    ico.writeUInt16LE(1, pos); pos += 2;
    ico.writeUInt16LE(32, pos); pos += 2;
    ico.writeUInt32LE(dibs[i].length, pos); pos += 4;
    ico.writeUInt32LE(imgOffset, pos); pos += 4;
    imgOffset += dibs[i].length;
  }
  for (const dib of dibs) { dib.copy(ico, pos); pos += dib.length; }

  const outPath = path.join(__dirname, "../build/icon.ico");
  fs.writeFileSync(outPath, ico);
  console.log(`ICO: ${outPath} (${(ico.length / 1024).toFixed(1)}KB)`);
}

async function buildIcns() {
  const blocks = [];
  for (const { size, type } of ICNS_ENTRIES) {
    const png = await getPng(size);
    const header = Buffer.alloc(8);
    header.write(type, 0, "ascii");
    header.writeUInt32BE(8 + png.length, 4);
    blocks.push(Buffer.concat([header, png]));
  }

  const bodyLen = blocks.reduce((s, b) => s + b.length, 0);
  const fileHeader = Buffer.alloc(8);
  fileHeader.write("icns", 0, "ascii");
  fileHeader.writeUInt32BE(8 + bodyLen, 4);

  const outPath = path.join(__dirname, "../build/icon.icns");
  fs.writeFileSync(outPath, Buffer.concat([fileHeader, ...blocks]));
  console.log(`ICNS: ${outPath} (${((8 + bodyLen) / 1024).toFixed(1)}KB)`);
}

async function main() {
  await buildIco();
  await buildIcns();
}

main().catch((e) => { console.error(e); process.exit(1); });
