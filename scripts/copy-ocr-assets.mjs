import { copyFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const destination = path.join(projectRoot, 'public', 'ocr');
const assets = [
  ['node_modules/tesseract.js/dist/worker.min.js', 'worker.min.js'],
  ['node_modules/tesseract.js-core/tesseract-core-lstm.wasm.js', 'tesseract-core-lstm.wasm.js'],
  ['node_modules/tesseract.js-core/tesseract-core-lstm.wasm', 'tesseract-core-lstm.wasm'],
];

await mkdir(destination, { recursive: true });
for (const [source, filename] of assets) {
  const sourcePath = path.join(projectRoot, source);
  const destinationPath = path.join(destination, filename);
  await copyFile(sourcePath, destinationPath);
  process.stdout.write(`Prepared ${path.relative(projectRoot, destinationPath)}\n`);
}
