'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const M = require('../../app/src/main/assets/model');
const live = require('../../src/shared/sessionLive');

const now = Date.parse('2026-10-27T04:22:00Z');
const iso = offset => new Date(now + offset).toISOString();
function session(client, sessionId, extra = {}) {
  return { client, sessionId, title: '产品SKILL', totalTokens: 100, costUsd: 0.1,
    inputTokens: 40, outputTokens: 10, cacheReadTokens: 50, messageCount: 2,
    lastUsedAt: iso(-1000), models: { 'gemini-3.8-flash-n': 100 }, ...extra };
}
function periodFor(rows) {
  return { sessions: Object.fromEntries(rows.map(row => [`${row.client}:${row.sessionId}`, row])) };
}
function options(period) {
  return { now, period: 'today', connected: true, foreground: true, fetchedAt: now,
    stats: { devices: [{ deviceId: 'pc', updatedAt: iso(0), stale: false, periods: { today: period } }] } };
}

test('Android Antigravity groups the main conversation and sixteen subagents without losing accounting totals', () => {
  const period = periodFor([session('antigravity', 'main', { totalTokens: 98_498_400 }),
    ...Array.from({ length: 16 }, (_, index) => session('antigravity', `child-${index}`, { parentSessionId: 'main' }))]);
  const before = JSON.stringify(period);
  const rows = M.sessions(period);
  assert.equal(rows.length, 1);
  const group = rows[0];
  assert.equal(group.key, 'session-group:subagents:antigravity:main');
  assert.equal(group.subagentCount, 16);
  assert.equal(group.totalTokens, 98_500_000);
  assert.ok(Math.abs(group.costUsd - 1.7) < 1e-12);
  assert.equal(group.models['gemini-3.8-flash-n'], 1700);
  assert.equal(group.inputTokens, 680);
  assert.equal(group.messageCount, 34);
  assert.equal(group.groupRows.length, 17);
  assert.equal(group.groupRows[0].groupRole, 'main');
  assert.ok(group.groupRows.slice(1).every(row => row.groupRole === 'subagent'));
  assert.equal(group.detailKey, 'antigravity:main');
  assert.equal(M.sessionDetail({ periods: { today: period } }, group.groupRows[1].key).row.totalTokens, 100);
  assert.equal(JSON.stringify(period), before);
});

test('Android searches all family members before pagination and retains complete accounting totals', () => {
  const period = periodFor([session('antigravity', 'main'),
    session('antigravity', 'child', { title: 'Unique delegated task', parentSessionId: 'main', models: { delegated: 100 } }),
    session('antigravity', 'grandchild', { parentSessionId: 'child' }),
    session('antigravity', 'unrelated')]);
  for (const query of ['unique', 'delegated', 'grandchild']) {
    const rows = M.sessions(period, query);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].detailKey, 'antigravity:main');
    assert.equal(rows[0].subagentCount, 2);
    assert.equal(rows[0].totalTokens, 300);
  }
  assert.equal(M.sessions(period).length, 2, 'equal titles alone never imply a relationship');
  assert.equal(M.sessions(period, 'absent').length, 0);
});

test('Android families resolve cross-client parents and logical continuation identities', () => {
  const nativeSessionId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  const rows = [session('codex', 'old', { nativeSessionId, t3ThreadId: 'main-app', lastUsedAt: iso(-2000) }),
    session('claude', 'new', { t3ThreadId: 'main-app', title: 'Latest main' }),
    session('codex', 'child', { parentClient: 'claude', parentSessionId: 'new', t3ThreadId: 'child-app' }),
    session('claude', 'child-continued', { parentClient: 'codex', parentSessionId: 'old', t3ThreadId: 'child-app' })];
  const period = periodFor(rows);
  const [group] = M.sessions(period);
  assert.equal(group.key, 'session-group:subagents:t3:main-app');
  assert.equal(group.title, 'Latest main');
  assert.equal(group.detailKey, 'claude:new');
  assert.equal(group.subagentCount, 1);
  assert.equal(group.totalTokens, 400);
  assert.equal(group.groupRows.filter(row => row.groupRole === 'main').length, 2);
  delete rows[2].parentSessionId;
  delete rows[3].parentSessionId;
  const continuations = M.sessions(periodFor(rows));
  assert.equal(continuations.length, 2);
  assert.ok(continuations.every(row => row.subagentCount === 0));
});

test('Android preserves orphans, cycles and conflicting aliases without losing or duplicating usage', () => {
  const nativeSessionId = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
  const period = periodFor([
    session('antigravity', 'orphan', { parentSessionId: 'missing' }),
    session('antigravity', 'a', { parentSessionId: 'b' }),
    session('antigravity', 'b', { parentSessionId: 'a' }),
    session('codex', 'first', { nativeSessionId, parentSessionId: 'absent-a' }),
    session('codex', 'second', { nativeSessionId, parentSessionId: 'absent-b' }),
    session('codex', 'child-a', { parentSessionId: 'first' }),
    session('codex', 'child-b', { parentSessionId: 'second' }),
  ]);
  const rows = M.sessions(period);
  assert.equal(rows.length, 5);
  assert.equal(new Set(rows.map(row => row.key)).size, rows.length);
  assert.equal(rows.reduce((sum, row) => sum + row.totalTokens, 0), 700);
  assert.equal(new Set(rows.flatMap(row => row.groupRows || [row]).map(row => row.key)).size, 7);
});

test('Android grouped metrics preserve unknown values and free costs', () => {
  const period = periodFor([session('antigravity', 'main', { costUsd: 0 }),
    session('antigravity', 'child', { parentSessionId: 'main', costUsd: null, inputTokens: undefined, unpricedTokens: 20 })]);
  const [group] = M.sessions(period);
  assert.equal(group.costUsd, null);
  assert.equal(group.inputTokens, null);
  assert.equal(group.outputTokens, 20);
  assert.equal(group.unpricedTokens, 20);
  period.sessions['antigravity:child'].costUsd = 0;
  assert.equal(M.sessions(period)[0].costUsd, 0);
});

test('packaged browser globals group sessions without a Node loader', () => {
  const browser = vm.createContext({ window: {} });
  for (const filename of ['src/shared/compactTokens.js', 'src/shared/limits/balanceDisplay.js',
    'src/shared/sessionActivityProviders.js', 'src/shared/sessionLive.js', 'src/shared/sessionGroups.js',
    'app/src/main/assets/model.js']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../..', filename), 'utf8'), browser, { filename });
  }
  const period = periodFor([session('antigravity', 'main'), session('antigravity', 'child', { parentSessionId: 'main' })]);
  const groups = browser.window.MonitorModel.sessions(period);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].subagentCount, 1);
  assert.equal(groups[0].totalTokens, 200);
});

test('Android family status uses real member ownership and advances at each member lease boundary', () => {
  const period = periodFor([
    session('codex', 'main', { turnEnded: true, liveActivity: { state: 'waiting', observedAt: iso(-1000) } }),
    session('claude', 'child', { parentClient: 'codex', parentSessionId: 'main', turnEnded: true,
      liveActivity: { state: 'running', observedAt: iso(-2000) } }),
  ]);
  const [group] = M.sessions(period);
  const opts = options(period);
  assert.equal(M.sessionStatus(group, opts).state, 'running');
  assert.equal(M.sessionStatus(group, opts).nextChangeAt, now + 28000);
  assert.equal(M.sessionStatus(group, { ...opts, now: now + 28000 }).state, 'waiting');
  assert.equal(M.sessionStatus(group, { ...opts, now: now + 29000 }).state, 'ended');
  opts.stats.devices[0].stale = true;
  assert.equal(M.sessionStatus(group, opts).state, 'unknown');
  opts.stats.devices[0].stale = false;
  assert.equal(M.sessionStatus(group, { ...opts, connected: false }).state, 'unknown');
  assert.equal(M.sessionStatus(group, { ...opts, fetchedAt: now - live.LIVE_ACTIVITY_TTL_MS }).state, 'unknown');
});
