import {spawn} from 'node:child_process';
import {existsSync} from 'node:fs';
import {dirname, resolve} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export function pythonCommand() {
  if (process.env.PYTHON) return process.env.PYTHON;
  const venv = resolve(root, '.venv/bin/python');
  return existsSync(venv) ? venv : 'python3';
}

export function createPlan({node = process.execPath, python = pythonCommand()} = {}) {
  const check = (file) => [node, ['--check', file]];
  return {
    core: [
      [node, ['--test', 'tests/community-security.test.mjs', 'tests/release-baseline.test.mjs']],
      check('src/worker.js'),
      check('src/lib/http.js'),
      check('src/lib/static-headers.mjs'),
      check('src/lib/version-manifest.mjs'),
      check('public/site-version.js'),
      check('public/site-version-core.mjs'),
      check('public/online.js'),
      check('public/convert.js'),
      check('public/can/gbt27930-2015.mjs'),
      check('public/can/gbt27930-2015-fields.mjs'),
      check('public/gbt27930.js'),
      check('public/can/j1939.mjs'),
      check('public/can/zlg-text.mjs'),
      check('public/j1939.js'),
      check('scripts/generate-version.mjs'),
      check('scripts/preview-static.mjs'),
      check('scripts/render-static-headers.mjs'),
      check('scripts/verify.mjs'),
      [node, ['tests/batch.test.mjs']],
      [node, ['tests/convert.test.mjs']],
      [node, ['tests/csv.test.mjs']],
      [node, ['tests/shared-codec.test.mjs']],
      [node, ['--test', 'tests/gbt27930-2015.test.mjs']],
      [node, ['--test', 'tests/gbt27930-2015-fields.test.mjs']],
      [node, ['--test', 'tests/j1939.test.mjs']],
      [node, ['--test', 'tests/zlg-text.test.mjs']],
      [node, ['tests/about-page.test.cjs']],
      [node, ['tests/brandbar.test.cjs']],
      [node, ['tests/community-contract.test.cjs']],
      [node, ['tests/convert-workflow-arrow.test.cjs']],
      [node, ['tests/home-page.test.cjs']],
      [node, ['tests/nav-state.test.cjs']],
      [node, ['tests/online-page.test.cjs']],
    ],
    python: [
      [python, ['-m', 'py_compile', 'bridge/cananalysis_bridge.py', 'tests/test_bridge.py', 'tests/verify-convert-output.py']],
      [python, ['-m', 'unittest', 'tests.test_bridge']],
      [python, ['tests/verify-convert-output.py']],
    ],
    browser: [
      [node, ['tests/about-scroll.test.cjs']],
      [node, ['tests/about-ocean-motion.test.cjs']],
      [node, ['tests/offline-home-version.test.cjs']],
      [node, ['tests/regression-page.test.cjs']],
      [node, ['tests/static-security.browser.test.cjs']],
      [node, ['tests/gbt27930-page.test.cjs']],
      [node, ['tests/j1939-page.test.cjs']],
      [node, ['tests/browser-convert.cjs']],
    ],
  };
}

function extractCounts(output) {
  let tapPassed = 0;
  let tapFailed = 0;
  let unittestRan = 0;
  let passLines = 0;
  for (const match of output.matchAll(/^# pass (\d+)/gm)) tapPassed += Number(match[1]);
  for (const match of output.matchAll(/^# fail (\d+)/gm)) tapFailed += Number(match[1]);
  for (const match of output.matchAll(/^Ran (\d+) tests?/gm)) unittestRan += Number(match[1]);
  for (const match of output.matchAll(/^PASS:/gm)) passLines += 1;
  return {tapPassed, tapFailed, unittestRan, passLines};
}

function runCommand(command, args) {
  console.log(`\n$ ${[command, ...args].join(' ')}`);
  return new Promise((resolveCommand) => {
    const child = spawn(command, args, {cwd: root, env: process.env, stdio: ['ignore', 'pipe', 'pipe']});
    let output = '';
    const collect = (chunk, stream) => {
      const text = chunk.toString();
      output += text;
      stream.write(text);
    };
    child.stdout.on('data', (chunk) => collect(chunk, process.stdout));
    child.stderr.on('data', (chunk) => collect(chunk, process.stderr));
    child.on('error', (error) => {
      process.stderr.write(`${error.message}\n`);
      resolveCommand({code: 127, output: `${output}${error.message}\n`});
    });
    child.on('close', (code) => resolveCommand({code: code ?? 1, output}));
  });
}

export async function main(argv = process.argv) {
  const layerFlag = argv.indexOf('--layer');
  const requested = layerFlag === -1 ? 'all' : argv[layerFlag + 1];
  const plan = createPlan();
  if (requested !== 'all' && !plan[requested]) {
    console.error(`unknown layer: ${requested}`);
    return 2;
  }
  const layers = requested === 'all' ? ['core', 'python', 'browser'] : [requested];
  let failedCommands = 0;
  const summary = [];
  for (const name of layers) {
    let commandsPassed = 0;
    let commandsFailed = 0;
    let tapPassed = 0;
    let tapFailed = 0;
    let unittestRan = 0;
    let passLines = 0;
    for (const [command, args] of plan[name]) {
      const result = await runCommand(command, args);
      const counts = extractCounts(result.output);
      tapPassed += counts.tapPassed;
      tapFailed += counts.tapFailed;
      unittestRan += counts.unittestRan;
      passLines += counts.passLines;
      if (result.code === 0) commandsPassed += 1;
      else {
        commandsFailed += 1;
        failedCommands += 1;
        console.error(`FAILED (${result.code}): ${command} ${args.join(' ')}`);
      }
    }
    summary.push(`${name}: commands ${commandsPassed} passed, ${commandsFailed} failed; node:test passed=${tapPassed} failed=${tapFailed}; unittest=${unittestRan}; PASS lines=${passLines}`);
  }
  console.log('\nVERIFY SUMMARY');
  for (const line of summary) console.log(line);
  return failedCommands === 0 ? 0 : 1;
}

const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (invokedDirectly) {
  main().then((code) => {
    process.exit(code);
  });
}
