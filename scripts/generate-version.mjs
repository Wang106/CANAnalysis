import {writeFileSync} from 'node:fs';
import {dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createManifestFromGit} from '../src/lib/version-manifest.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outFlag = process.argv.indexOf('--out');
const out = outFlag === -1 ? resolve(root, 'public/version.json') : resolve(process.argv[outFlag + 1]);
const manifest = createManifestFromGit(root);
writeFileSync(out, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`wrote ${out}`);
console.log(`${manifest.version} ${manifest.shortCommit} ${manifest.committedAt}`);
