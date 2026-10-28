'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const M = require('../../app/src/main/assets/model');
const live = require('../../src/shared/sessionLive');

const now = Date.parse('2026-10-25T08:00:00Z');
const iso = (offset = 0) => new Date(now + offset).toISOString();
function fixture(patch = {}, optionPatch = {}) {
  const row = { key: 'codex:test', client: 'codex', sessionId: 'test', lastUsedAt: iso(-1000), turnEnded: false, ...patch };
  const device = { deviceId: 'pc', updatedAt: iso(), stale: false, periods: { today: { sessions: { [row.key]: row } } } };
  return { row, options: { now, connected: true, foreground: true, fetchedAt: now, period: 'today', stats: { devices: [device] }, ...optionPatch } };
}
function status(patch, options) {
  const f = fixture(patch, options);
  return M.sessionStatus(f.row, f.options);
}

test('Android sessions display fresh native running, waiting and idle readings with their provenance', () => {
  for (const state of ['running', 'waiting', 'idle']) {
    const result = status({ turnEnded: true, liveActivity: { state, observedAt: iso(-5000) } });
    assert.equal(result.state, state);
    assert.equal(result.source, 'native');
    assert.equal(result.observedAt, iso(-5000));
    assert.equal(result.nextChangeAt, now + 25000);
  }
});

test('Android status uses the shared thirty-second lease and falls back at its exact boundary', () => {
  const f = fixture({ turnEnded: true, liveActivity: { state: 'running', observedAt: iso(-29000) } });
  assert.equal(M.sessionStatus(f.row, f.options).state, 'running');
  const expired = M.sessionStatus(f.row, { ...f.options, now: now + 1000 });
  assert.equal(expired.state, 'ended');
  assert.equal(expired.source, 'transcript');
  assert.equal(expired.label, '本轮已结束');
  assert.equal(live.sessionActivityState(f.row, now + 1000), expired.state);
});

test('Android transcript states preserve waiting, end markers and the ten-minute inactivity boundary', () => {
  assert.equal(status({ waitingForInput: true }).state, 'waiting');
  assert.equal(status({ waitingForInput: true, turnEnded: true }).state, 'ended');
  assert.equal(status({ lastUsedAt: iso(-live.RUNNING_WINDOW_MS), waitingForInput: true }).state, 'waiting');
  assert.equal(status({ lastUsedAt: iso(-live.RUNNING_WINDOW_MS - 1), waitingForInput: true }).state, 'idle');
  assert.equal(status({ turnEnded: undefined }).label, '运行中');
  assert.equal(status({ turnEnded: undefined }).source, 'inferred');
});

test('Android never presents archived or deleted accounting rows as running', () => {
  for (const flag of ['archived', 'deleted', 'sourceDeleted']) {
    const result = status({ [flag]: true, liveActivity: { state: 'running', observedAt: iso() } }, { connected: false });
    assert.equal(result.state, 'archived');
    assert.equal(result.label, '已归档');
    assert.equal(result.nextChangeAt, 0);
  }
});

test('Android remote activity rejects future peer clocks and unknown live observations', () => {
  assert.equal(status({ turnEnded: true, liveActivity: { state: 'running', observedAt: iso(1000) } }).state, 'ended');
  assert.equal(status({ turnEnded: true, liveActivity: { state: 'unknown', observedAt: iso() } }).state, 'ended');
  assert.equal(status({ lastUsedAt: iso(1000) }).state, 'unknown');
  assert.equal(status({ lastUsedAt: '' }).state, 'unknown');
  // Independently stamped valid live evidence still works when accounting's clock is skewed.
  assert.equal(status({ lastUsedAt: iso(1000), liveActivity: { state: 'waiting', observedAt: iso() } }).state, 'waiting');
});

test('Android stops claiming current activity after disconnect, backgrounding or thirty seconds without stats', () => {
  const row = { liveActivity: { state: 'running', observedAt: iso() } };
  assert.equal(status(row, { connected: false }).state, 'unknown');
  assert.equal(status(row, { foreground: false }).label, '已暂停');
  assert.equal(status(row, { fetchedAt: now - 30000 }).label, '状态已过期');
  assert.equal(status(row, { fetchedAt: now + 1 }).state, 'unknown');
  assert.equal(status(row, { fetchedAt: now - 29999 }).state, 'running');
});

test('Android attributes live evidence to its actual device even when another device has newer accounting', () => {
  const f = fixture({ liveActivity: { state: 'running', observedAt: iso(-1000) } });
  const owner = { ...f.options.stats.devices[0], stale: true };
  const other = { ...owner, deviceId: 'other', stale: false, periods: { today: { sessions: { [f.row.key]: { ...f.row, liveActivity: { state: 'idle', observedAt: iso(-2000) } } } } } };
  const options = { ...f.options, stats: { devices: [owner, other] } };
  assert.equal(M.sessionStatus(f.row, options).state, 'unknown');
  assert.equal(M.sessionStatus(f.row, { ...options, stats: { devices: [{ ...owner, stale: false }, other] } }).state, 'running');
  assert.equal(M.sessionStatus(f.row, { ...options, deviceId: 'other' }).state, 'unknown');
});

test('Android will not borrow an unrelated online device to promote a stale transcript', () => {
  const f = fixture();
  const owner = { ...f.options.stats.devices[0], stale: true };
  const other = { deviceId: 'other', stale: false, periods: { today: { sessions: {} } } };
  assert.equal(M.sessionStatus(f.row, { ...f.options, stats: { devices: [owner, other] } }).state, 'unknown');
  assert.equal(M.sessionStatus(f.row, { ...f.options, stats: { devices: [] } }).state, 'unknown');
});

test('Android shares provider admission and Grok Bot activity rules with the desktop', () => {
  const grok = status({ key: 'cursor:sand-subagent-test', client: 'cursor', sessionId: 'sand-subagent-test', turnEnded: undefined });
  assert.equal(grok.state, 'idle');
  const unsupported = status({ key: 'future:test', client: 'future', turnEnded: true, liveActivity: { state: 'running', observedAt: iso() } });
  assert.equal(unsupported.state, 'ended');
});

test('Android status projection does not mutate the Hub session or owner records', () => {
  const f = fixture({ liveActivity: { state: 'waiting', observedAt: iso() } });
  const before = JSON.stringify(f);
  M.sessionStatus(f.row, f.options);
  assert.equal(JSON.stringify(f), before);
});

test('Android Antigravity running state keeps its canonical label and separate inference provenance', () => {
  const running = { key: 'antigravity:test', client: 'antigravity', turnEnded: undefined };
  const result = status(running);
  assert.equal(result.state, 'running');
  assert.equal(result.label, '运行中');
  assert.equal(result.source, 'inferred');
  assert.match(result.detail, /推断/);
  assert.equal(status({ ...running, turnEnded: false }).source, 'transcript');
  assert.equal(status({ ...running, turnEnded: true }).state, 'ended');
});

test('Android Antigravity inference never bypasses inactivity, archive, transport or source freshness rules', () => {
  const row = { key: 'antigravity:test', client: 'antigravity', turnEnded: undefined };
  assert.equal(status({ ...row, lastUsedAt: iso(-live.RUNNING_WINDOW_MS - 1) }).state, 'idle');
  assert.equal(status({ ...row, archived: true }).state, 'archived');
  assert.equal(status(row, { connected: false }).state, 'unknown');
  assert.equal(status(row, { fetchedAt: now - 30000 }).state, 'unknown');
  const f = fixture(row);
  f.options.stats.devices[0].stale = true;
  assert.equal(M.sessionStatus(f.row, f.options).state, 'unknown');
});
