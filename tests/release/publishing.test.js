'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync, spawnSync } = require('node:child_process');
const { releaseMetadata } = require('../../scripts/release-metadata');
const { verifyCertificate, verifyPackage } = require('../../scripts/package-release');

function releaseRepository(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'android-release-source-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, 'app'));
  fs.mkdirSync(path.join(root, 'scripts'));
  fs.mkdirSync(path.join(root, 'docs/releases'), { recursive: true });
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ version: '1.2.3' }));
  fs.writeFileSync(path.join(root, 'app/build.gradle'), "versionCode 12\nversionName '1.2.3'\n");
  fs.writeFileSync(path.join(root, 'docs/releases/1.2.3.md'), 'Reviewed release');
  fs.copyFileSync(path.join(__dirname, '../../scripts/release-metadata.js'), path.join(root, 'scripts/release-metadata.js'));
  const git = (...args) => execFileSync('git', [
    '-c', 'user.name=Release test', '-c', 'user.email=release-test@example.invalid',
    '-c', 'commit.gpgSign=false', '-c', 'tag.gpgSign=false', '-c', `core.hooksPath=${path.join(root, 'empty-hooks')}`, ...args
  ], { cwd: root, encoding: 'utf8' }).trim();
  git('init', '--quiet', '--initial-branch=main');
  git('add', '.');
  git('commit', '--quiet', '-m', 'Initial release');
  const run = (sha = git('rev-parse', 'HEAD')) => {
    const output = path.join(root, 'action-output');
    fs.rmSync(output, { force: true });
    const result = spawnSync(process.execPath, ['scripts/release-metadata.js'], {
      cwd: root, encoding: 'utf8',
      env: { ...process.env, GITHUB_EVENT_NAME: 'workflow_dispatch', GITHUB_REF_TYPE: 'branch',
        GITHUB_REF_NAME: 'main', GITHUB_SHA: sha, GITHUB_OUTPUT: output }
    });
    return { ...result, output: fs.existsSync(output) ? fs.readFileSync(output, 'utf8') : '' };
  };
  return { root, git, run };
}

test('release CLI accepts new versions and matching lightweight or annotated tags', t => {
  for (const kind of ['absent', 'lightweight', 'annotated']) {
    const { git, run } = releaseRepository(t);
    if (kind === 'lightweight') git('tag', 'v1.2.3');
    if (kind === 'annotated') git('tag', '-a', 'v1.2.3', '-m', 'Reviewed release');
    const result = run();
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.output, /^tag=v1\.2\.3\nversion=1\.2\.3\nversion_code=12\n$/);
  }
});

test('release CLI explains reused versions and writes no outputs for conflicting tags', t => {
  const { root, git, run } = releaseRepository(t);
  git('tag', 'v1.2.3');
  const taggedCommit = git('rev-parse', 'HEAD');
  fs.writeFileSync(path.join(root, 'new-ui.txt'), 'New UI without a version bump');
  git('add', '.');
  git('commit', '--quiet', '-m', 'Change UI without bumping version');
  const sourceCommit = git('rev-parse', 'HEAD');
  const result = run();
  assert.equal(result.status, 1, result.stderr);
  assert.match(result.stderr, /v1\.2\.3/);
  assert.ok(result.stderr.includes(taggedCommit));
  assert.ok(result.stderr.includes(sourceCommit));
  assert.match(result.stderr, /new version.*versionCode/i);
  assert.equal(result.output, '');
  assert.equal(git('rev-parse', 'refs/tags/v1.2.3'), taggedCommit);
});

test('release CLI refuses a checkout that differs from the Actions source commit', t => {
  const { run } = releaseRepository(t);
  const result = run('0'.repeat(40));
  assert.equal(result.status, 1, result.stderr);
  assert.match(result.stderr, /checkout.*source commit/i);
  assert.equal(result.output, '');
});

test('release gates reject mismatched tags, versions, unreviewed notes and non-main manual runs', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'android-release-check-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, 'app'));
  fs.mkdirSync(path.join(root, 'docs/releases'), { recursive: true });
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ version: '1.2.3' }));
  fs.writeFileSync(path.join(root, 'app/build.gradle'), "versionCode 12\nversionName '1.2.3'\n");
  assert.throws(() => releaseMetadata(root), /reviewed release notes/);
  fs.writeFileSync(path.join(root, 'docs/releases/1.2.3.md'), 'Reviewed release');
  assert.deepEqual(releaseMetadata(root, { refType: 'tag', refName: 'v1.2.3' }), {
    version: '1.2.3', versionCode: 12, tag: 'v1.2.3'
  });
  assert.throws(() => releaseMetadata(root, { refType: 'tag', refName: 'v1.2.2' }), /tag must/);
  assert.throws(() => releaseMetadata(root, { name: 'workflow_dispatch', refType: 'branch', refName: 'feature' }), /from main/);
  fs.writeFileSync(path.join(root, 'app/build.gradle'), "versionCode 12\nversionName '1.2.2'\n");
  assert.throws(() => releaseMetadata(root), /versions must agree/);
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ version: '1.2.3\nmalicious=output' }));
  assert.throws(() => releaseMetadata(root), /stable major.minor.patch/);
});

test('publishing rejects changed signing keys, multiple signers and missing certificate evidence', () => {
  const fingerprint = 'a'.repeat(64);
  const report = `Number of signers: 1\nSigner #1 certificate SHA-256 digest: ${fingerprint}\n`;
  assert.equal(verifyCertificate(report, fingerprint.toUpperCase()), fingerprint);
  assert.throws(() => verifyCertificate(report, 'b'.repeat(64)), /certificate does not match/);
  assert.throws(() => verifyCertificate(report.replace('signers: 1', 'signers: 2'), fingerprint), /certificate does not match/);
  assert.throws(() => verifyCertificate('', fingerprint), /certificate does not match/);
});

test('publishing refuses debug APKs, another application and stale version codes', () => {
  const metadata = { version: '1.2.3', versionCode: 12 };
  const badging = "package: name='com.tokenmonitor.android' versionCode='12' versionName='1.2.3'\n";
  verifyPackage(badging, metadata);
  for (const invalid of [badging + 'application-debuggable\n', badging.replace('com.tokenmonitor.android', 'another.app'), badging.replace("'12'", "'11'")]) {
    assert.throws(() => verifyPackage(invalid, metadata), /APK identity\/version/);
  }
});
