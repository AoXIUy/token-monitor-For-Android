'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const M = require('../../app/src/main/assets/model');
const catalog = require('../../src/shared/clientCatalog');
const windowText = require('../../src/shared/limits/windowText');

function mistral(sourceDeviceId = 'pc') {
  return { provider: 'mistral', source: 'web', sourceDeviceId, accountKey: '', status: 'ok', windows: [
    { kind: 'billing', label: 'Included API', usedPercent: 25, used: 25, limit: 100, remaining: 75, currency: 'USD', resetsAt: '2026-11-14T00:00:00Z' },
    { kind: 'billing', label: 'Included Vibe Code', usedPercent: 20, used: 10, limit: 50, remaining: 40, currency: 'USD' },
    { kind: 'billing', label: 'Balance', metric: 'credits', remaining: 12, currency: 'USD', showMeter: false },
  ] };
}

test('new client names come from the portable catalog without renaming model or provider identities', () => {
  for (const [id, label] of [['gemini', 'Gemini CLI'], ['mistral', 'Mistral Vibe'], ['prime-agent', 'Prime Agent'], ['jcode', 'Jcode']]) {
    assert.equal(M.clientLabel(id), label);
    assert.equal(catalog.CLIENT_LABELS[id], label);
    assert.ok(catalog.CLIENT_IDS.includes(id));
  }
  assert.equal(M.clientLabel('custom-client'), 'custom-client');
  assert.deepEqual(M.breakdown({ models: { 'gemini-2.5-pro': 42, 'mistral-large': 8 } }, 'models').map(row => row.label), ['gemini-2.5-pro', 'mistral-large']);
});

test('new clients keep complete accounting and independent sessions even when titles match', () => {
  const now = Date.parse('2026-11-09T02:00:00Z');
  const sessions = Object.fromEntries(['gemini', 'mistral', 'prime-agent', 'jcode'].map((client, index) => [`${client}:session`, {
    client, sessionId: 'session', title: 'Same title', totalTokens: 120, inputTokens: 80, cacheReadTokens: 20, outputTokens: 20,
    costUsd: index, lastUsedAt: new Date(now - 1000).toISOString(),
  }]));
  const period = { sessions, totalTokens: 480, inputTokens: 320, outputTokens: 80, cacheReadTokens: 80, costUsd: 6 };
  const stats = { periods: { today: period }, devices: [{ deviceId: 'pc', stale: false, updatedAt: new Date(now).toISOString(), periods: { today: period } }] };
  const before = JSON.stringify(stats);
  const rows = M.sessions(period);
  assert.equal(rows.length, 4);
  assert.equal(rows.reduce((sum, row) => sum + row.totalTokens, 0), 480);
  for (const row of rows) {
    assert.equal(M.filterSessionTools(rows, row.client).rows.length, 1);
    const detail = M.sessionDetail(stats, row.key, { period: 'today', now });
    assert.equal(detail.row.totalTokens, 120, 'cached prompt tokens are already included in the accounting total');
    assert.equal(detail.row.messageCount, undefined, 'session-level sources do not invent message attribution');
    const status = M.sessionStatus(row, { stats, period: 'today', connected: true, foreground: true, fetchedAt: now, now });
    assert.equal(status.source, 'inferred');
    assert.equal(status.state, 'running');
  }
  assert.equal(JSON.stringify(stats), before);
});

test('Mistral API and Vibe allowances preserve percentage, money details and independent wallet', () => {
  const provider = mistral();
  const before = JSON.stringify(provider);
  assert.equal(M.quota(provider, provider.windows[0]).detail, '$25.00 / $100.00');
  assert.equal(M.quota(provider, provider.windows[0]).percent, 25);
  assert.equal(M.quota(provider, provider.windows[1]).detail, '$10.00 / $50.00');
  assert.equal(M.quota(provider, provider.windows[2]).value, '$12.00');
  assert.equal(M.quota(provider, provider.windows[2]).percent, null);
  assert.equal(M.limitWindows(provider).length, 3);
  assert.equal(M.quotaTrendBounds(provider, provider.windows[0], Date.parse('2026-11-09T02:00:00Z')).cycle, false, 'no fabricated month duration');
  assert.equal(JSON.stringify(provider), before);
});

test('percentage-only and partially available Mistral readings never invent money or zero quota', () => {
  const provider = mistral();
  const fallback = { kind: 'billing', label: 'Included Vibe Code', usedPercent: 68 };
  assert.equal(M.quota(provider, fallback).value, '68% 已用');
  assert.equal(M.quota(provider, fallback).detail, undefined);
  const missing = M.quota(provider, { kind: 'billing', label: 'Included API' });
  assert.equal(missing.value, '暂无读数');
  assert.equal(missing.percent, null);
  assert.equal(M.quota({ ...provider, status: 'unauthorized', stale: true }, provider.windows[0]).value, '25% 已用');
  const negative = { ...provider.windows[2], remaining: -3 };
  assert.equal(M.quota(provider, negative).value, '$-3.00');
  assert.equal(windowText.limitWindowText(provider, provider.windows[2], { showLimitUsed: true }).detail, '');
});

test('anonymous Mistral sessions remain device-scoped across same-name machines', () => {
  const providers = [mistral('pc'), mistral('laptop')];
  const stats = { limits: { providers }, devices: [{ deviceId: 'pc', hostname: 'Work' }, { deviceId: 'laptop', hostname: 'Work' }] };
  assert.notEqual(M.limitAccount(providers[0], stats).key, M.limitAccount(providers[1], stats).key);
  assert.equal(M.limitGroups(providers, stats).length, 2);
  assert.deepEqual(M.select(stats, '', 'today').providers, providers);
});

test('MiMo products and wallet detail preserve actual amounts without adding gift and cash again', () => {
  const consoleRow = { provider: 'mimo', accountKey: 'console', accountLabel: 'Console', planLabel: 'Plus',
    balance: { amount: 50, giftBalance: 0, cashBalance: 30, currency: 'CNY' }, windows: [] };
  const desktop = { ...consoleRow, accountKey: 'membership', accountLabel: 'Desktop Membership' };
  assert.equal(M.limitAccount(consoleRow).productLabel, 'MiMo Console');
  assert.equal(M.limitAccount(desktop).productLabel, 'MiMo Desktop');
  assert.notEqual(M.limitAccount(consoleRow).key, M.limitAccount(desktop).key);
  assert.deepEqual(M.limitBalanceDetails(consoleRow), [
    { key: 'giftBalance', label: '赠送余额', value: '¥0.00' },
    { key: 'cashBalance', label: '现金余额', value: '¥30.00' },
  ]);
  assert.equal(M.quota(consoleRow, M.limitWindows(consoleRow)[0]).value, '¥50.00');
  assert.deepEqual(M.limitBalanceDetails({ ...consoleRow, balance: { currency: 'CNY' } }), []);
});

test('browser packaging exposes client catalog and current Mistral window text without a Node loader', () => {
  const browser = vm.createContext({ window: {} });
  for (const file of ['compactTokens.js', 'clientCatalog.js', 'limits/balanceDisplay.js', 'limits/windowText.js',
    'limits/windowLabels.js', 'limits/historyModel.js', 'deviceKind.js', 'sessionActivityProviders.js', 'sessionLive.js', 'sessionGroups.js']) {
    vm.runInContext(fs.readFileSync(path.resolve(__dirname, '../../src/shared', file), 'utf8'), browser, { filename: file });
  }
  vm.runInContext(fs.readFileSync(path.resolve(__dirname, '../../app/src/main/assets/model.js'), 'utf8'), browser);
  const provider = mistral();
  assert.equal(browser.window.MonitorModel.clientLabel('gemini'), 'Gemini CLI');
  assert.equal(browser.window.MonitorModel.quota(provider, provider.windows[0]).detail, '$25.00 / $100.00');
});
