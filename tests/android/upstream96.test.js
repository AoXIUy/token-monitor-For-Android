'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const M = require('../../app/src/main/assets/model');

const ROOT = path.resolve(__dirname, '../..');

test('v0.96.0: Notion AI personal Standard and Select pools and legacy fallback render exact credit counts', () => {
  const notion = {
    provider: 'notion',
    accountKey: 'sha256:notion-user-ws',
    source: 'web',
    status: 'ok',
    windows: [
      { kind: 'billing', label: 'Standard', used: 1400, limit: 4000, remaining: 2600, usedPercent: 35, showMeter: true, resetDescription: 'Monthly' },
      { kind: 'billing', label: 'Select', used: 400, limit: 2000, remaining: 1600, usedPercent: 20, showMeter: true, resetDescription: 'Monthly' },
    ],
  };

  assert.deepEqual(M.quota(notion, notion.windows[0], { showUsed: true }), {
    label: 'Standard',
    value: '35% 已用',
    percent: 35,
    remaining: false,
    detail: '1400/4000',
  });
  assert.deepEqual(M.quota(notion, notion.windows[0], { showUsed: false }), {
    label: 'Standard',
    value: '65% 剩余',
    percent: 65,
    remaining: true,
    detail: '2600/4000',
  });
  assert.equal(M.quota(notion, notion.windows[1], { showUsed: true }).detail, '400/2000');

  const legacy = {
    provider: 'notion',
    accountKey: 'sha256:notion-legacy',
    source: 'web',
    status: 'ok',
    windows: [
      { kind: 'session', label: 'Rolling', used: 12, limit: 50, usedPercent: 24, windowMinutes: 360, showMeter: true },
      { kind: 'billing', label: 'Monthly', used: 80, limit: 500, usedPercent: 16, showMeter: true },
    ],
  };
  assert.equal(M.quota(legacy, legacy.windows[0]).label, 'Rolling');
  assert.equal(M.quota(legacy, legacy.windows[1]).label, 'Monthly');
  assert.equal(M.quota(legacy, legacy.windows[1]).detail, undefined);

  const browser = vm.createContext({ window: {} });
  for (const file of ['compactTokens.js', 'clientCatalog.js', 'currency.js', 'limits/balanceDisplay.js', 'limits/windowText.js',
    'limits/windowLabels.js', 'limits/historyModel.js', 'deviceKind.js', 'sessionActivityProviders.js', 'sessionLive.js', 'sessionGroups.js']) {
    vm.runInContext(fs.readFileSync(path.join(ROOT, 'src/shared', file), 'utf8'), browser, { filename: file });
  }
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'app/src/main/assets/model.js'), 'utf8'), browser);
  assert.equal(browser.window.MonitorModel.quota(notion, notion.windows[0], { showUsed: false }).detail, '2600/4000');
});

test('v0.96.0: Qoder isolates Global/CN sites and provisional default slots while honoring portable aliases', () => {
  const DEFAULT_SLOT_KEY = 'sha256:c325fbf2f2b9a182e7edbdf6f2163efde2b6b8c460a7c93bcc607c8cf31a5b52';
  const slotPcA = { provider: 'qoder', accountKey: DEFAULT_SLOT_KEY, region: 'global', sourceDeviceId: 'pc-a', status: 'ok' };
  const slotPcB = { provider: 'qoder', accountKey: DEFAULT_SLOT_KEY, region: 'global', sourceDeviceId: 'pc-b', status: 'ok' };
  const accA = M.limitAccount(slotPcA, null, '');
  const accB = M.limitAccount(slotPcB, null, '');
  assert.notEqual(accA.key, accB.key);
  assert.equal(accA.regionLabel, '国际站');

  const portableCn = {
    provider: 'qoder',
    accountKey: 'sha256:user-cn',
    accountKeyPortable: true,
    accountKeyAliases: ['sha256:cookie-cn'],
    region: 'cn',
    sourceDeviceId: 'pc-a',
    status: 'ok',
  };
  const presentation = {
    qoder: {
      labels: { 'sha256:cookie-cn': '公司 CN 账号' },
      order: ['sha256:cookie-cn', 'sha256:other'],
    },
  };
  const portableGlobal = {
    provider: 'qoder',
    accountKey: 'sha256:user-global',
    accountKeyPortable: true,
    region: 'global',
    sourceDeviceId: 'pc-b',
    status: 'ok',
  };
  const cnInfo = M.limitAccount(portableCn, null, '', presentation);
  assert.equal(cnInfo.regionLabel, '中国站');
  assert.equal(cnInfo.displayName, '公司 CN 账号');
  assert.notEqual(cnInfo.key, M.limitAccount(portableGlobal, null, '').key);
});

test('v0.96.0: Z.ai Team multi-project synced rows stay separate', () => {
  const projA = { provider: 'zaiteam', accountKey: 'sha256:org-1-proj-a', accountName: 'Project Alpha', sourceDeviceId: 'pc-1', status: 'ok' };
  const projB = { provider: 'zaiteam', accountKey: 'sha256:org-1-proj-b', accountName: 'Project Beta', sourceDeviceId: 'pc-2', status: 'ok' };
  const groups = M.limitGroups([projA, projB]);
  assert.equal(groups.length, 2);
  assert.notEqual(M.limitAccount(projA).key, M.limitAccount(projB).key);
});

test('v0.96.0: Antigravity preserves grouped display order, disabled buckets, stale history, and hides unmeasured legacy pools', () => {
  const grouped = {
    provider: 'antigravity',
    status: 'unavailable',
    stale: true,
    windows: [
      { kind: 'weekly', label: 'Vertex Preview weekly', remainingPercent: 88, windowMinutes: 10080 },
      { kind: 'session', label: 'Vertex Preview 5-hour', remainingPercent: 95, windowMinutes: 300 },
      { kind: 'weekly', label: 'Gemini 4 Argon weekly', remainingPercent: 74, windowMinutes: 10080 },
      { kind: 'session', label: 'Claude/GPT 5-hour', remainingPercent: null, showMeter: false, windowMinutes: 300 },
      { kind: 'weekly', label: 'Claude/GPT weekly', remainingPercent: 0, windowMinutes: 10080 },
      { kind: 'weekly', label: 'Gemini weekly', remainingPercent: 99, windowMinutes: 10080 },
      { kind: 'session', label: 'Gemini 5-hour', remainingPercent: 98, windowMinutes: 300 },
    ],
  };

  assert.deepEqual(M.limitWindows(grouped).map(w => w.label), [
    'Gemini 5-hour',
    'Gemini weekly',
    'Claude/GPT 5-hour',
    'Claude/GPT weekly',
    'Gemini 4 Argon weekly',
    'Vertex Preview 5-hour',
    'Vertex Preview weekly',
  ]);
  const disabledBucket = M.quota(grouped, M.limitWindows(grouped)[2]);
  assert.equal(disabledBucket.percent, null);
  assert.equal(disabledBucket.value, '暂无读数');
  assert.equal(M.limitHasHistory(grouped), true);

  const legacy = {
    provider: 'antigravity',
    status: 'ok',
    windows: [
      { kind: 'weekly', label: 'Gemini Pro', remainingPercent: null, usedPercent: null, showMeter: false },
      { kind: 'weekly', label: 'Claude', remainingPercent: 0, showMeter: true },
    ],
  };
  assert.deepEqual(M.limitWindows(legacy).map(w => w.label), ['Claude']);
  assert.equal(M.quota(legacy, M.limitWindows(legacy)[0], { showUsed: false }).value, '0% 剩余');
});

test('v0.96.0: daily() validates real calendar dates, keeps recorded zeros, and leaves gaps absent', () => {
  const rows = M.daily({
    historyPreview: {
      daily: [
        { date: '2026-02-30', tokens: 999 },
        { date: '2026-13-01', tokens: 999 },
        { date: '2026-11-22', tokens: 500, cost: 1.5 },
        { date: '2026-11-20', tokens: 0, cost: 0 },
      ],
    },
  });
  assert.deepEqual(rows.map(r => r.date), ['2026-11-20', '2026-11-22']);
  assert.equal(rows[0].tokens, 0);
});

test('v0.96.0: Devin UI prefers login email over organization and HistoryChart uses non-scaling-stroke', () => {
  const limitsSource = fs.readFileSync(path.join(ROOT, 'ui/src/components/LimitsView.tsx'), 'utf8');
  const overviewSource = fs.readFileSync(path.join(ROOT, 'ui/src/components/OverviewView.tsx'), 'utf8');
  const chartSource = fs.readFileSync(path.join(ROOT, 'ui/src/components/HistoryChart.tsx'), 'utf8');
  assert.match(limitsSource, /provider\.provider === 'devin'[\s\S]*provider\.accountEmail/);
  assert.match(overviewSource, /provider\.provider === 'devin'[\s\S]*provider\.accountEmail \|\| provider\.accountName/);
  assert.match(chartSource, /vectorEffect="non-scaling-stroke"/);
});

test('v0.96.0: docs/upstream-files.json keeps windowText.js sha256 and provenance', () => {
  const meta = JSON.parse(fs.readFileSync(path.join(ROOT, 'docs/upstream-files.json'), 'utf8'));
  const windowTextEntry = meta.files.find((entry) => entry.path === 'src/shared/limits/windowText.js');
  assert.ok(windowTextEntry, 'windowText.js entry should exist');
  assert.equal(windowTextEntry.sourceCommit, '39606ac3453a88dcd6601b7f213dc15798f91548');
  for (const entry of meta.files) {
    const actual = crypto.createHash('sha256').update(fs.readFileSync(path.join(ROOT, entry.path))).digest('hex');
    assert.equal(actual, entry.sha256, `sha256 mismatch for ${entry.path}`);
  }
});
