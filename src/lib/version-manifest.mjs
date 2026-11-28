import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const defaultRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

function git(root, args) {
  return execFileSync('git', args, {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

export function buildManifest({version, commit, committedAt, generatedAt}) {
  if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error('version must be SemVer MAJOR.MINOR.PATCH');
  if (!/^[0-9a-f]{40}$/.test(commit)) throw new Error('commit must be the full 40-character git SHA');
  if (typeof committedAt !== 'string' || Number.isNaN(Date.parse(committedAt))) {
    throw new Error('committedAt must be the git committer timestamp');
  }
  if (typeof generatedAt !== 'string' || Number.isNaN(Date.parse(generatedAt))) {
    throw new Error('generatedAt must be an ISO timestamp');
  }
  return {
    version,
    commit,
    shortCommit: commit.slice(0, 8),
    committedAt,
    generatedAt,
    commitSource: 'git-committer',
  };
}

export function createManifestFromGit(root = defaultRoot, now = new Date()) {
  const commit = git(root, ['rev-parse', 'HEAD']);
  const committedAt = git(root, ['log', '-1', '--format=%cI']);
  const version = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')).version;
  return buildManifest({
    version,
    commit,
    committedAt,
    generatedAt: now.toISOString(),
  });
}
