'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const M = require('../../app/src/main/assets/model');
const { ollamaProvider, accountStats } = require('../fixtures/hubStats');

test('Android keeps Claude organizations with the same email distinct across device and display-name changes', () => {
  const account = { provider: 'claude', accountEmail: 'viewer@example.com', accountName: 'Team', sourceDeviceId: 'workstation' };
  const first = { ...account, accountKey: 'sha256:org-one' };
  const second = { ...account, accountKey: 'sha256:org-two' };
  assert.notEqual(M.limitAccount(first).key, M.limitAccount(second).key);
  assert.equal(M.limitAccount(first).key, M.limitAccount({ ...first, sourceDeviceId: 'laptop' }).key);
  assert.equal(M.limitAccount(first).key, M.limitAccount({ ...first, accountName: 'Renamed team' }).key);
});

test('Android labels device-scoped Muse observations in fleet and single-device views without merging accounts', () => {
  const stats = accountStats();
  const providers = stats.limits.providers.filter(provider => provider.provider === 'muse');
  const accounts = providers.map(provider => M.limitAccount(provider, stats));
  assert.notEqual(accounts[0].key, accounts[1].key);
  assert.deepEqual(accounts.map(account => account.sourceLabel).sort(), ['Development · laptop', 'Development · workstation']);
  for (const provider of providers) {
    const device = stats.devices.find(row => row.deviceId === provider.sourceDeviceId);
    const localProvider = device.limits.providers.find(row => row.provider === 'muse');
    assert.deepEqual(M.limitAccount(localProvider, stats, device.deviceId), M.limitAccount(provider, stats));
    assert.equal(Object.hasOwn(localProvider, 'sourceDeviceId'), false);
    assert.equal(M.quota(provider, provider.windows[0]).value, '0% 已用');
  }
  assert.equal(M.limitAccount({ provider: 'muse' }, stats).sourceLabel, '来源设备未知');
});

test('Android shows normalized Ollama included allowance separately from purchased balance and monthly spend', () => {
  const provider = ollamaProvider();
  const [included, purchased, spend] = provider.windows;
  assert.equal(M.quota(provider, included).value, '$52.50');
  assert.equal(M.quota(provider, included).percent, 87.5);
  assert.equal(M.quota(provider, included).detail, '已用 $7.50 / 总额 $60.00');
  assert.equal(M.quota(provider, purchased).value, '$18.25');
  assert.equal(M.quota(provider, purchased).percent, null);
  assert.equal(purchased.resetDescription, 'Refills to $30 in 3 weeks.');
  assert.equal(M.quota(provider, spend).value, '$4.50');
  assert.equal(M.quota(provider, spend).percent, null);
});

test('Android preserves zero purchased balance and missing normalized amounts', () => {
  const walletWindow = { kind: 'billing', metric: 'credits', label: 'Credit balance', remaining: 0, currency: 'USD', showMeter: false };
  assert.equal(M.quota({ provider: 'ollama' }, walletWindow).value, '$0.00');
  assert.equal(M.quota({ provider: 'ollama' }, walletWindow).percent, null);
  assert.equal(M.quota({}, { metric: 'credits', showMeter: false }).value, '—');
  assert.equal(M.quota({}, { metric: 'spend', used: null }).value, '—');
});

test('Android consumes normalized v0.80.0 account identities and device-scoped limits', () => {
  const stats = accountStats();
  const before = JSON.stringify(stats);
  const providers = M.select(stats, '', 'today').providers;
  assert.equal(providers.length, 5);
  assert.equal(new Set(providers.map(row => M.limitAccount(row, stats).key)).size, 5);
  const laptop = M.select(stats, 'laptop', 'today');
  assert.equal(laptop.providers.length, 2);
  assert.equal(laptop.period.totalTokens, 200);
  assert.equal(M.select(stats, '', 'today').period.totalTokens, 300);
  assert.equal(M.limitAccount(laptop.providers.find(row => row.provider === 'muse'), stats, 'laptop').sourceLabel, 'Development · laptop');
  assert.equal(JSON.stringify(stats), before);
});

test('Android limitHasHistory identifies uncollected tools separately from stale cached accounts', () => {
  assert.equal(M.limitHasHistory({ provider: 'cline', status: 'notConfigured', windows: [], updatedAt: '2026-11-12T00:00:00Z' }), false);
  assert.equal(M.limitHasHistory({ provider: 'trae', status: 'disabled', windows: [] }), false);
  assert.equal(M.limitHasHistory({ provider: 'qoder', status: 'unavailable', windows: [{ kind: 'billing', label: 'Credits' }] }), false);
  assert.equal(M.limitHasHistory({ provider: 'qoder', status: 'unavailable', stale: true, windows: [{ kind: 'billing', label: 'Credits', used: 10, limit: 50, usedPercent: 20 }] }), true);
  assert.equal(M.limitHasHistory({ provider: 'mimo', status: 'error', balance: { amount: 30, currency: 'CNY', cashBalance: 30 } }), true);
  assert.equal(M.limitHasHistory({ provider: 'claude', status: 'ok', windows: [] }), true);
});

test('Android quota supports used/remaining toggle, Cursor labels, v0.92 windowText and multi-currency formatting', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const vm = require('node:vm');

  assert.equal(M.quota({ provider: 'cursor' }, { kind: 'weekly', label: 'Included usage', usedPercent: 12 }).label, 'Weekly');
  assert.equal(M.quota({ provider: 'cursor' }, { kind: 'billing', label: 'Included usage', usedPercent: 34 }).label, 'Monthly');
  assert.equal(M.quota({ provider: 'cursor' }, { kind: 'billing', label: 'On-demand', metric: 'spend', used: 2.35, limit: 20, currency: 'USD' }).value, '$2.35 / $20.00');

  assert.deepEqual(M.quota({ provider: 'claude' }, { kind: 'session', usedPercent: 24 }, { showUsed: false }), {
    label: '当前会话', value: '76% 剩余', percent: 76, remaining: true,
  });

  assert.equal(M.quota({ provider: 'kiro' }, { kind: 'billing', showMeter: false, used: 14, remaining: 0.56 }).value, '14 credits · $0.56');
  assert.equal(M.quota({ provider: 'kiro' }, { kind: 'billing', used: 120, limit: 500, usedPercent: 24 }).detail, '120/500');
  assert.equal(M.quota({ provider: 'zed' }, { kind: 'billing', limitId: 'zed.edit-predictions', used: 120, limit: 500, usedPercent: 24 }).detail, '120/500');
  assert.equal(M.quota({ provider: 'zai' }, { kind: 'daily', remaining: 400, limit: 1000, usedPercent: 60 }).detail, '600 / 1K');
  assert.equal(M.quota({ provider: 'kimi' }, { kind: 'billing', usedPercent: 70, detail: 'Kimi 40% · Code 60%' }).detail, 'Kimi 40% · Code 60%');

  assert.equal(M.money(29000, 'KRW'), '₩29000');
  assert.equal(M.money(29000, 'JPY'), 'JP¥29000');
  assert.equal(M.money(20, 'EUR'), '€20.00');
  assert.deepEqual(M.limitSpend({ provider: 'deepseek', balance: { currency: 'CNY', monthSpend: 10, searchSpend: 1.25, fetchSpend: 0.45 } }), [
    { key: 'monthSpend', label: '本月', value: '¥10.00' },
    { key: 'searchSpend', label: 'Search 搜索', value: '¥1.25' },
    { key: 'fetchSpend', label: 'Fetch 抓取', value: '¥0.45' },
  ]);
  assert.deepEqual(M.limitSpend({ provider: 'thirdparty', balance: { currency: 'USD', todaySpend: 1.2, weekSpend: 5.4, monthSpend: 18.9, allTimeSpend: 120.5 } }).map(r => r.key), [
    'todaySpend', 'weekSpend', 'monthSpend', 'allTimeSpend',
  ]);

  const browser = vm.createContext({ window: {} });
  for (const file of ['compactTokens.js', 'clientCatalog.js', 'currency.js', 'limits/balanceDisplay.js', 'limits/windowText.js',
    'limits/windowLabels.js', 'limits/historyModel.js', 'deviceKind.js', 'sessionActivityProviders.js', 'sessionLive.js', 'sessionGroups.js']) {
    vm.runInContext(fs.readFileSync(path.resolve(__dirname, '../../src/shared', file), 'utf8'), browser, { filename: file });
  }
  vm.runInContext(fs.readFileSync(path.resolve(__dirname, '../../app/src/main/assets/model.js'), 'utf8'), browser);
  assert.equal(browser.window.MonitorModel.money(29000, 'KRW'), '₩29000');
  assert.equal(browser.window.MonitorModel.quota({ provider: 'cursor' }, { kind: 'weekly', label: 'Included usage', usedPercent: 10 }).label, 'Weekly');
  assert.equal(browser.window.MonitorModel.limitHasHistory({ provider: 'cline', status: 'notConfigured', windows: [] }), false);
});
