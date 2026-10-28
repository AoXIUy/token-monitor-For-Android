'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const M = require('../../app/src/main/assets/model');

test('Android viewer distinguishes missing quota readings from exhausted quotas', () => {
  assert.equal(M.quota({}, { kind: 'session', usedPercent: null }).value, '暂无读数');
  assert.equal(M.quota({}, { kind: 'session', remainingPercent: 0 }).value, '100% 已用');
  assert.equal(M.quota({}, { kind: 'session', usedPercent: 0 }).value, '0% 已用');
  assert.equal(M.money(null), '—');
  assert.equal(M.money(0), '$0.00');
});

test('Android viewer uses the credits marker for any provider and honors hidden meters', () => {
  const provider = { provider: 'future-provider', balance: { amount: 30, currency: 'CNY', monthSpend: 10 } };
  assert.deepEqual(M.quota(provider, { metric: 'credits', remaining: 0, currency: 'CNY' }), {
    label: '账户余额', value: '¥0.00', percent: 0, remaining: true,
  });
  assert.equal(M.quota(provider, { metric: 'credits' }).percent, 75);
  assert.equal(M.quota(provider, { metric: 'credits', showMeter: false }).percent, null);
  assert.equal(M.quota({}, { metric: 'spend', used: 2.5, currency: 'USD' }).value, '$2.50');
});

test('Android per-device periods expire at the producer boundary while lifetime is retained', () => {
  const now = Date.parse('2026-10-25T00:00:00Z');
  const device = {
    deviceId: 'offline', updatedAt: '2026-10-24T23:59:59Z',
    periodWindows: { today: { endsAt: '2026-10-25T00:00:00Z' }, month: { endsAt: '2026-11-01T00:00:00Z' } },
    periods: { today: { totalTokens: 90 }, month: { totalTokens: 190 }, allTime: { totalTokens: 500 } },
  };
  const stats = { periods: { today: { totalTokens: 999 } }, devices: [device] };
  assert.equal(M.select(stats, 'offline', 'today', now).period, null);
  assert.equal(M.select(stats, 'offline', 'month', now).period.totalTokens, 190);
  assert.equal(M.select(stats, 'offline', 'allTime', now).period.totalTokens, 500);
  assert.equal(M.select(stats, 'deleted', 'today', now).period, null);
  assert.equal(M.select(stats, '', 'today', now).period.totalTokens, 999);
  assert.equal(M.expired({ updatedAt: '2026-10-24T23:59:59Z' }, 'today', now), true);
});

test('Android token components stay unavailable for older or partially classified producers', () => {
  assert.equal(M.components({ totalTokens: 200, cacheReadTokens: 0 }), null);
  assert.equal(M.components({ capabilities: { tokenComponents: false }, totalTokens: 200 }), null);
  assert.deepEqual(M.components({ capabilities: { tokenComponents: true }, totalTokens: 200, cacheReadTokens: 150, outputTokens: 10 }), {
    cached: 150, output: 10, cachePercent: '75.0',
  });
});

test('Android breakdowns preserve unknown costs and never mutate Hub snapshots', () => {
  const period = Object.freeze({ models: Object.freeze({ b: 10, a: 20 }), modelCosts: Object.freeze({ a: 0 }), projects: { opaque: { label: 'App', tokens: 30, costUsd: 1 } } });
  assert.deepEqual(M.breakdown(period, 'models'), [{ id: 'a', label: 'a', tokens: 20, cost: 0 }, { id: 'b', label: 'b', tokens: 10, cost: null }]);
  assert.equal(M.breakdown(period, 'projects')[0].cost, 1);
});

test('Android sessions retain accounting keys and search title, project, client and model', () => {
  const period = { sessions: {
    'codex:older': { client: 'codex', sessionId: 'older', projectLabel: 'Widget', lastUsedAt: '2026-10-24T01:00:00Z', models: { 'gpt-5': 20 } },
    'claude:newer': { client: 'claude', sessionId: 'newer', title: 'Build Android', lastUsedAt: '2026-10-25T01:00:00Z' },
  } };
  assert.deepEqual(M.sessions(period).map((row) => row.key), ['claude:newer', 'codex:older']);
  for (const query of ['widget', 'CODEX', 'gpt-5']) assert.equal(M.sessions(period, query)[0].key, 'codex:older');
  assert.equal(M.sessions(period, 'android').length, 1);
  assert.equal(M.sessions(period, 'absent').length, 0);
});

test('Android daily preview orders real calendar keys and leaves missing days absent', () => {
  const daily = [{ date: '2026-10-25', tokens: 2 }, { date: 'invalid', tokens: 9 }, { date: '2026-10-23', tokens: 1 }];
  assert.deepEqual(M.daily({ historyPreview: { daily } }).map((row) => row.date), ['2026-10-23', '2026-10-25']);
  assert.equal(daily[0].date, '2026-10-25');
});

test('Android Hub-provided text is escaped before rendering in HTML or attributes', () => {
  assert.equal(M.escape('<img src=x onerror="HubNative.disconnect()">\'&'), '&lt;img src=x onerror=&quot;HubNative.disconnect()&quot;&gt;&#39;&amp;');
});

test('Android top-up totals come from the ledger while subscriptions retain their own period price', () => {
  assert.equal(M.subscriptionAmount({ kind: 'subscription', amountMinor: 2000 }), 20);
  assert.equal(M.subscriptionAmount({ kind: 'subscription' }), null);
  assert.equal(M.subscriptionAmount({ kind: 'topup', amountMinor: 0, topUps: [{ amountMinor: 1000 }, { amountMinor: 2500 }] }), 35);
});
