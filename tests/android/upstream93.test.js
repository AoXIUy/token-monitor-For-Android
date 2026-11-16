'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const M = require('../../app/src/main/assets/model');
const catalog = require('../../src/shared/clientCatalog');

test('v0.93.1: New API scoped tokens show balance cleanly when usage:read is omitted', () => {
  // Upstream PR #1506: New API v1.0.0-rc.41 introduced scoped tokens.
  // A token with profile:read but lacking usage:read can read balance,
  // but today/week/month/allTime spend is omitted.
  const balanceOnlyProvider = {
    provider: 'thirdparty',
    accountName: 'newapi-prod',
    accountLabel: 'newapi-prod',
    source: 'api',
    status: 'ok',
    windows: [
      {
        kind: 'billing',
        metric: 'credits',
        remaining: 42.5,
        currency: 'USD',
        showMeter: false
      }
    ],
    balance: {
      amount: 42.5,
      currency: 'USD'
      // todaySpend, weekSpend, monthSpend, allTimeSpend omitted
    }
  };

  // 1. Quota display handles balance cleanly without fake percentage
  const quota = M.quota(balanceOnlyProvider, balanceOnlyProvider.windows[0]);
  assert.equal(quota.label, '账户余额');
  assert.equal(quota.value, '$42.50');
  assert.equal(quota.percent, null);

  // 2. limitSpend returns empty array without fabricating zero spends
  const spends = M.limitSpend(balanceOnlyProvider);
  assert.deepEqual(spends, [], 'missing period spend must not fabricate zero spending rows');

  // 2b. Upstream newapiAccountQuota wire shape: a token with profile:read but without usage:read
  // still provides used_quota (allTimeSpend) and a metered window, but today/week/month are omitted.
  const profileReadScopedProvider = {
    provider: 'thirdparty',
    accountName: 'newapi-scoped',
    source: 'api',
    status: 'ok',
    windows: [
      {
        kind: 'billing',
        label: 'Credit balance',
        metric: 'credits',
        used: 15.5,
        limit: 58.0,
        remaining: 42.5,
        usedPercent: 26.7,
        currency: 'USD',
        showMeter: true
      }
    ],
    balance: {
      amount: 42.5,
      currency: 'USD',
      allTimeSpend: 15.5
      // todaySpend, weekSpend, monthSpend are omitted because /api/data/self requires usage:read
    }
  };
  const scopedSpends = M.limitSpend(profileReadScopedProvider);
  assert.deepEqual(scopedSpends, [
    { key: 'allTimeSpend', label: '累计', value: '$15.50' }
  ], 'only allTimeSpend should be returned; missing today/week/month must not synthesize $0.00');
  const scopedQuota = M.quota(profileReadScopedProvider, profileReadScopedProvider.windows[0]);
  assert.equal(scopedQuota.value, '$42.50');
  assert.equal(scopedQuota.percent, 73.3);
  assert.equal(scopedQuota.remaining, true);
  assert.equal(scopedQuota.detail, '已用 $15.50 / 总额 $58.00');

  // 3. When usage:read is granted, period spends format correctly
  const fullProvider = {
    ...balanceOnlyProvider,
    balance: {
      amount: 42.5,
      currency: 'USD',
      todaySpend: 1.25,
      weekSpend: 8.5,
      monthSpend: 24.0,
      allTimeSpend: 135.5
    }
  };
  const fullSpends = M.limitSpend(fullProvider);
  assert.deepEqual(fullSpends, [
    { key: 'todaySpend', label: '今日', value: '$1.25' },
    { key: 'weekSpend', label: '近7天', value: '$8.50' },
    { key: 'monthSpend', label: '本月', value: '$24.00' },
    { key: 'allTimeSpend', label: '累计', value: '$135.50' }
  ]);

  // 4. Currency formatting respects other currencies (e.g. CNY)
  const cnyProvider = {
    provider: 'thirdparty',
    source: 'api',
    status: 'ok',
    windows: [{ kind: 'billing', metric: 'credits', remaining: 100, currency: 'CNY', showMeter: false }],
    balance: { amount: 100, currency: 'CNY' }
  };
  assert.equal(M.quota(cnyProvider, cnyProvider.windows[0]).value, '¥100.00');
  assert.deepEqual(M.limitSpend(cnyProvider), []);
});

test('v0.93.1: OpenClaw usage from tokscale 4.23.0 is recognized and attributed', () => {
  // Upstream PR #1508: Tokscale 4.23.0 includes OpenClaw SQLite transcript archives.
  // The client identifier 'openclaw' is in clientCatalog and formats as 'OpenClaw'.
  assert.equal(M.clientLabel('openclaw'), 'OpenClaw');
  assert.equal(catalog.CLIENT_LABELS.openclaw, 'OpenClaw');
  assert.ok(catalog.CLIENT_IDS.includes('openclaw'));

  // Sessions attribution and tool filtering for OpenClaw
  const period = {
    totalTokens: 1500,
    costUsd: 0.15,
    clients: { openclaw: 1000, codex: 500 },
    clientCosts: { openclaw: 0.10, codex: 0.05 },
    sessions: {
      'openclaw:sess-1': {
        client: 'openclaw',
        sessionId: 'sess-1',
        title: 'OpenClaw Task',
        totalTokens: 1000,
        costUsd: 0.10,
        lastUsedAt: '2026-11-16T08:00:00Z'
      },
      'codex:sess-2': {
        client: 'codex',
        sessionId: 'sess-2',
        title: 'Codex Task',
        totalTokens: 500,
        costUsd: 0.05,
        lastUsedAt: '2026-11-16T08:05:00Z'
      }
    }
  };

  const clientBreakdown = M.breakdown(period, 'clients');
  assert.deepEqual(clientBreakdown, [
    { id: 'openclaw', label: 'openclaw', tokens: 1000, cost: 0.10 },
    { id: 'codex', label: 'codex', tokens: 500, cost: 0.05 }
  ]);

  const allSessions = M.sessions(period);
  assert.equal(allSessions.length, 2);
  const openclawSessions = M.filterSessionTools(allSessions, 'openclaw');
  assert.equal(openclawSessions.rows.length, 1);
  assert.equal(openclawSessions.rows[0].client, 'openclaw');
});

test('v0.93.1: Git worktree project grouping merges seamlessly into projects breakdown', () => {
  // Upstream PR #1505: projectIdentity() groups linked git worktrees under
  // their repository root so they share one project id and label.
  const period = {
    projects: {
      'proj:token-monitor': {
        label: 'token-monitor',
        tokens: 15000,
        costUsd: 1.50
      },
      'proj:other-repo': {
        label: 'other-repo',
        tokens: 3000,
        costUsd: 0.30
      }
    },
    sessions: {
      'codex:main-tree': {
        client: 'codex',
        sessionId: 'main-tree',
        projectLabel: 'token-monitor',
        totalTokens: 10000,
        lastUsedAt: '2026-11-16T09:00:00Z'
      },
      'codex:work-tree': {
        client: 'codex',
        sessionId: 'work-tree',
        projectLabel: 'token-monitor', // Linked worktree consolidated by Hub
        totalTokens: 5000,
        lastUsedAt: '2026-11-16T09:10:00Z'
      }
    }
  };

  const projectBreakdown = M.breakdown(period, 'projects');
  assert.deepEqual(projectBreakdown, [
    { id: 'proj:token-monitor', label: 'token-monitor', tokens: 15000, cost: 1.50 },
    { id: 'proj:other-repo', label: 'other-repo', tokens: 3000, cost: 0.30 }
  ]);

  // Session search matches the consolidated project label
  const matches = M.sessions(period, 'token-monitor');
  assert.equal(matches.length, 2);
});

test('v0.93.1: Browser packaging loads all shared modules without a Node loader', () => {
  const browser = vm.createContext({ window: {} });
  const sharedFiles = [
    'compactTokens.js',
    'deviceKind.js',
    'currency.js',
    'clientCatalog.js',
    'limits/balanceDisplay.js',
    'limits/windowLabels.js',
    'limits/windowText.js',
    'limits/historyModel.js',
    'sessionActivityProviders.js',
    'sessionGroups.js',
    'sessionLive.js',
    'sessionRealtime.js'
  ];

  for (const rel of sharedFiles) {
    const fullPath = path.resolve(__dirname, '../../src/shared', rel);
    assert.ok(fs.existsSync(fullPath), `missing shared file: ${rel}`);
    vm.runInContext(fs.readFileSync(fullPath, 'utf8'), browser, { filename: rel });
  }

  // Load the Android viewer model into browser context
  const modelPath = path.resolve(__dirname, '../../app/src/main/assets/model.js');
  vm.runInContext(fs.readFileSync(modelPath, 'utf8'), browser, { filename: 'model.js' });

  const BM = browser.window.MonitorModel;
  assert.equal(typeof BM, 'object');
  assert.equal(BM.clientLabel('openclaw'), 'OpenClaw');

  // Verify New API partial spend in browser context
  const provider = {
    provider: 'thirdparty',
    source: 'api',
    status: 'ok',
    windows: [{ kind: 'billing', metric: 'credits', remaining: 50, currency: 'USD', showMeter: false }],
    balance: { amount: 50, currency: 'USD' }
  };
  assert.equal(BM.quota(provider, provider.windows[0]).value, '$50.00');
  assert.equal(BM.limitSpend(provider).length, 0);
});
