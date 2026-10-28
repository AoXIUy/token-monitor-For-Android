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
