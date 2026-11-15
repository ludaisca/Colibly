// Genera public/logo-512.png (logo del JSON-LD Organization) desde app/icon.svg:
// mismo glifo, cuadrado de 512x512 con fondo sólido (sin esquinas redondeadas ni
// transparencia, para que buscadores y asistentes lo recorten como quieran).
// Uso (dentro del contenedor): node scripts/make-logo-png.mjs
import { readFileSync } from "node:fs";
import sharp from "sharp";

const svg = readFileSync("app/icon.svg", "utf8").replace(/ rx="9"/, "");
await sharp(Buffer.from(svg), { density: 1536 })
  .resize(512, 512)
  .flatten({ background: "#0F6E7E" })
  .png({ compressionLevel: 9 })
  .toFile("public/logo-512.png");
const meta = await sharp("public/logo-512.png").metadata();
console.log(`public/logo-512.png ${meta.width}x${meta.height} alpha=${meta.hasAlpha}`);
