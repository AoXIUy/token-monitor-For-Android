'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const M = require('../../app/src/main/assets/model');

function fixture() {
  const sessions = {
    'codex:main': { client: 'codex', sessionId: 'main', totalTokens: 100, costUsd: 1,
      lastUsedAt: '2026-11-04T01:00:00Z', title: 'Remote work' },
    'claude:child': { client: 'claude', sessionId: 'child', parentClient: 'codex', parentSessionId: 'main',
      totalTokens: 50, costUsd: 0.5, lastUsedAt: '2026-11-04T01:00:01Z', title: 'Delegated task' },
    'senpi:other': { client: 'senpi', sessionId: 'other', totalTokens: 25, costUsd: 0,
      lastUsedAt: '2026-11-04T01:00:02Z' },
  };
  const period = { totalTokens: 175, costUsd: 1.5, sessions };
  return { periods: { today: period }, devices: [
    { deviceId: 'laptop', hostname: 'Work', deviceKind: 'laptop', platform: 'darwin',
      periods: { today: { sessions: { 'codex:main': sessions['codex:main'] } } } },
    { deviceId: 'server', hostname: 'Work', deviceKind: 'server', platform: 'linux', stale: true,
      periods: { today: { sessions: { 'claude:child': sessions['claude:child'], 'senpi:other': sessions['senpi:other'] } } } },
  ] };
}

test('Android tool filtering retains cross-client families and their complete accounting totals', () => {
  const stats = fixture();
  const before = JSON.stringify(stats);
  const rows = M.sessions(stats.periods.today);
  const selection = M.filterSessionTools(rows, 'claude');
  assert.deepEqual(selection.tools, ['claude', 'codex', 'senpi']);
  assert.equal(selection.tool, 'claude');
  assert.equal(selection.rows.length, 1);
  assert.equal(selection.rows[0].totalTokens, 150);
  assert.equal(selection.rows[0].costUsd, 1.5);
  assert.equal(selection.rows[0].detailKey, 'codex:main');
  assert.deepEqual(selection.rows[0].groupRows.map(row => row.key), ['codex:main', 'claude:child']);
  assert.equal(M.filterSessionTools(rows, 'senpi').rows[0].key, 'senpi:other');
  assert.equal(JSON.stringify(stats), before);
});

test('Android clears unavailable tool selections after search or source changes', () => {
  const period = fixture().periods.today;
  const all = M.sessions(period);
  assert.equal(M.filterSessionTools(all, 'missing').tool, '');
  assert.deepEqual(M.filterSessionTools(all, 'missing').rows, all);
  const searched = M.sessions(period, 'delegated');
  assert.equal(M.filterSessionTools(searched, 'claude').rows[0].totalTokens, 150);
  const sole = M.sessions(period, 'other');
  assert.equal(M.filterSessionTools(sole, 'senpi').tool, '');
  assert.equal(M.filterSessionTools([], 'codex').rows.length, 0);
});

test('Android resolves every family source by accounting key without assigning one device to a mixed group', () => {
  const stats = fixture();
  const before = JSON.stringify(stats);
  const group = M.sessions(stats.periods.today).find(row => row.groupRows);
  const sources = M.sessionDevices(group, stats, 'today');
  assert.deepEqual(sources.map(device => device.deviceId), ['laptop', 'server']);
  assert.deepEqual(sources.map(device => device.deviceKind), ['laptop', 'server']);
  assert.equal(sources[1].stale, true, 'offline devices still own their historical usage');
  assert.equal(M.sessionDevices(group.groupRows[0], stats, 'today')[0].deviceId, 'laptop');
  assert.equal(M.sessionDevices(group, stats, 'month').length, 0);
  assert.deepEqual(M.sessionDevices(group, stats, 'today', 'server').map(device => device.deviceId), ['server']);
  assert.equal(M.sessionDevices(group, stats, 'today', 'removed').length, 0);
  assert.equal(M.sessionDevices({ key: 'missing', sourceDevice: { deviceId: 'fake' } }, stats, 'today').length, 0);
  stats.devices.push({ ...stats.devices[0], deviceId: 'mirror' });
  assert.deepEqual(M.sessionDevices(group.groupRows[0], stats, 'today').map(device => device.deviceId), ['laptop', 'mirror']);
  stats.devices.pop();
  assert.equal(JSON.stringify(stats), before);
});

test('Android hardware hints use the shared normalization and leave old Hub records generic', () => {
  for (const kind of ['computer', 'desktop', 'laptop', 'mini', 'workstation', 'server', 'cloud', 'linux']) {
    assert.equal(M.deviceKind(kind), kind);
  }
  for (const kind of [undefined, null, '', 'unknown', 'LAPTOP']) assert.equal(M.deviceKind(kind), 'computer');
  const stats = fixture();
  delete stats.devices[0].deviceKind;
  const [row] = M.sessions({ sessions: { 'codex:main': stats.periods.today.sessions['codex:main'] } });
  assert.equal(M.sessionDevices(row, stats, 'today')[0].deviceKind, 'computer');
  assert.equal(M.sessionDetail(stats, row.key).owners[0].deviceKind, 'computer');
});

test('packaged Android scripts expose hardware and tool filtering without Node globals', () => {
  const browser = vm.createContext({ window: {} });
  for (const filename of ['src/shared/compactTokens.js', 'src/shared/limits/balanceDisplay.js',
    'src/shared/deviceKind.js', 'src/shared/sessionActivityProviders.js', 'src/shared/sessionLive.js',
    'src/shared/sessionGroups.js', 'app/src/main/assets/model.js']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../..', filename), 'utf8'), browser, { filename });
  }
  const api = browser.window.MonitorModel;
  assert.equal(api.deviceKind('cloud'), 'cloud');
  const stats = fixture();
  const selection = api.filterSessionTools(api.sessions(stats.periods.today), 'claude');
  assert.equal(selection.rows[0].totalTokens, 150);
  assert.equal(api.sessionDevices(selection.rows[0], stats, 'today').length, 2);
});

test('Android consumes normalized v0.85 device metadata with the existing stats contract', () => {
  const row = { client: 'claude', sessionId: 'remote', totalTokens: 50 };
  const period = { totalTokens: 50, sessions: { 'claude:remote': row } };
  const stats = { periods: { today: period }, devices: [{ deviceId: 'remote-pc', hostname: 'Remote computer',
    platform: 'linux', deviceKind: 'cloud', periods: { today: period } }] };
  const [session] = M.sessions(M.select(stats, '', 'today').period);
  assert.equal(M.sessionDevices(session, stats, 'today')[0].deviceKind, 'cloud');
  assert.equal(M.sessionDetail(stats, session.key).owners[0].deviceKind, 'cloud');
  stats.devices[0].deviceKind = 'computer';
  assert.equal(M.sessionDevices(session, stats, 'today')[0].deviceKind, 'computer');
});
