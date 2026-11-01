'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { releaseMetadata } = require('./release-metadata');

function verifyCertificate(report, fingerprint) {
  const expected = fingerprint.replace(/[\s:]/g, '').toLowerCase();
  const actual = report.match(/^Signer #1 certificate SHA-256 digest: ([a-f0-9]+)$/m)?.[1];
  if (!/^[a-f0-9]{64}$/.test(expected) || actual !== expected || !/^Number of signers: 1$/m.test(report)) {
    throw new Error('Release signing certificate does not match release-signing.sha256');
  }
  return expected;
}

function verifyPackage(badging, metadata) {
  const identity = badging.match(/^package: name='([^']+)' versionCode='([^']+)' versionName='([^']+)'/m);
  if (!identity || identity[1] !== 'com.tokenmonitor.android'
      || Number(identity[2]) !== metadata.versionCode || identity[3] !== metadata.version
      || /^application-debuggable(?:\s|$)/m.test(badging)) {
    throw new Error('APK identity/version must match the release and must not be debuggable');
  }
}

function packageRelease(root) {
  const metadata = releaseMetadata(root);
  const sdk = process.env.ANDROID_SDK_ROOT || process.env.ANDROID_HOME;
  if (!sdk) throw new Error('Set ANDROID_HOME or ANDROID_SDK_ROOT to verify the release');
  const tools = path.join(sdk, 'build-tools', '35.0.0');
  const apk = path.join(root, 'app/build/outputs/apk/release/app-release.apk');
  const run = (tool, args) => {
    const result = spawnSync(path.join(tools, tool), args, { encoding: 'utf8' });
    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error(`${tool} failed: ${result.stderr || result.stdout}`);
    return result.stdout;
  };
  const signature = run('apksigner', ['verify', '--verbose', '--print-certs', apk]);
  const certificateSha256 = verifyCertificate(signature, fs.readFileSync(path.join(root, 'release-signing.sha256'), 'utf8'));
  verifyPackage(run('aapt', ['dump', 'badging', apk]), metadata);
  run('zipalign', ['-c', '4', apk]);
  const output = path.join(root, 'dist/release');
  fs.rmSync(output, { recursive: true, force: true });
  fs.mkdirSync(output, { recursive: true });
  const filename = `Token-Monitor-Android-${metadata.version}.apk`;
  const bytes = fs.readFileSync(apk);
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  const commit = process.env.GITHUB_SHA || spawnSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).stdout.trim();
  if (!/^[a-f0-9]{40}$/.test(commit)) throw new Error('Release source must be an exact Git commit');
  fs.writeFileSync(path.join(output, filename), bytes);
  fs.writeFileSync(path.join(output, 'SHA256SUMS'), `${sha256}  ${filename}\n`);
  fs.writeFileSync(path.join(output, 'signature.txt'), signature);
  fs.writeFileSync(path.join(output, 'release-metadata.json'), JSON.stringify({
    ...metadata, commit, filename, sha256, certificateSha256
  }, null, 2) + '\n');
  const notes = fs.readFileSync(path.join(root, 'docs/releases', `${metadata.version}.md`), 'utf8');
  const runLink = process.env.GITHUB_RUN_ID
    ? `\n[Actions 验证与发布记录](${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID})\n` : '';
  fs.writeFileSync(path.join(output, 'RELEASE_NOTES.md'), `${notes.trim()}\n\nAPK SHA-256：\`${sha256}\`\n\n签名证书 SHA-256：\`${certificateSha256}\`\n\n源码提交：\`${commit}\`\n${runLink}`);
  console.log(`Verified ${filename}: ${sha256}`);
}

if (require.main === module) packageRelease(path.resolve(__dirname, '..'));
module.exports = { verifyCertificate, verifyPackage };
