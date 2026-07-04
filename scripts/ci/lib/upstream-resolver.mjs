function getDependency(deps, ...names) {
  for (const name of names) {
    if (typeof deps?.[name] === 'function') return deps[name];
  }

  return null;
}

function parseReleaseTagName(release) {
  return release?.tag_name ?? release?.tagName ?? release?.tag ?? null;
}

function isDraftRelease(release) {
  return Boolean(release?.draft);
}

function isPrerelease(release) {
  return Boolean(release?.prerelease);
}

function normalizeRefMap(output) {
  if (output && typeof output === 'object' && output.refs && typeof output.refs === 'object') {
    return output.refs;
  }

  if (typeof output === 'string') {
    const refs = {};

    for (const line of output.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      const [sha, ref] = trimmed.split(/\s+/);
      if (sha && ref) {
        refs[ref] = sha;
      }
    }

    return refs;
  }

  return {};
}

function parseSemverTag(tag) {
  const match = String(tag ?? '').trim().match(/^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/);
  if (!match) return null;

  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    prerelease: match[4] ?? null
  };
}

function compareSemverTags(leftTag, rightTag) {
  const left = parseSemverTag(leftTag);
  const right = parseSemverTag(rightTag);

  if (!left && !right) return String(leftTag).localeCompare(String(rightTag));
  if (!left) return -1;
  if (!right) return 1;

  if (left.major !== right.major) return left.major - right.major;
  if (left.minor !== right.minor) return left.minor - right.minor;
  if (left.patch !== right.patch) return left.patch - right.patch;

  if (left.prerelease === right.prerelease) return 0;
  if (!left.prerelease) return 1;
  if (!right.prerelease) return -1;

  return String(left.prerelease).localeCompare(String(right.prerelease));
}

function sortLatestTagCandidates(tags) {
  return [...tags].sort((left, right) => compareSemverTags(right, left));
}

function extractReleaseList(output) {
  if (Array.isArray(output)) return output;
  if (Array.isArray(output?.releases)) return output.releases;
  if (Array.isArray(output?.items)) return output.items;
  return [];
}

function latestReleaseTagFromList(releases, { allowPrerelease = false } = {}) {
  for (const release of releases) {
    if (!release || isDraftRelease(release)) continue;
    if (!allowPrerelease && isPrerelease(release)) continue;

    const tagName = parseReleaseTagName(release);
    if (tagName) return tagName;
  }

  return null;
}

function createNoEligibleReleaseError(sourceName) {
  const error = new Error(`No eligible release available for upstream source: ${sourceName ?? '(unknown)'}`);
  error.code = 'NO_ELIGIBLE_RELEASE';
  return error;
}

function sourceFallbacks(source) {
  const fallbacks = source?.resolution?.fallbacks ?? [];
  return Array.isArray(fallbacks) ? fallbacks : [];
}

function buildResolvedSource({ source, kind, version = null, ref, commitSha, fallbackUsed = false }) {
  return {
    name: source.name,
    url: source.url,
    strategy: source?.resolution?.strategy ?? kind,
    fallbackUsed,
    resolved: {
      kind,
      version,
      ref,
      commitSha
    }
  };
}

export async function resolveTagCommit(url, tag, deps = {}) {
  const gitLsRemote = getDependency(deps, 'gitLsRemote', 'lsRemote');
  if (!gitLsRemote) {
    throw new Error('Missing gitLsRemote dependency for tag resolution.');
  }

  const output = await gitLsRemote(url, [`refs/tags/${tag}`, `refs/tags/${tag}^{}`]);
  const refs = normalizeRefMap(output);
  const peeled = refs[`refs/tags/${tag}^{}`];
  const direct = refs[`refs/tags/${tag}`];
  const commitSha = peeled ?? direct;

  if (!commitSha) {
    throw new Error(`Unable to resolve tag commit for ${tag}.`);
  }

  return commitSha;
}

export async function resolvePinnedRef(source, deps = {}) {
  const strategy = source?.resolution?.strategy ?? 'branch-head';
  const gitLsRemote = getDependency(deps, 'gitLsRemote', 'lsRemote');

  if (strategy === 'pinned-commit') {
    const commitSha = source?.resolution?.pinnedRef ?? source?.pinnedRef;
    if (!commitSha) {
      throw new Error(`Missing pinned commit SHA for upstream source: ${source?.name ?? '(unknown)'}`);
    }

    return buildResolvedSource({
      source,
      kind: 'pinned-commit',
      ref: commitSha,
      commitSha
    });
  }

  if (strategy === 'pinned-tag') {
    const tag = source?.resolution?.pinnedRef ?? source?.pinnedRef;
    if (!tag) {
      throw new Error(`Missing pinned tag for upstream source: ${source?.name ?? '(unknown)'}`);
    }

    const commitSha = await resolveTagCommit(source.url, tag, deps);
    return buildResolvedSource({
      source,
      kind: 'pinned-tag',
      version: tag,
      ref: tag,
      commitSha
    });
  }

  if (strategy === 'branch-head') {
    if (!gitLsRemote) {
      throw new Error('Missing gitLsRemote dependency for branch-head resolution.');
    }

    const output = await gitLsRemote(source.url, ['HEAD']);
    const refs = normalizeRefMap(output);
    const commitSha = refs.HEAD ?? output?.headSha ?? output?.head ?? null;

    if (!commitSha) {
      throw new Error(`Unable to resolve branch head for upstream source: ${source?.name ?? '(unknown)'}`);
    }

    return buildResolvedSource({
      source,
      kind: 'branch-head',
      ref: 'HEAD',
      commitSha
    });
  }

  throw new Error(`Unsupported pinned resolution strategy: ${strategy}`);
}

export async function resolveLatestTag(source, deps = {}) {
  const gitLsRemote = getDependency(deps, 'gitLsRemote', 'lsRemote');
  if (!gitLsRemote) {
    throw new Error('Missing gitLsRemote dependency for tag resolution.');
  }

  const output = await gitLsRemote(source.url, ['refs/tags/*']);
  const refs = normalizeRefMap(output);
  const directTags = [...new Set(
    Object.keys(refs)
      .filter((ref) => ref.startsWith('refs/tags/') && !ref.endsWith('^{}'))
      .map((ref) => ref.slice('refs/tags/'.length))
  )];
  const releaseTag = sortLatestTagCandidates(directTags).find((tag) => {
    const parsed = parseSemverTag(tag);
    if (!parsed) return true;
    if (source?.resolution?.allowPrerelease ?? false) return true;
    return !parsed.prerelease;
  }) ?? null;

  if (!releaseTag) {
    throw new Error(`Unable to resolve latest tag for upstream source: ${source?.name ?? '(unknown)'}`);
  }

  const commitSha = await resolveTagCommit(source.url, releaseTag, deps);
  return buildResolvedSource({
    source,
    kind: 'latest-tag',
    version: releaseTag,
    ref: releaseTag,
    commitSha
  });
}

export async function resolveLatestRelease(source, deps = {}) {
  const listReleases = getDependency(deps, 'listReleases', 'githubReleaseList', 'githubListReleases');

  try {
    if (!listReleases) {
      throw new Error('Missing listReleases dependency for release resolution.');
    }

    const output = await listReleases(source.url, source);
    const releases = extractReleaseList(output);
    const tagName = latestReleaseTagFromList(releases, {
      allowPrerelease: Boolean(source?.resolution?.allowPrerelease)
    });

    if (!tagName) {
      throw createNoEligibleReleaseError(source?.name);
    }

    const commitSha = await resolveTagCommit(source.url, tagName, deps);
    return buildResolvedSource({
      source,
      kind: 'latest-release',
      version: tagName,
      ref: tagName,
      commitSha
    });
  } catch (error) {
    if (error?.code === 'NO_ELIGIBLE_RELEASE' && sourceFallbacks(source).includes('latest-tag')) {
      const fallback = await resolveLatestTag(source, deps);
      return {
        ...fallback,
        strategy: source?.resolution?.strategy ?? 'latest-release',
        fallbackUsed: true
      };
    }

    throw new Error(`release resolution failed: ${error?.message ?? error}`);
  }
}

export async function resolveSourceTarget(source, deps = {}) {
  switch (source?.resolution?.strategy) {
    case 'latest-release':
      return resolveLatestRelease(source, deps);
    case 'latest-tag':
      return resolveLatestTag(source, deps);
    case 'pinned-tag':
    case 'pinned-commit':
    case 'branch-head':
      return resolvePinnedRef(source, deps);
    default:
      throw new Error(`Unsupported upstream resolution strategy: ${source?.resolution?.strategy}`);
  }
}

export function buildFetchPlan(resolvedSource) {
  return {
    fetchRef: resolvedSource?.resolved?.ref,
    checkoutCommitSha: resolvedSource?.resolved?.commitSha
  };
}
