'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const crypto = require('node:crypto');
const M = require('../../app/src/main/assets/model');
const H = require('../../src/shared/limits/historyModel');

test('OpenDesign workspaces retain separate identities and stale/unauthorized last-good readings', () => {
  const window = { kind: 'session', label: 'Session', windowMinutes: 300, used: 24, limit: 100,
    usedPercent: 24, resetsAt: '2026-11-05T06:00:00Z' };
  const providers = ['workspace-a', 'workspace-b'].map((accountKey, i) => ({ provider: 'opendesign', accountKey,
    accountName: 'Same workspace name', source: 'web', sourceDeviceId: `device-${i}`, status: 'ok', windows: [window] }));
  assert.notEqual(M.limitAccount(providers[0]).key, M.limitAccount(providers[1]).key);
  assert.equal(M.limitAccount(providers[0]).key, M.limitAccount({ ...providers[0], sourceDeviceId: 'mirror' }).key);
  const stats = { limits: { providers } };
  assert.equal(M.select(stats, '', 'today').providers.length, 2);
  const before = JSON.stringify(stats);
  assert.equal(M.quota(providers[0], window).value, '24% 已用');
  assert.equal(M.quota({ ...providers[0], stale: true, status: 'unauthorized' }, window).value, '24% 已用');
  assert.equal(JSON.stringify(stats), before);
});

test('balance-only accounts display actual units without inventing percentages or mutating the Hub payload', () => {
  const provider = { provider: 'thirdparty', balance: { amount: 0, monthSpend: 100, currency: 'USD' }, windows: [] };
  const before = JSON.stringify(provider);
  const [window] = M.limitWindows(provider);
  assert.equal(M.quota(provider, window).value, '$0.00');
  assert.equal(M.quota(provider, window).percent, null);
  assert.equal(H.historyReadings(window).primary.unit, 'USD');
  assert.equal(JSON.stringify(provider), before);
  assert.deepEqual(M.limitWindows({ provider: 'unknown' }), []);
  assert.deepEqual(M.limitWindows({ balance: { amount: null } }), []);
  provider.windows = [{ kind: 'credits', metric: 'credits', remaining: 5, currency: 'CREDITS', showMeter: false }];
  assert.equal(M.limitWindows(provider).length, 1);
  assert.equal(M.quota(provider, provider.windows[0]).value, '5.00 积分');
});

test('quota history uses measured quota percentages and retains pure wallets and spend in their currency', () => {
  assert.deepEqual(H.historyReadings({ kind: 'weekly', usedPercent: 0 }).primary, { value: 0, unit: 'pp', balance: false });
  assert.equal(H.historyReadings({ metric: 'credits', remaining: 5, currency: 'USD' }).primary.unit, 'USD');
  assert.equal(H.historyReadings({ metric: 'credits', remaining: 5, limit: 20, currency: 'USD' }).primary.value, 75);
  assert.equal(H.historyReadings({ metric: 'credits', remaining: 5, limit: 20, showMeter: false, currency: 'USD' }).primary.unit, 'USD');
  assert.equal(H.historyReadings({ metric: 'spend', used: 3, currency: 'CNY' }).primary.value, 3);
  assert.equal(H.historyReadings({ kind: 'session' }).primary, null);
});

test('cycle bounds follow explicit billing durations and OpenDesign five-hour windows', () => {
  const now = Date.parse('2026-11-05T01:00:00Z');
  const reset = '2026-11-05T06:00:00Z';
  assert.deepEqual(H.trendBounds({ kind: 'session', windowMinutes: 300, resetsAt: reset }, now, 'opendesign'),
    { start: now, end: Date.parse(reset), cycle: true });
  assert.equal(H.trendBounds({ kind: 'billing', windowMinutes: 30 * 1440, resetsAt: reset }, now, 'commandcode').start,
    Date.parse(reset) - 30 * 86400000);
  assert.equal(H.trendBounds({ kind: 'billing', resetsAt: reset }, now, 'unknown').cycle, false);
  assert.equal(H.trendBounds({ kind: 'weekly', resetsAt: reset }, now, 'opendesign').end, Date.parse(reset));
});

test('history keeps absent days blank and same-day measured zero distinct from insufficient data', () => {
  const now = new Date(2026, 10, 5, 12).getTime();
  const p = { at: now - 60000, value: 20, unit: 'pp', balance: false, reset: null, interval: 300000 };
  const empty = H.distribution([p], { now });
  assert.equal(empty.buckets.length, 14);
  assert.equal(empty.buckets.at(-1).value, null);
  const zero = H.distribution([p, { ...p, at: now }], { now });
  assert.equal(zero.buckets.at(-1).value, 0);
  assert.ok(zero.buckets.slice(0, -1).every(bucket => bucket.value === null));
  const gap = H.distribution([{ ...p, at: now - 3600000 }, { ...p, at: now, value: 24, breakBefore: true }], { now });
  assert.equal(gap.buckets.at(-1).value, 4);
  assert.equal(gap.buckets.at(-1).uncertain, true);
});

test('reset boundaries, allowance changes and confirmed conflicts cannot become connected ordinary usage', () => {
  const p = { at: 100000, value: 20, unit: 'pp', balance: false, reset: 200000, basis: '100', interval: 300000 };
  assert.equal(H.sameCycle(p, { ...p, at: 150000, value: 24, reset: 200800 }), true);
  assert.equal(H.sameCycle(p, { ...p, at: 250000, value: 24 }), false);
  assert.equal(H.sameCycle(p, { ...p, at: 150000, value: 24, basis: '200' }), false);
  assert.equal(H.segments([{ ...p, uncertainUntil: 110000 }, { ...p, at: 150000, value: 24, breakBefore: true }]).length, 2);
  assert.equal(H.segments([p, { ...p, at: 150000, value: 24, breakBefore: true }]).length, 1, 'failed attempts alone do not invent missing quota');
});

test('new portable history helpers load without Node globals and match recorded snapshot checksums', () => {
  const root = path.resolve(__dirname, '../..');
  const browser = vm.createContext({ window: {} });
  for (const file of ['src/shared/limits/windowLabels.js', 'src/shared/limits/historyModel.js']) {
    vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), browser, { filename: file });
  }
  assert.equal(browser.window.TokenMonitorLimitsHistoryModel.historyReadings({ usedPercent: 24 }).primary.value, 24);
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'docs/upstream-files.json')));
  for (const file of manifest.files) assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(root, file.path))).digest('hex'), file.sha256, file.path);
});

test('history responses are accepted only for accounts in the current native snapshot and reset on connection changes', async () => {
  const { createInitialState, receiveNativeMessage } = await import('../../ui/src/nativeState.js');
  const key = 'a'.repeat(64);
  const stats = { limits: { providers: [{ provider: 'opendesign', androidHistoryKey: key }] } };
  let state = receiveNativeMessage(createInitialState(), { type: 'stats', data: stats, fetchedAt: 100 });
  const before = state;
  assert.equal(receiveNativeMessage(state, { type: 'quotaHistory', key: 'b'.repeat(64), windows: [] }), before);
  state = receiveNativeMessage(state, { type: 'quotaHistory', key, windows: [], persistent: true, now: 100 });
  assert.equal(state.quotaHistory.key, key);
  state = receiveNativeMessage(state, { type: 'connection', url: 'https://new.example.invalid' });
  assert.equal(state.quotaHistory, null);
  assert.equal(receiveNativeMessage(state, { type: 'quotaHistory', key, windows: [] }), state);
});
