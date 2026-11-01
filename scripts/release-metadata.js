'use strict';

const fs = require('node:fs');
const path = require('node:path');

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

if (require.main === module) {
  const metadata = releaseMetadata(path.resolve(__dirname, '..'), {
    name: process.env.GITHUB_EVENT_NAME,
    refType: process.env.GITHUB_REF_TYPE,
    refName: process.env.GITHUB_REF_NAME
  });
  if (process.env.GITHUB_OUTPUT) {
    fs.appendFileSync(process.env.GITHUB_OUTPUT,
      `tag=${metadata.tag}\nversion=${metadata.version}\nversion_code=${metadata.versionCode}\n`);
  }
  console.log(JSON.stringify(metadata));
}

module.exports = { releaseMetadata };
