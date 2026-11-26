const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '../..');
const MonitorModel = require('../../app/src/main/assets/model.js');
const plain = (value) => JSON.parse(JSON.stringify(value));

function loadBrowserModel() {
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

test('v0.98.0: docs/upstream-files.json records v0.98.0 and 4-place registration for fixedPeriodRanges.js', () => {
  const meta = JSON.parse(fs.readFileSync(path.join(ROOT, 'docs/upstream-files.json'), 'utf8'));
  assert.equal(meta.upstreamVersion, '0.98.0');
  assert.equal(meta.upstreamCommit, '3ea0ec251a3724622fe21a81ad37eea74570617f');

  const fixedRangeEntry = meta.files.find((entry) => entry.path === 'src/shared/fixedPeriodRanges.js');
  assert.ok(fixedRangeEntry, 'fixedPeriodRanges.js must be registered in docs/upstream-files.json');
  assert.equal(fixedRangeEntry.sourceCommit, '3ea0ec251a3724622fe21a81ad37eea74570617f');
  assert.equal(fixedRangeEntry.sourcePath, 'src/electron/renderer/fixedPeriodRanges.js');

  for (const entry of meta.files) {
    const actual = crypto.createHash('sha256').update(fs.readFileSync(path.join(ROOT, entry.path))).digest('hex');
    assert.equal(actual, entry.sha256, `sha256 mismatch for ${entry.path}`);
  }

  const gradle = fs.readFileSync(path.join(ROOT, 'app/build.gradle'), 'utf8');
  const viteConfig = fs.readFileSync(path.join(ROOT, 'ui/vite.config.ts'), 'utf8');
  const localContent = fs.readFileSync(
    path.join(ROOT, 'app/src/main/java/com/tokenmonitor/android/LocalContentClient.java'),
    'utf8',
  );
  assert.match(gradle, /'fixedPeriodRanges\.js'/);
  assert.match(viteConfig, /'shared\/fixedPeriodRanges\.js'/);
  assert.match(localContent, /"\/assets\/shared\/fixedPeriodRanges\.js"/);
});

for (const [label, getModel] of [
  ['CommonJS', () => MonitorModel],
  ['Browser VM', () => loadBrowserModel().MonitorModel],
]) {
  test(`v0.98.0 (${label}): resolveFixedRange composes multi-device scanned periods, Monday week anchor, and ambiguous session provenance`, () => {
    const M = getModel();
    // 2026-11-26 is Thursday -> Monday-anchored week starts 2026-11-23
    const nowMs = Date.parse('2026-11-26T12:00:00Z');
    const tomorrowIso = '2026-11-27T00:00:00Z';
    const stats = {
      fixedRangeRevisions: { 'pc-a': 'rev-a', 'pc-b': 'rev-b' },
      periods: { today: { totalTokens: 500 } },
      devices: [
        {
          deviceId: 'pc-a',
          hostname: 'Studio-Mac',
          deviceKind: 'desktop',
          updatedAt: '2026-11-26T11:59:00Z',
          stale: false,
          periodWindows: { timeZone: 'UTC', today: { key: '2026-11-26', endsAt: tomorrowIso } },
          periods: { today: { totalTokens: 300 } },
        },
        {
          deviceId: 'pc-b',
          hostname: 'Linux-Rig',
          deviceKind: 'workstation',
          updatedAt: '2026-11-26T11:58:00Z',
          stale: false,
          periodWindows: { timeZone: 'UTC', today: { key: '2026-11-26', endsAt: tomorrowIso } },
          periods: { today: { totalTokens: 200 } },
        },
      ],
    };

    const payload = {
      loading: false,
      scanned: {
        'pc-a': {
          revision: 'rev-a',
          start: '2026-11-23',
          end: '2026-11-26',
          period: {
            totalTokens: 1200,
            inputTokens: 400,
            outputTokens: 200,
            cacheReadTokens: 600,
            cacheWriteTokens: 0,
            costUsd: 1.5,
            capabilities: { tokenComponents: true },
            clients: { codex: 1200 },
            clientCosts: { codex: 1.5 },
            models: { 'gpt-5': 1200 },
            modelCosts: { 'gpt-5': 1.5 },
            projects: { repoA: { label: 'repo-a', tokens: 1200, costUsd: 1.5 } },
            sessions: {
              'codex:shared-sess': {
                client: 'codex',
                sessionId: 'shared-sess',
                title: 'Cross-host session',
                totalTokens: 700,
                costUsd: 0.9,
                lastUsedAt: '2026-11-25T10:00:00Z',
              },
              'codex:only-a': {
                client: 'codex',
                sessionId: 'only-a',
                projectLabel: 'repo-a',
                totalTokens: 500,
                costUsd: 0.6,
                lastUsedAt: '2026-11-26T09:00:00Z',
              },
            },
          },
        },
        'pc-b': {
          revision: 'rev-b',
          start: '2026-11-23',
          end: '2026-11-26',
          period: {
            totalTokens: 800,
            inputTokens: 300,
            outputTokens: 100,
            cacheReadTokens: 400,
            cacheWriteTokens: 0,
            costUsd: 1.0,
            capabilities: { tokenComponents: true },
            clients: { codex: 300, claude: 500 },
            clientCosts: { codex: 0.4, claude: 0.6 },
            models: { 'gpt-5': 300, 'claude-sonnet-4': 500 },
            modelCosts: { 'gpt-5': 0.4, 'claude-sonnet-4': 0.6 },
            projects: { repoA: { label: 'repo-a', tokens: 300, costUsd: 0.4 }, repoB: { label: 'repo-b', tokens: 500, costUsd: 0.6 } },
            sessions: {
              'codex:shared-sess': {
                client: 'codex',
                sessionId: 'shared-sess',
                title: 'Cross-host session',
                totalTokens: 300,
                costUsd: 0.4,
                lastUsedAt: '2026-11-26T11:00:00Z',
              },
              'claude:archived-1': {
                client: 'claude',
                sessionId: 'archived-1',
                title: 'Deleted transcript kept in week range',
                archived: true,
                totalTokens: 500,
                costUsd: 0.6,
                lastUsedAt: '2026-11-24T08:00:00Z',
              },
            },
          },
        },
      },
      deviceHistories: null,
    };

    const res = M.resolveFixedRange(stats, 'week', payload, nowMs);
    assert.equal(res.status, 'ready');
    assert.deepEqual(plain(res.range), { start: '2026-11-23', end: '2026-11-26' });
    assert.equal(res.detailsAvailable, true);
    assert.deepEqual(plain(res.deviceDetailsAvailable), { 'pc-a': true, 'pc-b': true });

    const fleetSel = M.select(res.projectedStats, '', 'week', nowMs);
    assert.equal(fleetSel.period.totalTokens, 2000);
    assert.equal(fleetSel.period.costUsd, 2.5);
    assert.equal(fleetSel.period.projects.repoA.tokens, 1500);
    assert.equal(fleetSel.period.projects.repoB.tokens, 500);

    const sharedSession = fleetSel.period.sessions['codex:shared-sess'];
    assert.equal(sharedSession.totalTokens, 1000);
    assert.deepEqual(plain(sharedSession.sourceDevice), { ambiguous: true });

    const singleOwner = fleetSel.period.sessions['codex:only-a'];
    assert.equal(singleOwner.sourceDevice.deviceId, 'pc-a');
    assert.equal(singleOwner.sourceDevice.name, 'Studio-Mac');

    // Archived session in fixed range (#1660) resolves as archived status
    const archivedRow = M.sessions(fleetSel.period).find((r) => r.key === 'claude:archived-1');
    assert.ok(archivedRow);
    const archivedStatus = M.sessionStatus(archivedRow, {
      now: nowMs,
      stats: res.projectedStats,
      period: 'week',
      connected: true,
      foreground: true,
      fetchedAt: nowMs,
    });
    assert.equal(archivedStatus.state, 'archived');
    assert.equal(archivedStatus.label, '已归档');

    // Session detail resolves directly from derived period with both owners preserved
    const sharedDetail = M.sessionDetail(res.projectedStats, 'codex:shared-sess', { period: 'week', now: nowMs });
    assert.equal(sharedDetail?.period, 'week');
    assert.equal(sharedDetail?.owners.length, 2);
  });

  test(`v0.98.0 (${label}): resolveFixedRange handles mixed History fallback, partial single-device scan (#1664), idle legacy device, and stale history rejection`, () => {
    const M = getModel();
    const nowMs = Date.parse('2026-11-26T12:00:00Z');
    const tomorrowIso = '2026-11-27T00:00:00Z';
    const stats = {
      fixedRangeRevisions: { 'pc-scan': 'rev-1' },
      deviceHistoryRevision: 'hist-1',
      devices: [
        {
          deviceId: 'pc-scan',
          hostname: 'Scan-Host',
          updatedAt: '2026-11-26T11:55:00Z',
          stale: false,
          periodWindows: { timeZone: 'UTC', today: { key: '2026-11-26', endsAt: tomorrowIso } },
        },
        {
          deviceId: 'pc-legacy',
          hostname: 'Legacy-Host',
          updatedAt: '2026-11-26T11:50:00Z',
          stale: false,
          periodWindows: { timeZone: 'UTC', today: { key: '2026-11-26', endsAt: tomorrowIso } },
        },
        {
          deviceId: 'pc-idle',
          hostname: 'Idle-Host',
          updatedAt: '2026-11-26T11:45:00Z',
          stale: false,
          periodWindows: { timeZone: 'UTC', today: { key: '2026-11-26', endsAt: tomorrowIso } },
        },
      ],
    };

    const scannedMap = {
      'pc-scan': {
        revision: 'rev-1',
        start: '2026-11-25',
        end: '2026-11-25',
        period: {
          totalTokens: 1500,
          costUsd: 2.0,
          clients: { claude: 1500 },
          clientCosts: { claude: 2.0 },
          sessions: {
            'claude:s1': { client: 'claude', sessionId: 's1', title: 'Scanned yesterday', totalTokens: 1500, costUsd: 2.0 },
          },
        },
      },
    };

    // 1. Before History loads (or History unavailable): fleet is partial (period null), but selecting pc-scan shows its scanned period (#1664)
    const partial = M.resolveFixedRange(
      stats,
      'yesterday',
      { loading: false, scanned: scannedMap, deviceHistories: null, historyError: 'http_404' },
      nowMs,
    );
    assert.equal(partial.status, 'partial');
    assert.equal(partial.detailsAvailable, false);
    assert.equal(partial.deviceDetailsAvailable['pc-scan'], true);
    assert.equal(M.select(partial.projectedStats, '', 'yesterday', nowMs).period, null);
    const singleDevSel = M.select(partial.projectedStats, 'pc-scan', 'yesterday', nowMs);
    assert.equal(singleDevSel.period.totalTokens, 1500);
    assert.equal(M.sessions(singleDevSel.period).length, 1);

    // 2. With verified History fallback + idle device (empty daily []): fleet totals combine scanned + History + 0
    const mixed = M.resolveFixedRange(
      stats,
      'yesterday',
      {
        loading: false,
        scanned: scannedMap,
        deviceHistories: [
          {
            deviceId: 'pc-legacy',
            updatedAt: '2026-11-26T11:50:00Z',
            historyAvailable: true,
            history: { daily: [{ date: '2026-11-25', tokens: 600, cost: 0.75 }] },
          },
          {
            deviceId: 'pc-idle',
            updatedAt: '2026-11-26T11:45:00Z',
            historyAvailable: true,
            history: { daily: [] },
          },
        ],
      },
      nowMs,
    );
    assert.equal(mixed.status, 'ready');
    assert.equal(mixed.detailsAvailable, false);
    assert.equal(mixed.deviceDetailsAvailable['pc-scan'], true);
    assert.equal(mixed.deviceDetailsAvailable['pc-legacy'], false);
    const mixedFleet = M.select(mixed.projectedStats, '', 'yesterday', nowMs);
    assert.equal(mixedFleet.period.totalTokens, 2100);
    assert.equal(mixedFleet.period.costUsd, 2.75);
    assert.equal(mixedFleet.period.derivedFixedRange, true);

    // 3. Stale /api/devices updatedAt mismatch fails closed instead of mixing mismatched snapshots
    const mismatched = M.resolveFixedRange(
      { devices: stats.devices.slice(1) },
      'yesterday',
      {
        loading: false,
        scanned: null,
        deviceHistories: [
          {
            deviceId: 'pc-legacy',
            updatedAt: '2026-11-26T11:00:00Z', // mismatched updatedAt
            historyAvailable: true,
            history: { daily: [{ date: '2026-11-25', tokens: 600, cost: 0.75 }] },
          },
          {
            deviceId: 'pc-idle',
            updatedAt: '2026-11-26T11:45:00Z',
            historyAvailable: true,
            history: { daily: [] },
          },
        ],
      },
      nowMs,
    );
    assert.equal(mismatched.status, 'unavailable');
    assert.equal(mismatched.projectedStats, null);
  });

  test(`v0.98.0 (${label}): sessionListPresentation (#1678/#1680), sessionAgeShort (#1648), normalizePeriodTabOrder (#1668), T3 ACP (#1658), and mixed-case thirdparty order (#1645)`, () => {
    const M = getModel();

    // Untitled standalone session uses projectLabel as list heading, shows inline sessionId, and keeps Tool · Model in detailHeading (#1678, #1680)
    const untitledStandalone = {
      key: 'codex:sess-99',
      client: 'codex',
      sessionId: 'sess-99',
      projectLabel: 'token-monitor',
      latestModel: 'gpt-5',
      models: { 'gpt-5': 1000 },
    };
    assert.deepEqual(plain(M.sessionListPresentation(untitledStandalone)), {
      heading: 'token-monitor',
      detailHeading: 'Codex · gpt-5',
      titled: false,
      usesProjectHeading: true,
      showInlineSessionId: true,
    });

    // Untitled standalone session without projectLabel falls back to Tool · Model and still shows inline sessionId (#1680)
    const untitledNoProject = {
      key: 'claude:sess-no-proj',
      client: 'claude',
      sessionId: 'sess-no-proj',
      latestModel: 'claude-sonnet-4',
    };
    assert.deepEqual(plain(M.sessionListPresentation(untitledNoProject)), {
      heading: 'Claude Code · claude-sonnet-4',
      detailHeading: 'Claude Code · claude-sonnet-4',
      titled: false,
      usesProjectHeading: false,
      showInlineSessionId: true,
    });

    // Untitled subagent group keeps Tool · Model heading (#1678)
    const untitledGroup = {
      ...untitledStandalone,
      groupRows: [untitledStandalone],
      subagentCount: 1,
    };
    const groupPres = M.sessionListPresentation(untitledGroup);
    assert.equal(groupPres.heading, 'Codex · gpt-5');
    assert.equal(groupPres.usesProjectHeading, false);

    // Titled session uses title and hides inline sessionId
    const titled = { ...untitledStandalone, title: 'Fix fixed-range sync' };
    assert.deepEqual(plain(M.sessionListPresentation(titled)), {
      heading: 'Fix fixed-range sync',
      detailHeading: 'Fix fixed-range sync',
      titled: true,
      usesProjectHeading: false,
      showInlineSessionId: false,
    });

    // Single short form session ages (#1648)
    const now = Date.parse('2026-11-26T12:00:00Z');
    assert.equal(M.sessionAgeShort('2026-11-26T11:59:40Z', now), '<1m');
    assert.equal(M.sessionAgeText('2026-11-26T11:59:40Z', now), '刚刚');
    assert.equal(M.sessionAgeShort('2026-11-26T11:45:00Z', now), '15m');
    assert.equal(M.sessionAgeShort('2026-11-26T09:00:00Z', now), '3h');
    assert.equal(M.sessionAgeShort('2026-11-24T12:00:00Z', now), '2d');

    // Period tab order normalization (#1668)
    assert.deepEqual(plain(M.normalizePeriodTabOrder(['yesterday', 'today'])), []);
    assert.deepEqual(
      plain(M.normalizePeriodTabOrder(['today', 'yesterday', 'week', 'last7', 'month', 'last30', 'allTime'])),
      ['today', 'yesterday', 'week', 'last7', 'month', 'last30'],
    );

    // Mixed-case thirdparty account identity order and custom labels (#1645)
    const tpProviders = [
      { provider: 'thirdparty', accountKey: 'thirdparty:GPTNB', accountLabel: 'GPTNB', status: 'ok' },
      { provider: 'thirdparty', accountKey: 'thirdparty:Z', accountLabel: 'Z', status: 'disabled' },
      { provider: 'thirdparty', accountKey: 'thirdparty:Niba', accountLabel: 'Niba', status: 'ok' },
    ];
    const presentation = {
      thirdparty: {
        order: ['thirdparty:Niba', 'thirdparty:GPTNB', 'thirdparty:Z'],
        labels: { 'thirdparty:Niba': 'Niba 主线路' },
      },
    };
    const groups = M.limitGroups(tpProviders, null, '', presentation);
    assert.deepEqual(
      plain(groups.map((g) => g.providers[0].accountKey)),
      ['thirdparty:Niba', 'thirdparty:GPTNB', 'thirdparty:Z'],
    );
    assert.equal(M.limitAccount(tpProviders[2], null, '', presentation).displayName, 'Niba 主线路');

    // T3 Code Antigravity ACP session fields (#1658)
    const t3Stats = {
      periods: {
        today: {
          sessions: {
            'antigravity:t3-1': {
              client: 'antigravity',
              sessionId: 't3-1',
              t3ThreadId: 't3-thread-abc',
              nativeSessionId: 'ag-native-1',
              totalTokens: 2048,
              lastUsedAt: '2026-11-26T11:59:00Z',
            },
          },
        },
      },
      devices: [],
    };
    const t3Detail = M.sessionDetail(t3Stats, 'antigravity:t3-1', { period: 'today', now });
    assert.equal(t3Detail?.row.t3ThreadId, 't3-thread-abc');
    assert.equal(t3Detail?.row.nativeSessionId, 'ag-native-1');
  });
}
