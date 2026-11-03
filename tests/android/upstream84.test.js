'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const M = require('../../app/src/main/assets/model');
const limits = require('../fixtures/upstream84Limits.json');

test('Android distinguishes simultaneous Muse Code and web readings and keeps the web identity across winning devices', () => {
  const common = { provider: 'muse', sourceDeviceId: 'pc', accountKey: '', planLabel: 'Power' };
  const cli = { ...common, source: 'cli' };
  const web = { ...common, source: 'web' };
  assert.notEqual(M.limitAccount(cli).key, M.limitAccount(web).key);
  assert.equal(M.limitAccount(cli).productLabel, 'Muse Code');
  assert.equal(M.limitAccount(web).productLabel, 'Muse (Meta)');
  assert.equal(M.limitAccount(web).key, M.limitAccount({ ...web, sourceDeviceId: 'laptop' }).key);
  assert.notEqual(M.limitAccount(cli).key, M.limitAccount({ ...cli, sourceDeviceId: 'laptop' }).key);
  assert.equal(M.limitAccount({ ...common, source: undefined }).productLabel, 'Muse Code');
});

test('Android retains the Hub Muse CLI/web partition without duplicating or merging allowances', () => {
  const now = new Date().toISOString();
  const devices = ['pc', 'laptop'].map(deviceId => ({ deviceId, updatedAt: now, limits: {
    updatedAt: now, providers: ['cli', 'web'].map(source => ({ provider: 'muse', source, status: 'ok', updatedAt: now,
      windows: [{ kind: 'weekly', usedPercent: 25 }] })),
  } }));
  const stats = { devices, limits: { providers: [
    ...devices.map(device => ({ ...device.limits.providers[0], sourceDeviceId: device.deviceId })),
    { ...devices[0].limits.providers[1], sourceDeviceId: 'pc' },
  ] } };
  assert.equal(stats.limits.providers.length, 3);
  assert.equal(new Set(stats.limits.providers.map(row => M.limitAccount(row, stats).key)).size, 3);
  assert.equal(stats.limits.providers.filter(row => M.limitAccount(row, stats).productLabel === 'Muse Code').length, 2);
  assert.equal(stats.limits.providers.filter(row => M.limitAccount(row, stats).productLabel === 'Muse (Meta)').length, 1);
});

test('Android prefers Muse website token allowance text and falls back to the reported dollar balance', () => {
  const provider = structuredClone(limits.muse);
  const extra = provider.windows.find(window => window.metric === 'credits');
  const reading = M.quota(provider, extra);
  assert.equal(reading.label, '额外 Tokens');
  assert.equal(reading.value, '1.5B Tokens');
  assert.equal(reading.percent, null);
  assert.equal(reading.description, '');
  assert.equal(extra.remaining, 60, 'presentation must not rewrite the measured USD field as token usage');
  assert.equal(M.quota(provider, { ...extra, resetDescription: '' }).value, '$60.00');
  assert.equal(provider.windows[0].resetDescription, '2.8B tokens left');
});

test('Android displays Manus credits as points while preserving its independent refresh allowance', () => {
  const provider = structuredClone(limits.manus);
  const credits = provider.windows.find(window => window.metric === 'credits');
  assert.equal(M.quota(provider, credits).value, '1180.00 积分');
  assert.equal(M.quota(provider, credits).percent, null);
  assert.equal(M.quota(provider, provider.windows.find(window => window.kind === 'daily')).value, '40% 已用');
  assert.equal(M.quota(provider, { ...credits, remaining: 0 }).value, '0.00 积分');
  assert.equal(M.quota({}, { metric: 'credits', currency: 'CREDITS', showMeter: false }).value, '—');
});

test('Android reasoning effort follows the current main session without borrowing child settings', () => {
  for (const client of ['codex', 'claude']) {
    assert.equal(M.sessionReasoningEffort({ client, reasoningEffort: ' high ' }), 'high');
    for (const reasoningEffort of [null, undefined, 'unknown', 'not valid']) {
      assert.equal(M.sessionReasoningEffort({ client, reasoningEffort }), null);
    }
  }
  assert.equal(M.sessionReasoningEffort({ client: 'cursor', reasoningEffort: 'high' }), null);
  const rows = M.sessions({ sessions: {
    'codex:parent': { client: 'codex', sessionId: 'parent', reasoningEffort: 'low', lastUsedAt: '2026-11-01T10:00:00Z' },
    'codex:child': { client: 'codex', sessionId: 'child', parentSessionId: 'parent', reasoningEffort: 'xhigh', lastUsedAt: '2026-11-01T10:01:00Z' },
  } });
  assert.equal(rows.length, 1);
  assert.equal(M.sessionReasoningEffort(rows[0]), 'low');
});

test('Android per-model components preserve observed coverage and leave unobserved model buckets unknown', () => {
  const components = Object.freeze({ totalTokens: 80, inputTokens: 20, cacheReadTokens: 30, cacheWriteTokens: 10, outputTokens: 20 });
  const stats = { periods: { today: { sessions: { 'codex:sample': {
    client: 'codex', sessionId: 'sample', totalTokens: 200, models: { first: 100, second: 100 },
    modelTokenComponents: { first: components },
  } } } } };
  const before = JSON.stringify(stats);
  const data = M.sessionDetail(stats, 'codex:sample');
  assert.deepEqual(data.models.find(model => model.id === 'first').components, components);
  assert.equal(data.models.find(model => model.id === 'second').components, undefined);
  assert.equal(data.models.find(model => model.id === 'first').tokens, 100);
  assert.equal(JSON.stringify(stats), before);
});

test('Android consumes normalized v0.84 metadata and limits without changing the Hub payload', () => {
  const stamp = '2026-11-01T10:00:00Z';
  const stats = { devices: [{ deviceId: 'pc' }], periods: { today: { totalTokens: 100,
    sessions: { 'codex:sample': { client: 'codex', sessionId: 'sample', lastUsedAt: stamp,
      totalTokens: 100, models: { first: 100 }, reasoningEffort: 'high',
      promptCache: { observedAt: stamp, ttlSeconds: 1800 },
      modelTokenComponents: { first: { totalTokens: 80, inputTokens: 20, cacheReadTokens: 30, cacheWriteTokens: 10, outputTokens: 20 } },
    } },
  } }, limits: { providers: [
    { provider: 'muse', source: 'cli', sourceDeviceId: 'pc', status: 'ok', windows: [{ kind: 'weekly', usedPercent: 10 }] },
    { ...structuredClone(limits.muse), sourceDeviceId: 'pc' },
    structuredClone(limits.manus),
  ] } };
  const before = JSON.stringify(stats);
  const detail = M.sessionDetail(stats, 'codex:sample');
  assert.equal(M.sessionReasoningEffort(detail.row), 'high');
  assert.equal(detail.promptCache, null);
  assert.equal(detail.models[0].components.totalTokens, 80);
  const providers = M.select(stats, '', 'today').providers;
  assert.equal(new Set(providers.map(provider => M.limitAccount(provider, stats).key)).size, 3);
  assert.equal(JSON.stringify(stats), before);
});
