import { cp, mkdir, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = path.join(root, 'dist');

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
await cp(path.join(root, 'index.html'), path.join(output, 'index.html'));
await cp(path.join(root, 'src'), path.join(output, 'src'), { recursive: true });

try {
  await cp(path.join(root, 'public'), output, { recursive: true });
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}

await writeFile(path.join(output, '.nojekyll'), '');
console.log('Built Oche → dist/');
