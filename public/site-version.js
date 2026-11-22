import {commitInstant, formatReleaseDate, selectVersion, shortCommit} from './site-version-core.mjs';

const commitEl = document.getElementById('hcommit');
const releaseEl = document.getElementById('hmodtime');

async function loadJson(url, github) {
  const headers = github
    ? {Accept: 'application/vnd.github+json'}
    : {Accept: 'application/json'};
  const response = await fetch(url, {cache: 'no-store', headers});
  if (!response.ok) throw new Error('request failed');
  return response.json();
}

async function refreshVersion() {
  let manifest = null;
  try {
    manifest = await loadJson('/version.json', false);
  } catch {
    manifest = null;
  }
  const early = selectVersion(manifest, null);
  let github = null;
  if (!(early.source === 'manifest' && early.committedAt)) {
    const ref = early.commit || 'main';
    try {
      github = await loadJson('https://api.github.com/repos/Wang106/CANAnalysis/commits/' + encodeURIComponent(ref), true);
    } catch {
      github = null;
    }
  }
  const selected = selectVersion(manifest, github);
  window.__siteVersionState = selected;
  if (!commitEl || !releaseEl) return selected;
  const short = shortCommit(selected.commit);
  const instant = commitInstant(selected.committedAt);
  if (short) {
    commitEl.textContent = short;
    commitEl.dataset.source = selected.source;
    commitEl.title = 'GitHub 提交号 ' + selected.commit.trim();
  }
  if (instant) {
    releaseEl.textContent = formatReleaseDate(instant);
    releaseEl.dataset.source = selected.source;
    releaseEl.title = selected.source === 'github' ? 'GitHub 代码提交时间' : 'Git 提交时间（站点版本清单）';
  }
  return selected;
}

window.__siteVersion = {shortCommit, commitInstant, formatReleaseDate, selectVersion, refresh: refreshVersion};
refreshVersion();
