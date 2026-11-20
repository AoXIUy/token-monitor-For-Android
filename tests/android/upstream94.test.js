'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const M = require('../../app/src/main/assets/model');
const sessionLive = require('../../src/shared/sessionLive');

test('v0.94.0: Alibaba Token Plan distinguishes regions/plans and keeps selection keys distinct', () => {
  const cnTeam = {
    provider: 'alibaba',
    accountKey: 'sha256:uid-1',
    region: 'cn',
    source: 'cli',
    status: 'ok',
    windows: [{ kind: 'billing', metric: 'credits', remaining: 50000, limit: 100000, usedPercent: 50, currency: 'CREDITS' }],
  };
  const intlPersonal = {
    provider: 'alibaba',
    accountKey: 'sha256:uid-1',
    region: 'intl-personal',
    source: 'web',
    status: 'ok',
    windows: [
      { kind: 'session', label: '5h', windowMinutes: 300, usedPercent: 18 },
      { kind: 'weekly', label: 'Weekly', windowMinutes: 10080, usedPercent: 32 },
    ],
  };

  assert.equal(M.limitSelectionKey(cnTeam), 'sha256:uid-1:cn');
  assert.equal(M.limitSelectionKey(intlPersonal), 'sha256:uid-1:intl-personal');
  assert.equal(M.limitAccount(cnTeam).regionLabel, '中国站 · 团队版');
  assert.equal(M.limitAccount(intlPersonal).regionLabel, '国际站 · 个人版');
  assert.equal(M.limitAccount({ provider: 'alibaba', region: 'intl' }).regionLabel, '国际站 · 团队版');
  assert.equal(M.limitAccount({ provider: 'alibaba', region: 'cn-personal' }).regionLabel, '中国站 · 个人版');
  assert.notEqual(M.limitAccount(cnTeam).key, M.limitAccount(intlPersonal).key);
});

test('v0.94.0: Multi-account quotas and cross-device presentation labels and ordering work cleanly', () => {
  const ds1 = {
    provider: 'deepseek',
    accountKey: 'sha256:ds-1',
    accountDisplayName: 'Server Fallback Name',
    source: 'api',
    sourceDeviceId: 'pc-1',
    status: 'ok',
    windows: [{ kind: 'billing', metric: 'credits', remaining: 68.4, currency: 'CNY', showMeter: false }],
    balance: { amount: 68.4, currency: 'CNY', monthSpend: 14.2 },
  };
  const ds2 = {
    provider: 'deepseek',
    accountKey: 'sha256:ds-2',
    source: 'api',
    sourceDeviceId: 'pc-2',
    status: 'ok',
    windows: [{ kind: 'billing', metric: 'credits', remaining: 12.0, currency: 'CNY', showMeter: false }],
    balance: { amount: 12.0, currency: 'CNY' },
  };
  const alibaba = {
    provider: 'alibaba',
    accountKey: 'sha256:ali-1',
    region: 'cn-personal',
    source: 'cli',
    status: 'ok',
    windows: [{ kind: 'session', usedPercent: 10 }],
  };

  const presentation = {
    deepseek: {
      labels: {
        'sha256:ds-1': '', // explicit blank clears fallback accountDisplayName
        'sha256:ds-2': '个人备用',
      },
      order: ['sha256:ds-2', 'sha256:ds-1'],
    },
    alibaba: {
      labels: { 'sha256:ali-1:cn-personal': '百炼个人版' },
      order: ['sha256:ali-1:cn-personal'],
    },
  };

  assert.equal(M.limitAccount(ds1, null, '', presentation).displayName, undefined);
  assert.equal(M.limitAccount(ds2, null, '', presentation).displayName, '个人备用');
  assert.equal(M.limitAccount(alibaba, null, '', presentation).displayName, '百炼个人版');

  // Reorder DeepSeek slots in-place without disturbing Alibaba's position
  const groups = M.limitGroups([ds1, alibaba, ds2], null, '', presentation);
  assert.deepEqual(
    groups.map(g => `${g.providers[0].provider}:${g.providers[0].accountKey}`),
    ['deepseek:sha256:ds-2', 'alibaba:sha256:ali-1', 'deepseek:sha256:ds-1']
  );

  // Alias lookup also works for presentation labels/order
  const aliased = { ...ds2, accountKey: 'sha256:ds-2-new', accountKeyAliases: ['sha256:ds-2'] };
  assert.equal(M.limitAccount(aliased, null, '', presentation).displayName, '个人备用');
});

test('v0.94.0: OpenCode productId windows and sessionWithActivity explicit clock behave cleanly', () => {
  const opencode = {
    provider: 'opencode',
    accountKey: 'sha256:oc-1',
    status: 'ok',
    windows: [
      { kind: 'session', productId: 'go', label: '5h', usedPercent: 20 },
      { kind: 'billing', productId: 'zen', metric: 'credits', label: 'Balance', remaining: 15, currency: 'USD', showMeter: false },
    ],
  };
  assert.equal(M.quota(opencode, opencode.windows[0]).value, '20% 已用');
  assert.equal(M.quota(opencode, opencode.windows[1]).value, '$15.00');

  const now = Date.parse('2026-11-20T08:00:00Z');
  const period = {
    sessions: {
      'codex:s1': {
        client: 'codex',
        liveActivity: { state: 'running', observedAt: '2026-11-20T07:59:45Z' },
      },
    },
    sessionActivity: {
      'codex:s1': { state: 'waiting', observedAt: '2026-11-20T07:59:55Z' },
    },
  };
  const overlaid = sessionLive.sessionWithActivity(period, 'codex:s1', period.sessions['codex:s1'], now);
  assert.equal(overlaid.liveActivity.state, 'waiting');
  // Future observation relative to explicit `now` is rejected
  const futurePeriod = {
    ...period,
    sessionActivity: { 'codex:s1': { state: 'idle', observedAt: '2026-11-20T08:05:00Z' } },
  };
  const kept = sessionLive.sessionWithActivity(futurePeriod, 'codex:s1', period.sessions['codex:s1'], now);
  assert.equal(kept.liveActivity.state, 'running');
});

test('v0.94.0: Browser packaging loads updated shared modules and model cleanly', () => {
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
    'sessionRealtime.js',
  ];
  for (const rel of sharedFiles) {
    vm.runInContext(fs.readFileSync(path.resolve(__dirname, '../../src/shared', rel), 'utf8'), browser, { filename: rel });
  }
  vm.runInContext(fs.readFileSync(path.resolve(__dirname, '../../app/src/main/assets/model.js'), 'utf8'), browser, { filename: 'model.js' });
  const BM = browser.window.MonitorModel;
  assert.equal(BM.limitSelectionKey({ provider: 'alibaba', accountKey: 'sha256:a', region: 'cn-personal' }), 'sha256:a:cn-personal');
});
