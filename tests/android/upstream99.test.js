const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '../..');
const MonitorModel = require('../../app/src/main/assets/model.js');
const sessionActivityProviders = require('../../src/shared/sessionActivityProviders.js');
const sessionLive = require('../../src/shared/sessionLive.js');
const plain = (value) => JSON.parse(JSON.stringify(value));

function loadBrowserBundle() {
  const window = {};
  const context = vm.createContext({
    window,
    globalThis: window,
    Date,
    Math,
    Number,
    String,
    Boolean,
    Array,
    Object,
    Set,
    Map,
    RegExp,
    JSON,
    Intl,
    Infinity,
    NaN,
    isFinite,
    parseInt,
    parseFloat,
    encodeURIComponent,
    decodeURIComponent,
  });
  window.window = window;
  const scripts = [
    'src/shared/clientCatalog.js',
    'src/shared/compactTokens.js',
    'src/shared/currency.js',
    'src/shared/limits/balanceDisplay.js',
    'src/shared/limits/windowLabels.js',
    'src/shared/limits/windowText.js',
    'src/shared/limits/historyModel.js',
    'src/shared/sessionActivityProviders.js',
    'src/shared/sessionLive.js',
    'src/shared/sessionRealtime.js',
    'src/shared/deviceKind.js',
    'src/shared/fixedPeriodRanges.js',
    'src/shared/sessionGroups.js',
    'app/src/main/assets/model.js',
  ];
  for (const relPath of scripts) {
    const code = fs.readFileSync(path.join(ROOT, relPath), 'utf8');
    vm.runInContext(code, context, { filename: relPath });
  }
  return window;
}

test('v0.99.0: docs/upstream-files.json records v0.99.0 and verifies SHA-256 across all shared modules', () => {
  const meta = JSON.parse(fs.readFileSync(path.join(ROOT, 'docs/upstream-files.json'), 'utf8'));
  assert.equal(meta.upstreamVersion, '0.99.0');
  assert.equal(meta.upstreamCommit, '49831523e3bbb3ec57ad6d30001306390592c59b');

  const activityEntry = meta.files.find((entry) => entry.path === 'src/shared/sessionActivityProviders.js');
  assert.ok(activityEntry);
  assert.equal(activityEntry.sourceCommit, '3788646ccf4e955b5a1d3e1e8c58daa7a30c4cc9');
  assert.equal(activityEntry.sourceProject, undefined);

  const liveEntry = meta.files.find((entry) => entry.path === 'src/shared/sessionLive.js');
  assert.ok(liveEntry);
  assert.equal(liveEntry.sourceCommit, '2bec96a574deb92040567970bf6825ebfa9dc4d4');

  for (const entry of meta.files) {
    const actual = crypto.createHash('sha256').update(fs.readFileSync(path.join(ROOT, entry.path))).digest('hex');
    assert.equal(actual, entry.sha256, `sha256 mismatch for ${entry.path}`);
  }
});

for (const [label, getApis] of [
  ['CommonJS', () => ({ M: MonitorModel, providers: sessionActivityProviders, live: sessionLive })],
  ['Browser VM', () => {
    const win = loadBrowserBundle();
    return {
      M: win.MonitorModel,
      providers: win.TokenMonitorSessionActivityProviders,
      live: win.TokenMonitorSessionLive,
    };
  }],
]) {
  test(`v0.99.0 (${label}): Antigravity turn status (#1689) and T3 Code ACP live activity (#1693, #1695)`, () => {
    const { M, providers, live } = getApis();
    const nowMs = Date.parse('2026-11-27T10:00:00Z');
    const recentIso = new Date(nowMs - 45_000).toISOString();
    const expiredObsIso = new Date(nowMs - 31_000).toISOString();

    assert.equal(providers.isSessionActivityClient('antigravity'), true);
    const agProvider = providers.SESSION_ACTIVITY_PROVIDERS.find((entry) => entry.id === 'antigravity');
    assert.equal(agProvider?.t3Driver, 'antigravity');
    assert.equal(agProvider?.metadataDepsKey, 'antigravityDeps');

    // #1695: Pre-token native ACP row is running while lease is fresh, and drops to idle once lease expires
    const acpPreToken = {
      client: 'antigravity',
      sessionId: 'acp-pre-token',
      native: true,
      tokenDataUnavailable: true,
      totalTokens: 0,
      costUsd: 0,
      lastUsedAt: recentIso,
      liveActivity: { state: 'running', observedAt: new Date(nowMs - 5_000).toISOString() },
    };
    assert.equal(live.sessionActivityState(acpPreToken, nowMs), 'running');
    assert.equal(
      live.sessionActivityState(
        { ...acpPreToken, liveActivity: { state: 'running', observedAt: expiredObsIso } },
        nowMs,
      ),
      'idle',
    );

    // #1689: Antigravity Desktop / CLI / ACP turnEnded false -> running (transcript), true -> ended, undefined -> inferred running
    const makeStats = (session) => ({
      periods: { today: { sessions: { 'antigravity:turn-1': session } } },
      devices: [
        {
          deviceId: 'dev-ag',
          hostname: 'AG-Workstation',
          updatedAt: new Date(nowMs).toISOString(),
          stale: false,
          periodWindows: { timeZone: 'UTC', today: { key: '2026-11-27', endsAt: '2026-11-28T00:00:00Z' } },
          periods: { today: { sessions: { 'antigravity:turn-1': session } } },
        },
      ],
    });
    const statusOpts = (stats) => ({
      now: nowMs,
      stats,
      period: 'today',
      connected: true,
      foreground: true,
      fetchedAt: nowMs,
    });

    const openTurnRow = { key: 'antigravity:turn-1', client: 'antigravity', sessionId: 'turn-1', lastUsedAt: recentIso, turnEnded: false };
    const openStatus = M.sessionStatus(openTurnRow, statusOpts(makeStats(openTurnRow)));
    assert.equal(openStatus.state, 'running');
    assert.equal(openStatus.source, 'transcript');

    const endedTurnRow = { ...openTurnRow, turnEnded: true };
    const endedStatus = M.sessionStatus(endedTurnRow, statusOpts(makeStats(endedTurnRow)));
    assert.equal(endedStatus.state, 'ended');
    assert.equal(endedStatus.label, '本轮已结束');
    assert.equal(endedStatus.source, 'transcript');

    const unspecTurnRow = { key: 'antigravity:turn-1', client: 'antigravity', sessionId: 'turn-1', lastUsedAt: recentIso };
    const unspecStatus = M.sessionStatus(unspecTurnRow, statusOpts(makeStats(unspecTurnRow)));
    assert.equal(unspecStatus.state, 'running');
    assert.equal(unspecStatus.source, 'inferred');
  });

  test(`v0.99.0 (${label}): T3 Code Kiro & Antigravity thread grouping and delegation link refresh (#1675, #1679, #1681)`, () => {
    const { M } = getApis();
    const period = {
      sessions: {
        'kiro:run-1': {
          client: 'kiro',
          sessionId: 'run-1',
          t3ThreadId: 't3-thread-kiro',
          title: 'Kiro Sidebar Title',
          projectLabel: 'kiro-service',
          totalTokens: 1200,
          costUsd: 0.4,
          lastUsedAt: '2026-11-27T09:10:00Z',
        },
        'kiro:run-2': {
          client: 'kiro',
          sessionId: 'run-2',
          t3ThreadId: 't3-thread-kiro',
          title: 'Kiro Sidebar Title',
          projectLabel: 'kiro-service',
          totalTokens: 800,
          costUsd: 0.3,
          lastUsedAt: '2026-11-27T09:20:00Z',
        },
        'antigravity:delegated-sub': {
          client: 'antigravity',
          sessionId: 'delegated-sub',
          t3ThreadId: 't3-thread-sub',
          parentClient: 'kiro',
          parentSessionId: 'run-1',
          t3ParentLink: true,
          title: 'ACP Delegated Subagent',
          totalTokens: 500,
          costUsd: 0.2,
          lastUsedAt: '2026-11-27T09:25:00Z',
        },
      },
    };

    const grouped = M.sessions(period);
    assert.equal(grouped.length, 1);
    assert.equal(grouped[0].title, 'Kiro Sidebar Title');
    assert.equal(grouped[0].totalTokens, 2500);
    assert.equal(grouped[0].subagentCount, 1);
    assert.equal(grouped[0].groupRows.length, 3);
    assert.equal(M.clientLabel('kiro'), 'Kiro');
  });

  test(`v0.99.0 (${label}): synced range refresh retains details, strips unverified titles, and zero-usage History device keeps details (#1685)`, () => {
    const { M } = getApis();
    const nowMs = Date.parse('2026-11-27T10:00:00Z');
    const tomorrowIso = '2026-11-28T00:00:00Z';
    const stats = {
      fixedRangeRevisions: { 'pc-active': 'rev-2' },
      deviceHistoryRevision: 'hist-2',
      devices: [
        {
          deviceId: 'pc-active',
          hostname: 'Active-Mac',
          updatedAt: '2026-11-27T09:59:00Z',
          stale: false,
          periodWindows: { timeZone: 'UTC', today: { key: '2026-11-27', endsAt: tomorrowIso } },
        },
        {
          deviceId: 'pc-zero',
          hostname: 'Zero-Linux',
          updatedAt: '2026-11-27T09:58:00Z',
          stale: false,
          periodWindows: { timeZone: 'UTC', today: { key: '2026-11-27', endsAt: tomorrowIso } },
        },
      ],
    };

    const scannedRev1 = {
      'pc-active': {
        revision: 'rev-1',
        start: '2026-11-26',
        end: '2026-11-26',
        period: {
          totalTokens: 2400,
          costUsd: 1.8,
          clients: { antigravity: 2400 },
          projects: { proj1: { label: 'mobile-app', tokens: 2400, costUsd: 1.8 } },
          sessions: {
            'antigravity:s1': {
              client: 'antigravity',
              sessionId: 's1',
              title: 'Confidential Session Title',
              projectLabel: 'mobile-app',
              totalTokens: 2400,
              costUsd: 1.8,
              lastUsedAt: '2026-11-26T20:00:00Z',
            },
          },
        },
      },
    };
    const zeroHistory = [
      {
        deviceId: 'pc-zero',
        updatedAt: '2026-11-27T09:58:00Z',
        historyAvailable: true,
        history: { daily: [{ date: '2026-11-26', tokens: 0, cost: 0 }] },
      },
    ];

    // 1. While refreshing (loading: true) with retained snapshot from rev-1 -> rev-2:
    // Sessions & Projects remain visible (#1685), and unverified titles from rev-1 are stripped!
    const refreshing = M.resolveFixedRange(
      stats,
      'yesterday',
      { loading: true, scanned: scannedRev1, deviceHistories: zeroHistory },
      nowMs,
    );
    assert.equal(refreshing.status, 'ready');
    assert.equal(refreshing.detailsAvailable, true);
    const refreshingFleet = M.select(refreshing.projectedStats, '', 'yesterday', nowMs);
    assert.equal(refreshingFleet.period.totalTokens, 2400);
    assert.equal(refreshingFleet.period.projects.proj1.label, 'mobile-app');
    assert.equal(refreshingFleet.period.sessions['antigravity:s1'].title, undefined);

    // 2. Once rev-2 completes, confirmed zero-usage device (pc-zero) does NOT hide pc-active's Sessions & Projects (#1685)
    const scannedRev2 = {
      'pc-active': {
        ...scannedRev1['pc-active'],
        revision: 'rev-2',
      },
    };
    const completed = M.resolveFixedRange(
      stats,
      'yesterday',
      { loading: false, scanned: scannedRev2, deviceHistories: zeroHistory },
      nowMs,
    );
    assert.equal(completed.status, 'ready');
    assert.equal(completed.detailsAvailable, true);
    const completedFleet = M.select(completed.projectedStats, '', 'yesterday', nowMs);
    assert.equal(completedFleet.period.sessions['antigravity:s1'].title, 'Confidential Session Title');
    assert.equal(M.breakdown(completedFleet.period, 'projects').length, 1);
  });

  test(`v0.99.0 (${label}): Today and Month recover omitted session details from daily fixed-range pages while keeping inline rows authoritative (#1682)`, () => {
    const { M } = getApis();
    const nowMs = Date.parse('2026-11-27T10:00:00Z');
    const tomorrowIso = '2026-11-28T00:00:00Z';
    const stats = {
      fixedRangeRevisions: { 'pc-large': 'rev-daily-1' },
      sessionDetailsOmitted: { today: 1, month: 2 },
      periods: {
        today: {
          totalTokens: 5000,
          costUsd: 4.5,
          sessions: {
            'codex:inline-fresh': {
              client: 'codex',
              sessionId: 'inline-fresh',
              title: 'Fresh Inline Title',
              totalTokens: 3000,
              costUsd: 2.7,
              lastUsedAt: '2026-11-27T09:55:00Z',
            },
          },
        },
      },
      devices: [
        {
          deviceId: 'pc-large',
          hostname: 'Heavy-Host',
          updatedAt: '2026-11-27T09:56:00Z',
          stale: false,
          sessionDetailsOmitted: { today: 1, month: 2 },
          periodWindows: { timeZone: 'UTC', today: { key: '2026-11-27', endsAt: tomorrowIso } },
          periods: {
            today: {
              totalTokens: 5000,
              costUsd: 4.5,
              sessions: {
                'codex:inline-fresh': {
                  client: 'codex',
                  sessionId: 'inline-fresh',
                  title: 'Fresh Inline Title',
                  totalTokens: 3000,
                  costUsd: 2.7,
                  lastUsedAt: '2026-11-27T09:55:00Z',
                },
              },
            },
          },
        },
      ],
    };

    const payload = {
      loading: false,
      scanned: {
        'pc-large': {
          revision: 'rev-daily-1',
          start: '2026-11-27',
          end: '2026-11-27',
          period: {
            totalTokens: 5000,
            costUsd: 4.5,
            sessions: {
              'codex:inline-fresh': {
                client: 'codex',
                sessionId: 'inline-fresh',
                title: 'Older Paged Title',
                totalTokens: 2500,
                costUsd: 2.2,
                lastUsedAt: '2026-11-27T09:40:00Z',
              },
              'antigravity:paged-omitted': {
                client: 'antigravity',
                sessionId: 'paged-omitted',
                title: 'Recovered Paged Session',
                totalTokens: 2000,
                costUsd: 1.8,
                lastUsedAt: '2026-11-27T08:30:00Z',
              },
            },
          },
        },
      },
    };

    const resolved = M.resolveFixedRange(stats, 'today', payload, nowMs);
    assert.equal(resolved.status, 'native');
    assert.equal(resolved.detailsAvailable, true);
    assert.equal(resolved.projectedStats.sessionDetailsOmitted.today, 0);
    const sel = M.select(resolved.projectedStats, '', 'today', nowMs);
    assert.equal(Object.keys(sel.period.sessions).length, 2);
    // Inline row remains authoritative over older paged snapshot for the same session
    assert.equal(sel.period.sessions['codex:inline-fresh'].title, 'Fresh Inline Title');
    assert.equal(sel.period.sessions['codex:inline-fresh'].totalTokens, 3000);
    // Omitted session is recovered from daily pages
    assert.equal(sel.period.sessions['antigravity:paged-omitted'].title, 'Recovered Paged Session');
  });
}
