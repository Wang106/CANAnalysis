import {writeFileSync} from 'node:fs';
import {dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {renderStaticHeaders} from '../src/lib/static-headers.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out = resolve(root, 'public/_headers');
writeFileSync(out, renderStaticHeaders());
console.log(`wrote ${out}`);
