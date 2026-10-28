'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const M = require('../../app/src/main/assets/model');

function fixture() {
  const row = { client: 'codex', sessionId: 'child', title: 'Details', totalTokens: 500, costUsd: 1.5,
    inputTokens: 200, outputTokens: 100, cacheReadTokens: 200, cacheWriteTokens: 0, reasoningTokens: 10,
    timedOutputTokens: 80, timedDurationMs: 2000, contextTokens: 120, contextWindow: 200,
    models: { 'gpt-5': 500 }, modelCosts: { 'gpt-5': 1.5 }, providers: { openai: 500 },
    parentClient: 'claude', parentSessionId: 'parent' };
  const sessions = { 'codex:child': row, 'claude:parent': { client: 'claude', sessionId: 'parent', totalTokens: 100 },
    'claude:sub': { client: 'claude', sessionId: 'sub', parentClient: 'codex', parentSessionId: 'child', totalTokens: 50 } };
  const month = { sessions, totalTokens: 650 };
  const stats = { periods: { month }, devices: [
    { deviceId: 'pc', hostname: 'PC', stale: false, periods: { month } },
    { deviceId: 'old', hostname: 'Old', stale: true, periods: { month: { sessions: { 'codex:child': { ...row, totalTokens: 100 } } } } },
  ] };
  return { stats, row };
}

test('Android full session details expose models, context, speed and source snapshots without summing again', () => {
  const { stats } = fixture();
  const data = M.sessionDetail(stats, 'codex:child');
  assert.equal(data.row.totalTokens, 500);
  assert.equal(data.period, 'month');
  assert.equal(data.tokensPerSecond, 40);
  assert.equal(data.context.percentUsed, 60);
  assert.deepEqual(data.models, [{ id: 'gpt-5', label: 'gpt-5', tokens: 500, cost: 1.5 }]);
  assert.deepEqual(data.providers, [{ label: 'openai', tokens: 500 }]);
  assert.deepEqual(data.owners.map((owner) => [owner.deviceId, owner.stale, owner.session.totalTokens]), [['pc', false, 500], ['old', true, 100]]);
});

test('Android session detail follows cross-client parent links without adding delegate usage', () => {
  const { stats } = fixture();
  const data = M.sessionDetail(stats, 'codex:child');
  assert.equal(data.parentKey, 'claude:parent');
  assert.deepEqual(data.children, [{ key: 'claude:sub', label: 'sub' }]);
  assert.equal(data.row.totalTokens, 500);
});

test('Android notification detail lookup falls back between month and today and respects device selection', () => {
  const { stats } = fixture();
  assert.equal(M.sessionDetail(stats, 'codex:child', { period: 'today' }).period, 'month');
  assert.equal(M.sessionDetail(stats, 'codex:child', { deviceId: 'old' }).row.totalTokens, 100);
  assert.equal(M.sessionDetail(stats, 'claude:parent', { deviceId: 'old' }), null);
  assert.equal(M.sessionDetail(stats, 'codex:child', { deviceId: 'removed' }), null);
});

test('Android details preserve missing metrics, zero costs and absent records', () => {
  const stats = { devices: [], periods: { today: { sessions: { 'codex:empty': { client: 'codex', sessionId: 'empty', models: { free: 1 }, modelCosts: { free: 0 } } } } } };
  const data = M.sessionDetail(stats, 'codex:empty');
  assert.equal(data.context, null);
  assert.equal(data.tokensPerSecond, null);
  assert.equal(data.models[0].cost, 0);
  assert.equal(M.sessionDetail(stats, 'codex:missing'), null);
  assert.equal(M.sessionDetail(stats, '__proto__'), null);
  assert.equal(M.sessionDetail(stats, 'constructor'), null);
});

test('Android detail prompt cache uses the shared estimate lease and never mutates a snapshot', () => {
  const { stats, row } = fixture();
  const now = Date.parse('2026-10-25T10:00:00Z');
  row.promptCache = { observedAt: new Date(now - 1000).toISOString(), ttlSeconds: 300 };
  const before = JSON.stringify(stats);
  assert.equal(M.sessionDetail(stats, 'codex:child', { now }).promptCache.minutes, 5);
  assert.equal(M.sessionDetail(stats, 'codex:child', { now: now + 300000 }).promptCache, null);
  assert.equal(JSON.stringify(stats), before);
});
