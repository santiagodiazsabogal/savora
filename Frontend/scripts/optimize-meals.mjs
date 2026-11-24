// Optimiza las imágenes de selección de tipo de plato.
// Se muestran como miniaturas cuadradas (aspect-square + object-cover) en un grid,
// así que 640x640 calidad 80 es más que suficiente y baja el peso ~30x.
// Uso temporal: node scripts/optimize-meals.mjs  (sharp instalado con --no-save)
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';

// Ruta relativa al cwd (se ejecuta desde la raíz del Frontend) para evitar
// problemas con espacios codificados (%20) en las URLs de import.meta.
const mealsDir = join(process.cwd(), 'public', 'images', 'meals');

const files = readdirSync(mealsDir).filter((f) => /\.jpe?g$/i.test(f));

let beforeTotal = 0;
let afterTotal = 0;

for (const file of files) {
  const path = join(mealsDir, file);
  const before = statSync(path).size;
  // Leer a buffer primero para poder sobrescribir el mismo archivo con seguridad.
  const input = readFileSync(path);
  const output = await sharp(input)
    .resize(640, 640, { fit: 'cover', position: 'centre' })
    .jpeg({ quality: 80, mozjpeg: true })
    .toBuffer();
  writeFileSync(path, output);
  const after = output.length;
  beforeTotal += before;
  afterTotal += after;
  const kb = (n) => (n / 1024).toFixed(0);
  console.log(`${file}: ${kb(before)} KB -> ${kb(after)} KB`);
}

const mb = (n) => (n / 1024 / 1024).toFixed(2);
console.log(`\nTOTAL: ${mb(beforeTotal)} MB -> ${mb(afterTotal)} MB`);
