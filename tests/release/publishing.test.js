'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { releaseMetadata } = require('../../scripts/release-metadata');
const { verifyCertificate, verifyPackage } = require('../../scripts/package-release');

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
