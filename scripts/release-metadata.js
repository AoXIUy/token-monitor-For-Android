'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync, spawnSync } = require('node:child_process');

function releaseMetadata(root, event = {}) {
  const version = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version;
  if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(version)) {
    throw new Error('Release version must be a stable major.minor.patch version');
  }
  const gradle = fs.readFileSync(path.join(root, 'app/build.gradle'), 'utf8');
  const name = gradle.match(/^\s*versionName\s+'([^']+)'\s*$/m)?.[1];
  const versionCode = Number(gradle.match(/^\s*versionCode\s+(\d+)\s*$/m)?.[1]);
  if (name !== version || !Number.isSafeInteger(versionCode) || versionCode < 1) {
    throw new Error('package.json and Android release versions must agree with a positive versionCode');
  }
  const tag = `v${version}`;
  if (event.refType === 'tag' && event.refName !== tag) throw new Error(`Release tag must be ${tag}`);
  if (event.name === 'workflow_dispatch' && (event.refType !== 'branch' || event.refName !== 'main')) {
    throw new Error('Manual releases must run from main');
  }
  if (!fs.existsSync(path.join(root, 'docs/releases', `${version}.md`))) {
    throw new Error(`Missing reviewed release notes: docs/releases/${version}.md`);
  }
  return { version, versionCode, tag };
}

function validateReleaseSource(root, tag, sourceSha) {
  if (!/^[a-f0-9]{40}$/.test(sourceSha)) throw new Error('Actions source must be an exact Git commit');
  const commit = ref => execFileSync('git', ['rev-parse', '--verify', `${ref}^{commit}`], {
    cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe']
  }).trim();
  const head = commit('HEAD');
  if (head !== sourceSha) throw new Error(`Checkout ${head} does not match Actions source commit ${sourceSha}`);
  const lookup = spawnSync('git', ['show-ref', '--verify', '--quiet', `refs/tags/${tag}`], {
    cwd: root, encoding: 'utf8'
  });
  if (lookup.error) throw lookup.error;
  if (lookup.status === 1) return;
  if (lookup.status !== 0) throw new Error(`Cannot inspect release tag ${tag}: ${lookup.stderr.trim()}`);
  const taggedCommit = commit(`refs/tags/${tag}`);
  if (taggedCommit !== sourceSha) {
    throw new Error(`Tag ${tag} already points to ${taggedCommit}, but this run builds ${sourceSha}. Use a new version in package.json and Android versionName, increment versionCode and add docs/releases/<version>.md. Keep the existing release tag unchanged.`);
  }
}

if (require.main === module) {
  try {
    const root = path.resolve(__dirname, '..');
    const metadata = releaseMetadata(root, {
      name: process.env.GITHUB_EVENT_NAME,
      refType: process.env.GITHUB_REF_TYPE,
      refName: process.env.GITHUB_REF_NAME
    });
    if (process.env.GITHUB_SHA) validateReleaseSource(root, metadata.tag, process.env.GITHUB_SHA);
    if (process.env.GITHUB_OUTPUT) {
      fs.appendFileSync(process.env.GITHUB_OUTPUT,
        `tag=${metadata.tag}\nversion=${metadata.version}\nversion_code=${metadata.versionCode}\n`);
    }
    console.log(JSON.stringify(metadata));
  } catch (error) {
    console.error(`Release validation failed: ${error.message}`);
    process.exitCode = 1;
  }
}

module.exports = { releaseMetadata };
