'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const output = fs.mkdtempSync(path.join(os.tmpdir(), 'token-monitor-android-java-'));
function run(command, args) {
  const result = spawnSync(command, args, { cwd: root, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} failed with exit code ${result.status}`);
}
try {
  const sources = ['ConnectionSpec', 'SessionCompletionTracker'].map(name =>
    `app/src/main/java/com/tokenmonitor/android/${name}.java`);
  const checks = ['ConnectionSpecChecks', 'CompletionTrackerChecks'];
  run('javac', ['--release', '17', '-encoding', 'UTF-8', '-d', output, ...sources,
    ...checks.map(name => `tests/android/${name}.java`)]);
  for (const name of checks) run('java', ['-cp', output, `com.tokenmonitor.android.${name}`]);
} finally {
  fs.rmSync(output, { recursive: true, force: true });
}
