import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {existsSync, readFileSync} from 'node:fs';
import {createManifestFromGit} from '../src/lib/version-manifest.mjs';
import {applyHeaderFile, contentSecurityPolicy, headersForPath, renderStaticHeaders} from '../src/lib/static-headers.mjs';
import {securityHeaders} from '../src/lib/http.js';
import {commitInstant, formatReleaseDate, selectVersion, shortCommit} from '../public/site-version-core.mjs';
import {startPreview} from '../scripts/preview-static.mjs';
import {createPlan} from '../scripts/verify.mjs';

const sample = 'a16de4d5f8ce1185d55e3f557c1439f4c202c07c';

function git(args) {
  return execFileSync('git', args, {encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe']}).trim();
}

test('short commit is the first eight characters', () => {
  assert.equal(shortCommit(sample), 'a16de4d5');
  assert.notEqual(shortCommit(sample), 'c202c07c');
  assert.equal(shortCommit(sample.toUpperCase()), 'a16de4d5');
  assert.equal(shortCommit('abc'), '');
  assert.equal(shortCommit('zzzzzzzz'), '');
});

test('a complete manifest wins over GitHub main and ignores generatedAt', () => {
  const manifest = {
    version: '1.2.0',
    commit: sample,
    committedAt: '2026-09-20T12:57:50Z',
    generatedAt: '2099-03-04T05:06:07.000Z',
  };
  const github = {
    sha: '1384811a4a2c13f3c8428e7d920ebb1f7a0d07bf',
    commit: {committer: {date: '2026-10-29T13:32:58Z'}},
  };
  const selected = selectVersion(manifest, github);
  assert.deepEqual(selected, {commit: sample, committedAt: '2026-09-20T12:57:50Z', source: 'manifest'});
  assert.notEqual(selected.committedAt, manifest.generatedAt);
  const formatted = formatReleaseDate(commitInstant(selected.committedAt));
  assert.match(formatted, /^\d{4}-\d{2}-\d{2}发布$/);
  assert.doesNotMatch(formatted, /2099|2000-01-01/);
});

test('GitHub fills only the missing timestamp and is the last resort', () => {
  const partial = {commit: sample, committedAt: ''};
  const github = {sha: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', commit: {committer: {date: '2026-10-29T13:32:58Z'}}};
  assert.deepEqual(selectVersion(partial, github), {commit: sample, committedAt: '2026-10-29T13:32:58Z', source: 'github'});
  assert.deepEqual(selectVersion(null, github), {commit: github.sha, committedAt: '2026-10-29T13:32:58Z', source: 'github'});
  assert.deepEqual(selectVersion(null, null), {commit: '', committedAt: '', source: 'none'});
  assert.equal(selectVersion({commit: sample, committedAt: 'not-a-date'}, null).committedAt, '');
});

test('git manifest uses the committer timestamp of HEAD', () => {
  const manifest = createManifestFromGit();
  assert.equal(manifest.commit, git(['rev-parse', 'HEAD']));
  assert.equal(manifest.committedAt, git(['log', '-1', '--format=%cI']));
  assert.equal(manifest.shortCommit, manifest.commit.slice(0, 8));
  assert.equal(manifest.version, '1.2.0');
  assert.equal(manifest.commitSource, 'git-committer');
  assert.notEqual(manifest.committedAt.slice(0, 10), '2000-01-01');
  assert.notEqual(manifest.generatedAt, manifest.committedAt);
  if (manifest.commit.slice(0, 8) !== manifest.commit.slice(-8)) {
    assert.notEqual(manifest.shortCommit, manifest.commit.slice(-8));
  }
});

test('checked-in version snapshot records that commit’s committer time', () => {
  const recorded = JSON.parse(readFileSync('public/version.json', 'utf8'));
  assert.equal(recorded.version, JSON.parse(readFileSync('package.json', 'utf8')).version);
  assert.equal(recorded.shortCommit, recorded.commit.slice(0, 8));
  assert.equal(recorded.commitSource, 'git-committer');
  assert.equal(recorded.committedAt, git(['log', '-1', '--format=%cI', recorded.commit]));
  assert.notEqual(recorded.committedAt.slice(0, 10), '2000-01-01');
  assert.notEqual(recorded.generatedAt, recorded.committedAt);
});

test('static pages allow the local bridge only on the online routes', () => {
  const shared = contentSecurityPolicy(false);
  const online = contentSecurityPolicy(true);
  assert.doesNotMatch(shared, /127\.0\.0\.1|localhost|upgrade-insecure-requests/);
  assert.match(online, /ws:\/\/127\.0\.0\.1:8765/);
  assert.match(online, /ws:\/\/localhost:8765/);
  assert.match(online, /http:\/\/127\.0\.0\.1:8765/);
  assert.match(online, /http:\/\/localhost:8765/);
  assert.match(shared, /script-src[^;]*'unsafe-inline'/);
  assert.match(shared, /style-src[^;]*'unsafe-inline'/);
  assert.match(shared, /worker-src 'self'/);
  assert.match(shared, /frame-ancestors 'none'/);
  assert.match(shared, /https:\/\/challenges\.cloudflare\.com/);
  assert.match(shared, /https:\/\/cdn\.jsdelivr\.net/);
  for (const line of renderStaticHeaders().split('\n')) assert.ok(line.length <= 2000, line.slice(0, 120));
  for (const pathname of ['/', '/offline', '/convert', '/aboutus', '/online', '/online/', '/online.html', '/version.json']) {
    const effective = applyHeaderFile(renderStaticHeaders(), pathname);
    const expected = headersForPath(pathname);
    for (const [name, value] of Object.entries(expected)) {
      assert.equal(effective.get(name.toLowerCase()), value, `${pathname} ${name}`);
    }
  }
  assert.equal(readFileSync('public/_headers', 'utf8'), renderStaticHeaders());
});

test('API responses keep connect-src self and do not inherit the online bridge', () => {
  const csp = securityHeaders(new Response('ok')).headers.get('content-security-policy');
  assert.match(csp, /connect-src 'self'/);
  assert.doesNotMatch(csp, /127\.0\.0\.1|localhost/);
  assert.notEqual(csp, contentSecurityPolicy(true));
});

test('preview server publishes the static policy and a real version manifest', async () => {
  const preview = await startPreview();
  try {
    for (const pathname of ['/', '/offline', '/convert', '/online', '/online/', '/online.html', '/version.json']) {
      const response = await fetch(preview.url + pathname);
      const expected = headersForPath(pathname);
      for (const [name, value] of Object.entries(expected)) {
        assert.equal(response.headers.get(name), value, `${pathname} ${name}`);
      }
      if (pathname === '/version.json') {
        assert.equal(response.status, 200);
        const body = await response.json();
        assert.equal(body.shortCommit, body.commit.slice(0, 8));
        assert.notEqual(String(body.committedAt).slice(0, 10), '2000-01-01');
      } else {
        await response.arrayBuffer();
      }
    }
  } finally {
    await preview.close();
  }
});

test('verify workflow stays read-only and the locked inputs exist', () => {
  const workflow = readFileSync('.github/workflows/verify.yml', 'utf8');
  assert.match(workflow, /permissions:\n {2}contents: read/);
  assert.match(workflow, /npm ci/);
  assert.match(workflow, /npm test/);
  assert.doesNotMatch(workflow, /wrangler deploy|pull_request_target|\$\{\{\s*secrets\./);
  assert.equal(existsSync('package-lock.json'), true);
  const requirements = readFileSync('requirements-dev.txt', 'utf8');
  assert.match(requirements, /python-can==/);
  assert.match(requirements, /asammdf==/);
  const plan = createPlan();
  const core = plan.core.map((item) => item.join(' ')).join('\n');
  const browser = plan.browser.map((item) => item.join(' ')).join('\n');
  assert.match(core, /home-page\.test\.cjs/);
  assert.match(core, /community-security\.test\.mjs/);
  assert.doesNotMatch(core, /browser-convert|about-scroll|static-security\.browser/);
  assert.match(browser, /static-security\.browser\.test\.cjs/);
  assert.match(browser, /regression-page\.test\.cjs/);
  assert.match(browser, /offline-home-version\.test\.cjs/);
  assert.doesNotMatch(browser, /browser-convert\.cjs/);
  assert.match(plan.python.map((item) => item.join(' ')).join('\n'), /verify-convert-output\.py/);
});
