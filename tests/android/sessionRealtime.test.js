'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const R = require('../../src/shared/sessionRealtime');
const at = Date.parse('2026-11-12T01:00:00Z');
const sample = (offset, tokens, patch = {}) => ({ identity: 'pc:codex:one', at: at + offset, outputTokens: tokens, available: true, ...patch });

test('real session rate uses new output and source elapsed time, never lifetime timing or render time', () => {
  const tracker = R.createTracker();
  assert.equal(tracker.observe(sample(0, 10000), at).tokensPerSecond, null);
  const read = tracker.observe(sample(5000, 10150, { timedOutputTokens: 900000, timedDurationMs: 1000 }), at + 5500);
  assert.equal(read.tokensPerSecond, 30);
  assert.equal(read.tokensPerMinute, 1800);
  assert.equal(read.intervalMs, 5000);
  assert.equal(read.points.length, 1);
  tracker.observe(sample(5000, 10150), at + 10000);
  assert.equal(tracker.read(at + 10000).points.length, 1);
  assert.equal(tracker.read(at + 21000).state, 'stale');
  assert.equal(tracker.read(at + 21000).tokensPerSecond, null);
});

test('fresh unchanged output is measured idle, while missing/offline samples never fabricate zero', () => {
  const tracker = R.createTracker();
  tracker.observe(sample(0, 100), at);
  const idle = tracker.observe(sample(5000, 100), at + 5000);
  assert.equal(idle.state, 'idle');
  assert.equal(idle.tokensPerSecond, 0);
  const offline = tracker.observe(sample(10000, 100, { available: false }), at + 10000);
  assert.equal(offline.state, 'unavailable');
  assert.equal(offline.tokensPerSecond, null);
  assert.equal(offline.points.length, 1);
  assert.equal(tracker.observe(sample(15000, 300), at + 15000).tokensPerSecond, null);
});

test('counter resets, same-time corrections and source switches require a new baseline', () => {
  for (const next of [sample(10000, 5), sample(5000, 200), sample(10000, 200, { identity: 'other' })]) {
    const tracker = R.createTracker();
    tracker.observe(sample(0, 100), at);
    tracker.observe(sample(5000, 150), at + 5000);
    const reset = tracker.observe(next, at + 10000);
    assert.equal(reset.tokensPerSecond, null);
    assert.equal(reset.points.length, 0);
  }
});

test('late final or reordered snapshots cannot replace newer observations or extend their lifetime', () => {
  const tracker = R.createTracker();
  tracker.observe(sample(0, 100), at);
  tracker.observe(sample(5000, 150), at + 5000);
  const late = tracker.observe(sample(4000, 120), at + 6000);
  assert.equal(late.tokensPerSecond, 10);
  assert.equal(late.points.length, 1);
  assert.equal(late.sampledAt, at + 5000);
  assert.equal(tracker.observe(sample(4000, 120), at + 21000).tokensPerSecond, null);
  assert.equal(tracker.read(at + 4000).tokensPerSecond, null);
});

test('long observation gaps are not averaged into a current rate or connected by the chart', () => {
  const tracker = R.createTracker();
  tracker.observe(sample(0, 100), at);
  tracker.observe(sample(5000, 150), at + 5000);
  assert.equal(tracker.observe(sample(50000, 1000), at + 50000).tokensPerSecond, null);
  const next = tracker.observe(sample(55000, 1100), at + 55000);
  assert.equal(next.tokensPerSecond, 20);
  assert.equal(R.chart(next.points, at + 55000).segments.length, 2);
});

test('five-minute history is bounded, timestamp positioned and trimmed without manufactured observations', () => {
  const tracker = R.createTracker();
  for (let i = 0; i <= 500; i++) tracker.observe(sample(i * 1000, i * 10), at + i * 1000);
  const read = tracker.read(at + 500000);
  assert.equal(read.points.length, 300);
  assert.equal(tracker.read(at + 900000).points.length, 0);
  const chart = R.chart([{ start: at, end: at + 5000, rate: 10 }], at + 10000, 300);
  assert.match(chart.segments[0], /^290\.00,/);
  assert.ok(chart.segments[0].includes('295.00,'));
});

test('source selection isolates device copies, rejects stale or missing counters and supports exact native IDs', () => {
  const row = { client: 'codex', sessionId: 'rollout', nativeSessionId: 'native', outputTokens: 20 };
  const device = { deviceId: 'pc', updatedAt: new Date(at).toISOString(), receivedAt: new Date(at).toISOString(), periods: { today: { sessions: { 'codex:rollout': row } } } };
  const stats = { periods: { today: { outputTokens: 999999 } }, devices: [device, { ...device, deviceId: 'other', stale: true }] };
  const sources = R.sessionSources(stats, { client: 'codex', sessionId: 'native' }, at);
  assert.equal(sources.length, 2);
  assert.equal(sources[0].outputTokens, 20);
  assert.equal(sources[0].available, true);
  assert.equal(sources[1].available, false);
  assert.equal(R.sessionSources({ periods: stats.periods }, 'codex:rollout', at).length, 0);
  assert.equal(R.sessionSources(stats, 'codex:rollout', at + 31000)[0].available, false);
  assert.equal(R.sessionSources({ devices: [{ ...device, periods: { today: { sessions: { 'codex:rollout': { ...row, outputTokens: null } } } } }] }, 'codex:rollout', at)[0].available, false);
});

test('malformed and ambiguous source rows never create an attributed session rate', () => {
  assert.deepEqual(R.sessionSources({ devices: {} }, 'codex:one', at), []);
  assert.deepEqual(R.sessionSources({ devices: [null, {}, { deviceId: 'pc', periods: { today: { sessions: { 'codex:one': null } } } }] }, 'codex:one', at), []);
  const row = { client: 'codex', nativeSessionId: 'native', outputTokens: 20 };
  assert.deepEqual(R.sessionSources({ devices: [{ deviceId: 'pc', periods: { today: { sessions: { a: row, b: row } } } }] }, { client: 'codex', sessionId: 'native' }, at), []);
});
