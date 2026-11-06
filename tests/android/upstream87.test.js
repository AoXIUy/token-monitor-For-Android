'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const M = require('../../app/src/main/assets/model');
const H = require('../../src/shared/limits/historyModel');
const limits = require('../fixtures/upstream87Limits.json');
const fixture = () => structuredClone(limits.providers);

test('MiniMax Code, API billing and Token Plan keep independent identities, units and balances', () => {
  const [code, api, plan] = fixture();
  assert.equal(M.limitAccount(code).productLabel, 'MiniMax Code');
  assert.equal(M.limitAccount(api).productLabel, 'MiniMax API');
  assert.equal(M.limitAccount(plan).productLabel, 'MiniMax Token Plan');
  assert.equal(M.limitAccount(code).regionLabel, '中国');
  assert.equal(M.limitAccount(plan).regionLabel, '国际');
  assert.equal(new Set([code, api, plan].map(row => M.limitAccount(row).key)).size, 3);
  assert.notEqual(M.limitAccount(code).key, M.limitAccount({ ...api, accountKey: code.accountKey }).key);
  assert.notEqual(M.limitAccount(api).key, M.limitAccount({ ...api, region: 'en' }).key);
  assert.equal(M.quota(code, code.windows[0]).value, '4624.00 积分');
  assert.equal(M.quota(api, api.windows[0]).value, '¥14.97');
  assert.equal(H.historyReadings(code.windows[0]).primary.unit, 'CREDITS');
  assert.equal(H.historyReadings(api.windows[0]).primary.unit, 'CNY');
});

test('confirmed same-region MiniMax links group headings while retaining original product readings', () => {
  const providers = fixture();
  const before = JSON.stringify(providers);
  const groups = M.limitGroups([providers[1], providers[2], providers[0]]);
  assert.equal(groups.length, 2);
  const linked = groups.find(group => group.linked);
  assert.deepEqual(linked.providers, [providers[0], providers[1]]);
  assert.equal(linked.providers[0], providers[0]);
  assert.equal(linked.providers[1].balance.amount, 14.97);
  assert.equal(linked.providers[0].windows[0].remaining, 4624);
  assert.equal(JSON.stringify(providers), before);
});

test('unconfirmed, keyless, different-account and cross-region readings remain separate', () => {
  const [code, api] = fixture();
  for (const other of [
    { ...api, relatedAccountKey: undefined }, { ...api, relatedAccountKey: 'invalid' },
    { ...api, region: 'en' }, { ...api, relatedAccountKey: `sha256:${'f'.repeat(64)}` },
    { ...api, accountKey: '' }, { ...api, accountKey: code.accountKey },
  ]) {
    const groups = M.limitGroups([code, other]);
    assert.equal(groups.length, 2);
    assert.ok(groups.every(group => !group.linked));
  }
  const renamed = { ...code, accountName: 'Same label' };
  const second = { ...api, accountName: 'Same label', relatedAccountKey: '' };
  assert.equal(M.limitGroups([renamed, second]).length, 2);
});

test('adding or removing unrelated accounts preserves existing history component identities', () => {
  const [code, api, plan] = fixture();
  const find = (groups, row) => groups.find(group => group.providers.includes(row)).key;
  const before = M.limitGroups([code, api, plan]);
  const after = M.limitGroups([{ provider: 'claude', accountKey: 'another-account' }, plan, api, code]);
  assert.equal(find(before, plan), find(after, plan));
  assert.equal(find(before, code), find(after, code));
  assert.equal(find(before, api), find(after, api));
});

test('API failures retain Code health and are never promoted or merged into its history key', () => {
  const [code, api] = fixture();
  const failed = { ...api, status: 'unauthorized', stale: true };
  const selected = M.select({ limits: { providers: [code, failed] } }, '', 'today');
  assert.equal(selected.providers.length, 2);
  const group = M.limitGroups(selected.providers)[0];
  assert.equal(group.providers[0].status, 'ok');
  assert.equal(group.providers[1].status, 'unauthorized');
  assert.notEqual(M.limitAccount(group.providers[0]).key, M.limitAccount(group.providers[1]).key);
});

test('API cash Spend preserves zero and unknown periods without assigning them to Code or Token Plan', () => {
  const [code, api, plan] = fixture();
  assert.deepEqual(M.limitSpend(api), [
    { key: 'todaySpend', label: '今日', value: '¥0.00' },
    { key: 'weekSpend', label: '近7天', value: '—' },
    { key: 'monthSpend', label: '本月', value: '¥5.66' },
    { key: 'allTimeSpend', label: '累计', value: '¥89.20' },
  ]);
  assert.deepEqual(M.limitSpend({ ...code, balance: api.balance }), []);
  assert.deepEqual(M.limitSpend({ ...plan, balance: api.balance }), []);
  assert.deepEqual(M.limitSpend({ ...api, balance: { amount: 0, currency: 'USD' } }), []);
  assert.deepEqual(M.limitSpend({ ...api, balance: { todaySpend: 7, currency: 'CREDITS' } }), []);
  assert.equal(M.limitSpend({ ...api, balance: { currency: 'USD', allTimeSpend: 0 } })[0].value, '—');
});

test('unlimited and Video quotas render their actual semantics without inventing a weekly cycle', () => {
  const [code] = fixture();
  assert.equal(M.quota(code, code.windows[1]).value, '无限额');
  assert.equal(M.quota(code, code.windows[1]).percent, null);
  const video = code.windows[3];
  assert.deepEqual(M.quota(code, video), { label: 'Video', value: '15% 已用', percent: 15, remaining: false, detail: '3/20 次' });
  const now = Date.parse('2026-11-06T02:00:00Z');
  assert.equal(M.quotaTrendBounds(code, video, now).cycle, false);
  assert.equal(M.quotaTrendBounds(code, code.windows[2], now).cycle, true);
  assert.equal(M.quotaTrendBounds(code, { ...video, windowMinutes: 120 }, now).start, Date.parse(video.resetsAt) - 120 * 60000);
});

test('monthly usage remains available from unchanged full GET stats after upstream upload deltas', () => {
  const month = { totalTokens: 2400, costUsd: 12.34, clients: { mcode: 2400 }, clientCosts: { mcode: 12.34 } };
  const stats = { periods: { today: { totalTokens: 2 }, month }, devices: [{ deviceId: 'pc', periods: { month } }] };
  assert.equal(M.select(stats, '', 'month').period, month);
  assert.equal(M.select(stats, 'pc', 'month').period, month);
  assert.equal(M.breakdown(month, 'clients')[0].tokens, 2400);
  assert.equal(M.breakdown(month, 'clients')[0].cost, 12.34);
});

test('packaged MiniMax display uses the portable upstream window-text helper in a browser', () => {
  const browser = vm.createContext({ window: {} });
  for (const name of ['compactTokens.js', 'limits/balanceDisplay.js', 'limits/windowText.js',
    'limits/windowLabels.js', 'limits/historyModel.js', 'deviceKind.js', 'sessionActivityProviders.js', 'sessionLive.js', 'sessionGroups.js']) {
    vm.runInContext(fs.readFileSync(path.resolve(__dirname, '../../src/shared', name), 'utf8'), browser, { filename: name });
  }
  vm.runInContext(fs.readFileSync(path.resolve(__dirname, '../../app/src/main/assets/model.js'), 'utf8'), browser);
  const [code] = fixture();
  assert.equal(browser.window.MonitorModel.quota(code, code.windows[3]).detail, '3/20 次');
  assert.equal(browser.window.MonitorModel.limitGroups(fixture()).filter(group => group.linked).length, 1);
});
