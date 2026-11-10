'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const M = require('../../app/src/main/assets/model');
const H = require('../../src/shared/limits/historyModel');

test('latest model stays separate from the largest historical bucket and pre-token selections', () => {
  const row = { client: 'codex', latestModel: 'newer', models: { older: 90, newer: 10 }, totalTokens: 100 };
  const before = JSON.stringify(row);
  assert.equal(M.sessionModelLabel(row), 'newer +1');
  assert.equal(M.sessionLatestModel({ ...row, archived: true }), 'newer');
  assert.equal(M.sessionModelLabel({ ...row, latestModel: 'pre-token' }), 'pre-token +2');
  assert.equal(M.sessionModelLabel({ latestModel: 'inkling-2-small' }), 'inkling-2-small');
  for (const latestModel of [undefined, null, '', {}, 42]) {
    assert.equal(M.sessionLatestModel({ ...row, latestModel }), null);
    assert.equal(M.sessionModelLabel({ ...row, latestModel }), '2 个模型');
  }
  assert.equal(JSON.stringify(row), before);
});

test('grouped conversations use the newest main continuation without borrowing a child model', () => {
  const period = { sessions: {
    'codex:old': { client: 'codex', sessionId: 'old', nativeSessionId: 'conversation', latestModel: 'older', totalTokens: 90,
      models: { older: 90 }, lastUsedAt: '2026-11-10T10:00:00Z' },
    'codex:new': { client: 'codex', sessionId: 'new', nativeSessionId: 'conversation', latestModel: 'pre-token', totalTokens: 10,
      models: { newer: 10 }, lastUsedAt: '2026-11-10T10:01:00Z' },
    'codex:child': { client: 'codex', sessionId: 'child', parentSessionId: 'new', latestModel: 'child-model', totalTokens: 400,
      models: { 'child-model': 400 }, lastUsedAt: '2026-11-10T10:02:00Z' },
  } };
  const before = JSON.stringify(period);
  const [group] = M.sessions(period);
  assert.equal(M.sessionLatestModel(group), 'pre-token');
  assert.equal(M.sessionModelLabel(group), 'pre-token +3');
  assert.equal(group.totalTokens, 500);
  assert.deepEqual(group.models, { older: 90, newer: 10, 'child-model': 400 });
  assert.equal(M.sessions(period, 'pre-token').length, 1);
  assert.equal(M.sessions(period, 'pre-token')[0].groupRows.length, 3);
  period.sessions['codex:new'].latestModel = null;
  assert.equal(M.sessionLatestModel(M.sessions(period)[0]), null);
  assert.equal(M.sessionModelLabel(M.sessions(period)[0]), '3 个模型');
  period.sessions['codex:new'].latestModel = 'pre-token';
  assert.equal(JSON.stringify(period), before);
});

test('full native snapshots clear an old model when a new producer omits or clears it', async () => {
  const { createInitialState, receiveNativeMessage } = await import('../../ui/src/nativeState.js');
  const payload = latestModel => ({ periods: { today: { sessions: { 'codex:s': { client: 'codex', sessionId: 's', latestModel } } } } });
  let state = receiveNativeMessage(createInitialState(), { type: 'stats', data: payload('older'), fetchedAt: 100 });
  for (const latest of [undefined, null]) {
    state = receiveNativeMessage(state, { type: 'stats', data: payload(latest), fetchedAt: 200 });
    assert.equal(M.sessionLatestModel(M.sessions(state.stats.periods.today)[0]), null);
  }
});

function hark() {
  return { provider: 'hark', source: 'web', sourceDeviceId: 'pc', accountKey: 'sha256:hark-session', planLabel: 'Hark Pro', status: 'ok', windows: [
    { kind: 'daily', label: 'Daily', used: 125, limit: 100, remaining: 0, usedPercent: 125, resetsAt: '2026-11-11T00:00:00Z' },
    { kind: 'billing', label: 'Monthly', used: 20000, limit: 100000, remaining: 80000, usedPercent: 20 },
    { kind: 'billing', label: 'Daily Messages', used: 0, limit: 50, remaining: 50, usedPercent: 0 },
    { kind: 'billing', label: 'Top-up', metric: 'spend', used: 1.25, currency: 'USD', showMeter: false },
  ] };
}

test('Hark shows raw token/count allowances and unmetered top-up spend independently', () => {
  const provider = hark(), before = JSON.stringify(provider);
  const daily = M.quota(provider, provider.windows[0]);
  assert.equal(daily.value, '125% 已用');
  assert.equal(daily.percent, 100);
  assert.equal(daily.detail, '125 / 100');
  assert.equal(M.quota(provider, provider.windows[1]).detail, '20K / 100K');
  assert.equal(M.quota(provider, provider.windows[2]).detail, '0 / 50');
  assert.equal(M.quota(provider, provider.windows[3]).value, '$1.25');
  assert.equal(M.quota(provider, provider.windows[3]).percent, null);
  assert.equal(M.quotaTrendBounds(provider, provider.windows[1], Date.parse('2026-11-10T00:00:00Z')).cycle, false);
  assert.equal(H.historyReadings(provider.windows[3]).primary.unit, 'USD');
  assert.equal(JSON.stringify(provider), before);
});

test('Hark status, empty unlimited readings and account sessions never create a fake zero pool', () => {
  const provider = hark();
  assert.equal(M.quota({ ...provider, status: 'unavailable', stale: true }, provider.windows[1]).value, '20% 已用');
  assert.deepEqual(M.limitWindows({ ...provider, windows: [] }), []);
  assert.equal(M.quota(provider, { kind: 'daily', label: 'Daily' }).value, '暂无读数');
  assert.equal(M.limitAccount(provider).key, M.limitAccount({ ...provider, sourceDeviceId: 'mirror' }).key);
  assert.notEqual(M.limitAccount(provider).key, M.limitAccount({ ...provider, accountKey: 'sha256:another-session' }).key);
});

test('Qoder personal and team credits retain independent caps, reset dates and partial readings', () => {
  const provider = { provider: 'qoder', source: 'web', accountKey: 'sha256:qoder', status: 'unavailable', windows: [
    { kind: 'billing', label: 'Credits', used: 20, limit: 100, remaining: 80, usedPercent: 20, resetsAt: '2026-11-15T00:00:00Z' },
    { kind: 'billing', label: 'Team credits', used: 10, limit: 50, remaining: 40, usedPercent: 20, resetsAt: '2026-12-01T00:00:00Z' },
  ] };
  const before = JSON.stringify(provider);
  assert.equal(M.limitWindows(provider).length, 2);
  assert.equal(M.quota(provider, provider.windows[0]).detail, '20/100');
  assert.equal(M.quota(provider, provider.windows[1]).detail, '10/50');
  assert.notEqual(provider.windows[0].resetsAt, provider.windows[1].resetsAt);
  assert.equal(H.historyReadings(provider.windows[0]).primary.unit, 'pp');
  assert.equal(JSON.stringify(provider), before);
});

test('cache hit uses measured input only, excluding output and unclassified tokens', () => {
  assert.deepEqual(M.cacheEfficiency({ totalTokens: 1000, cacheReadTokens: 600, cacheWriteTokens: 100,
    outputTokens: 100, unclassifiedTokens: 100, capabilities: { tokenComponents: true } }), { hit: 600, miss: 200, percent: 75 });
  assert.equal(M.cacheEfficiency({ totalTokens: 4000, cacheReadTokens: 2100, cacheWriteTokens: 100,
    outputTokens: 800, capabilities: { tokenComponents: true } }).percent, 65.625);
  assert.equal(M.components({ totalTokens: 1000, cacheReadTokens: 600, capabilities: { tokenComponents: true } }).cachePercent, '60.0',
    'the existing widget cache share remains distinct from input hit rate');
});

test('unknown and output-only cache telemetry stays unavailable while measured zero hits stay zero', () => {
  for (const period of [undefined, {}, { totalTokens: 300 }, { totalTokens: 300, inputTokens: 200, outputTokens: 100 },
    { totalTokens: 0, capabilities: { tokenComponents: true } },
    { totalTokens: 300, outputTokens: 300, capabilities: { tokenComponents: true } },
    { totalTokens: 300, unclassifiedTokens: 300, capabilities: { tokenComponents: false } }]) {
    assert.equal(M.cacheEfficiency(period), null);
  }
  assert.deepEqual(M.cacheEfficiency({ totalTokens: 300, outputTokens: 100, capabilities: { tokenComponents: true } }), { hit: 0, miss: 200, percent: 0 });
  assert.deepEqual(M.cacheEfficiency({ totalTokens: 800, outputTokens: 100, unclassifiedTokens: 500, capabilities: { tokenComponents: false } }),
    { hit: 0, miss: 200, percent: 0 });
  assert.deepEqual(M.cacheEfficiency({ totalTokens: 100, cacheWriteTokens: 100 }), { hit: 0, miss: 100, percent: 0 });
});

test('cache session details keep all measured completed rows without consulting live state', () => {
  const sessions = Object.fromEntries(Array.from({ length: 9 }, (_, i) => [`codex:${i}`, {
    client: 'codex', sessionId: String(i), title: `Completed ${i}`, cacheReadTokens: i * 10, inputTokens: 100,
    cacheWriteTokens: 0, cacheReported: true, totalTokens: 999999,
    get lastUsedAt() { throw new Error('Cache accounting must not depend on activity time'); },
    get turnEnded() { throw new Error('Completed status cannot hide cache accounting'); },
  }]));
  sessions.unknown = { client: 'unknown', totalTokens: 100, inputTokens: 100 };
  sessions.background = { client: 'codex', sessionKind: 'background-review', cacheReadTokens: 100 };
  const rows = M.cacheSessions({ sessions });
  assert.equal(rows.length, 9);
  assert.equal(rows[0].key, 'codex:8');
  assert.equal(rows.at(-1).percent, 0);
  assert.equal(rows.at(-1).miss, 100);
});

test('lifetime active days requires an explicit completeness flag from the Hub', () => {
  const stats = { historyPreview: { summary: { activeDays: 999 }, daily: [
    { date: '2026-11-08', tokens: 10 }, { date: '2026-11-08', tokens: 5 },
    { date: '2026-11-09', tokens: 0 }, { date: '2026-11-10', tokens: 100 },
  ] } };
  for (const activeDaysComplete of [undefined, false]) {
    stats.historyPreview.summary.activeDaysComplete = activeDaysComplete;
    assert.deepEqual(M.activityDays(stats), { count: 2, complete: false });
  }
  stats.historyPreview.summary.activeDaysComplete = true;
  assert.deepEqual(M.activityDays(stats), { count: 999, complete: true });
  stats.historyPreview.summary.activeDays = 0;
  assert.deepEqual(M.activityDays(stats), { count: 0, complete: true });
  assert.equal(M.activityDays({}), null);
});

test('shared history marks a recovered flat interval at its original conflict time', () => {
  for (const crossDay of [false, true]) {
    const start = new Date(2026, 10, 10, crossDay ? 23 : 9, 55).getTime();
    const conflictAt = start + 70 * 60000, recovery = conflictAt + 5 * 60000;
    const points = H.observationPoints([{ at: recovery, value: 20, unit: 'pp', balance: false, reset: null, interval: 300000,
      uncertainUntil: conflictAt, breakAfter: true,
      coverage: [[start, start, 1], [start + 300000, start + 3600000, 12], [start + 3900000, recovery, 3]]
        .map(([at, until, samples]) => ({ at, until, samples, hour: H.hourStart(at), maxGap: 300000 })),
    }]);
    const result = H.distribution(points, { grain: crossDay ? 'day' : 'hour', day: H.dayKey(recovery), now: recovery });
    for (const bucket of result.buckets) assert.equal(bucket.uncertain, bucket.at <= conflictAt && bucket.end > start, bucket.key);
    assert.equal(result.unallocated, 0);
  }
});

test('the browser model loads Hark counts, latest models and cache calculations without Node globals', () => {
  const browser = vm.createContext({ window: {} });
  for (const file of ['clientCatalog.js', 'compactTokens.js', 'limits/balanceDisplay.js', 'limits/windowText.js',
    'limits/windowLabels.js', 'limits/historyModel.js', 'deviceKind.js', 'sessionActivityProviders.js', 'sessionLive.js', 'sessionGroups.js']) {
    vm.runInContext(fs.readFileSync(path.resolve(__dirname, '../../src/shared', file), 'utf8'), browser);
  }
  vm.runInContext(fs.readFileSync(path.resolve(__dirname, '../../app/src/main/assets/model.js'), 'utf8'), browser);
  assert.equal(browser.window.MonitorModel.quota(hark(), hark().windows[0]).detail, '125 / 100');
  assert.equal(browser.window.MonitorModel.sessionModelLabel({ latestModel: 'inkling-2-small' }), 'inkling-2-small');
  assert.equal(browser.window.MonitorModel.cacheEfficiency({ totalTokens: 200, cacheReadTokens: 150,
    outputTokens: 0, capabilities: { tokenComponents: true } }).percent, 75);
});
