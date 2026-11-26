'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const M = require('../../app/src/main/assets/model');

const ROOT = path.resolve(__dirname, '../..');

function loadBrowserModel() {
  const browser = vm.createContext({ window: {} });
  for (const file of [
    'compactTokens.js',
    'clientCatalog.js',
    'currency.js',
    'limits/balanceDisplay.js',
    'limits/windowText.js',
    'limits/windowLabels.js',
    'limits/historyModel.js',
    'deviceKind.js',
    'sessionActivityProviders.js',
    'sessionLive.js',
    'sessionGroups.js',
  ]) {
    vm.runInContext(fs.readFileSync(path.join(ROOT, 'src/shared', file), 'utf8'), browser, { filename: file });
  }
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'app/src/main/assets/model.js'), 'utf8'), browser);
  return browser.window.MonitorModel;
}

test('v0.97.0: sessions() supports sorting by token usage with recent, cost, and key tie-breakers', () => {
  const period = {
    sessions: {
      'codex:recent-small': {
        client: 'codex',
        sessionId: 'recent-small',
        title: 'Fresh small session',
        totalTokens: 1200,
        costUsd: 0.15,
        lastUsedAt: '2026-11-24T10:00:00Z',
      },
      'claude:older-huge': {
        client: 'claude',
        sessionId: 'older-huge',
        title: 'Heavy refactor',
        totalTokens: 85000,
        costUsd: 1.4,
        lastUsedAt: '2026-11-24T08:00:00Z',
      },
      'antigravity:group-main': {
        client: 'antigravity',
        sessionId: 'group-main',
        title: 'Main agent',
        totalTokens: 40000,
        costUsd: 0.6,
        lastUsedAt: '2026-11-24T09:00:00Z',
      },
      'antigravity:group-sub': {
        client: 'antigravity',
        sessionId: 'group-sub',
        parentClient: 'antigravity',
        parentSessionId: 'group-main',
        title: 'Subagent worker',
        totalTokens: 50000,
        costUsd: 0.5,
        lastUsedAt: '2026-11-24T09:05:00Z',
      },
      'zed:tie-older-pricier': {
        client: 'zed',
        sessionId: 'tie-older-pricier',
        title: 'Zed tie older',
        totalTokens: 1200,
        costUsd: 0.9,
        lastUsedAt: '2026-11-24T09:30:00Z',
      },
      'zed:tie-same-time-pricier': {
        client: 'zed',
        sessionId: 'tie-same-time-pricier',
        title: 'Zed tie pricier',
        totalTokens: 1200,
        costUsd: 0.5,
        lastUsedAt: '2026-11-24T10:00:00Z',
      },
    },
  };

  assert.deepEqual(
    M.sessions(period, '', { sortBy: 'recent' }).map((row) => row.key),
    [
      'codex:recent-small',
      'zed:tie-same-time-pricier',
      'zed:tie-older-pricier',
      'session-group:subagents:antigravity:group-main',
      'claude:older-huge',
    ],
  );

  // Grouped family total (90,000) outranks standalone (85,000); ties fall back to recent -> cost -> key.
  assert.deepEqual(
    M.sessions(period, '', { sortBy: 'tokens' }).map((row) => row.key),
    [
      'session-group:subagents:antigravity:group-main',
      'claude:older-huge',
      'zed:tie-same-time-pricier',
      'codex:recent-small',
      'zed:tie-older-pricier',
    ],
  );

  assert.deepEqual(
    M.sessions(period, '', { sortBy: 'cost' }).map((row) => row.key),
    [
      'claude:older-huge',
      'session-group:subagents:antigravity:group-main',
      'zed:tie-older-pricier',
      'zed:tie-same-time-pricier',
      'codex:recent-small',
    ],
  );

  const browserModel = loadBrowserModel();
  assert.deepEqual(
    Array.from(browserModel.sessions(period, '', { sortBy: 'tokens' }), (row) => row.key),
    M.sessions(period, '', { sortBy: 'tokens' }).map((row) => row.key),
  );
});

test('v0.97.0: pending sessions show zero tokens and zero cost until usage arrives while preserving unknown fields', () => {
  const pendingNull = { client: 'codex', sessionId: 'p1', tokenDataUnavailable: true, totalTokens: null, costUsd: null };
  assert.deepEqual(M.sessionUsageDisplay(pendingNull), {
    pending: true,
    tokensText: '0',
    costText: '$0.00',
  });

  const pendingZero = { client: 'claude', sessionId: 'p2', tokenDataUnavailable: true, totalTokens: 0, costUsd: 0 };
  assert.deepEqual(M.sessionUsageDisplay(pendingZero), {
    pending: true,
    tokensText: '0',
    costText: '$0.00',
  });

  const recorded = { client: 'codex', sessionId: 'p1', totalTokens: 2500, costUsd: 0.42 };
  assert.deepEqual(M.sessionUsageDisplay(recorded), {
    pending: false,
    tokensText: '2.5K',
    costText: '$0.42',
  });

  const unknownNonPending = { client: 'codex', sessionId: 'legacy', totalTokens: null, costUsd: null };
  assert.deepEqual(M.sessionUsageDisplay(unknownNonPending), {
    pending: false,
    tokensText: '—',
    costText: '—',
  });

  // Grouped family stays pending only while every member has tokenDataUnavailable === true.
  const allPendingPeriod = {
    sessions: {
      'antigravity:main': {
        client: 'antigravity',
        sessionId: 'main',
        tokenDataUnavailable: true,
        totalTokens: null,
        costUsd: null,
        lastUsedAt: '2026-11-24T10:00:00Z',
      },
      'antigravity:child': {
        client: 'antigravity',
        sessionId: 'child',
        parentClient: 'antigravity',
        parentSessionId: 'main',
        tokenDataUnavailable: true,
        totalTokens: null,
        costUsd: null,
        lastUsedAt: '2026-11-24T10:00:05Z',
      },
    },
  };
  const [pendingGroup] = M.sessions(allPendingPeriod);
  assert.equal(pendingGroup.tokenDataUnavailable, true);
  assert.deepEqual(M.sessionUsageDisplay(pendingGroup), {
    pending: true,
    tokensText: '0',
    costText: '$0.00',
  });

  allPendingPeriod.sessions['antigravity:child'].tokenDataUnavailable = false;
  allPendingPeriod.sessions['antigravity:child'].totalTokens = 500;
  allPendingPeriod.sessions['antigravity:child'].costUsd = 0.05;
  const [mixedGroup] = M.sessions(allPendingPeriod);
  assert.equal(mixedGroup.tokenDataUnavailable, undefined);
});

test('v0.97.0: Antigravity OAuth-only mode and anonymous RPC recovery keep stable account identities', () => {
  const oauthAccount = {
    provider: 'antigravity',
    source: 'oauth',
    accountKey: 'sha256:ag-oauth-user',
    accountEmail: 'dev@example.com',
    sourceDeviceId: 'pc-1',
    status: 'ok',
    windows: [
      { kind: 'session', label: 'Gemini 5-hour', remainingPercent: 92, windowMinutes: 300 },
      { kind: 'weekly', label: 'Gemini weekly', remainingPercent: 84, windowMinutes: 10080 },
    ],
  };
  const anonRpc = {
    provider: 'antigravity',
    source: 'rpc',
    sourceDetail: 'app',
    accountKey: 'sha256:ag-anon-rpc',
    sourceDeviceId: 'pc-1',
    status: 'ok',
    windows: [{ kind: 'weekly', label: 'Gemini weekly', remainingPercent: 70, windowMinutes: 10080 }],
  };

  const oauthInfo = M.limitAccount(oauthAccount, null, '');
  const anonInfo = M.limitAccount(anonRpc, null, '');
  assert.notEqual(oauthInfo.key, anonInfo.key);
  assert.equal(M.limitHasHistory(oauthAccount), true);

  // Once Hub retires the stale anonymous row or disables local RPC, only the OAuth row remains.
  const oauthOnlyGroups = M.limitGroups([oauthAccount]);
  assert.equal(oauthOnlyGroups.length, 1);
  assert.equal(oauthOnlyGroups[0].providers[0].source, 'oauth');
  assert.equal(oauthOnlyGroups[0].providers[0].accountEmail, 'dev@example.com');
});

test('v0.97.0: Zed usage, cleared Pi session titles, and Kimi Code response timing render cleanly', () => {
  assert.equal(M.clientLabel('zed'), 'Zed');
  assert.equal(M.clientLabel('pi'), 'Pi');
  assert.equal(M.clientLabel('kimi'), 'Kimi');

  const stats = {
    updatedAt: '2026-11-24T10:00:00Z',
    periods: {
      today: {
        totalTokens: 4500,
        clients: { zed: 2000, pi: 1000, kimi: 1500 },
        sessions: {
          'zed:thread-1': {
            client: 'zed',
            sessionId: 'thread-1',
            title: 'ChatGPT subscription thread',
            totalTokens: 2000,
            costUsd: 0.12,
            lastUsedAt: '2026-11-24T09:59:00Z',
          },
          'pi:cleared-1': {
            client: 'pi',
            sessionId: 'cleared-1',
            projectLabel: 'pi-workspace',
            title: '',
            totalTokens: 1000,
            costUsd: 0.05,
            lastUsedAt: '2026-11-24T09:58:00Z',
          },
          'kimi:timed-1': {
            client: 'kimi',
            sessionId: 'timed-1',
            title: 'Kimi response speed',
            totalTokens: 1500,
            outputTokens: 600,
            timedOutputTokens: 600,
            timedDurationMs: 12000,
            costUsd: 0.08,
            lastUsedAt: '2026-11-24T09:57:00Z',
          },
        },
      },
    },
  };

  const rows = M.sessions(stats.periods.today, '', { sortBy: 'tokens' });
  assert.deepEqual(rows.map((r) => r.key), ['zed:thread-1', 'kimi:timed-1', 'pi:cleared-1']);
  assert.equal(rows[2].title, '');
  assert.equal(rows[2].projectLabel, 'pi-workspace');

  const kimiDetail = M.sessionDetail(stats, 'kimi:timed-1', { period: 'today' });
  assert.equal(kimiDetail?.tokensPerSecond, 50);
});

test('v0.97.0: SessionsView and SessionDetailView wire model sorting and pending usage display', () => {
  const sessionsView = fs.readFileSync(path.join(ROOT, 'ui/src/components/SessionsView.tsx'), 'utf8');
  const detailView = fs.readFileSync(path.join(ROOT, 'ui/src/components/SessionDetailView.tsx'), 'utf8');
  assert.match(sessionsView, /MonitorModel\.sessions\(selected\.period,\s*search,\s*\{\s*sortBy\s*\}\)/);
  assert.match(sessionsView, /MonitorModel\.sessionUsageDisplay\(row\)/);
  assert.match(sessionsView, /MonitorModel\.sessionUsageDisplay\(member\)/);
  assert.match(detailView, /MonitorModel\.sessionUsageDisplay\(row\)/);
  assert.match(detailView, /MonitorModel\.sessionUsageDisplay\(owner\.session\)/);
});

test('v0.97.0: docs/upstream-files.json matches every shared file sha256', () => {
  const meta = JSON.parse(fs.readFileSync(path.join(ROOT, 'docs/upstream-files.json'), 'utf8'));
  assert.match(String(meta.upstreamVersion), /^\d+\.\d+\.\d+$/);
  assert.match(String(meta.upstreamCommit), /^[0-9a-f]{40}$/);
  for (const entry of meta.files) {
    const actual = crypto.createHash('sha256').update(fs.readFileSync(path.join(ROOT, entry.path))).digest('hex');
    assert.equal(actual, entry.sha256, `sha256 mismatch for ${entry.path}`);
  }
});
