export function shortCommit(commit) {
  if (typeof commit !== 'string') return '';
  const normalized = commit.trim().toLowerCase();
  if (!/^[0-9a-f]{8,40}$/.test(normalized)) return '';
  return normalized.slice(0, 8);
}

export function commitInstant(value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

export function formatReleaseDate(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '';
  const pad = (value) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}发布`;
}

function githubTimestamp(github) {
  const commit = github && github.commit;
  if (!commit) return '';
  const committer = commit.committer && typeof commit.committer.date === 'string' ? commit.committer.date : '';
  if (commitInstant(committer)) return committer;
  const author = commit.author && typeof commit.author.date === 'string' ? commit.author.date : '';
  if (commitInstant(author)) return author;
  return '';
}

// generatedAt is the build clock and is never a release time.
export function selectVersion(manifest, github) {
  const manifestCommit = manifest && typeof manifest.commit === 'string' ? manifest.commit.trim() : '';
  const manifestDate = commitInstant(manifest && manifest.committedAt) ? manifest.committedAt.trim() : '';
  if (shortCommit(manifestCommit) && manifestDate) {
    return {commit: manifestCommit, committedAt: manifestDate, source: 'manifest'};
  }
  const githubCommit = github && typeof github.sha === 'string' ? github.sha.trim() : '';
  const githubDate = githubTimestamp(github);
  if (!shortCommit(manifestCommit) && shortCommit(githubCommit)) {
    return {commit: githubCommit, committedAt: githubDate, source: 'github'};
  }
  if (shortCommit(manifestCommit) && !manifestDate && githubDate) {
    return {commit: manifestCommit, committedAt: githubDate, source: 'github'};
  }
  if (shortCommit(manifestCommit)) return {commit: manifestCommit, committedAt: '', source: 'manifest'};
  return {commit: '', committedAt: '', source: 'none'};
}
