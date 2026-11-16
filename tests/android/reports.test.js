'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const stateModule = import('../../ui/src/nativeState.js');
const reportsModule = import('../../ui/src/reportsState.js');

test('reports state tracks list and detail requests with requestId isolation', async () => {
  const { createInitialState, receiveNativeMessage } = await stateModule;
  const { beginReportsList, beginReportDetail, reportErrorLabel } = await reportsModule;

  let state = createInitialState();
  assert.equal(state.reports.granularity, 'daily');
  assert.equal(state.reports.periodKey, 'current');
  assert.deepEqual(state.reports.items, []);

  state = { ...state, reports: beginReportsList(state.reports, { granularity: '', requestId: 'rl-1' }) };
  assert.equal(state.reports.listLoading, true);

  // Stale requestId must be ignored
  const stale = receiveNativeMessage(state, {
    type: 'reportsList',
    requestId: 'rl-old',
    data: { ok: true, reports: [{ granularity: 'daily', periodKey: '2026-11-16' }] },
  });
  assert.equal(stale.reports.listLoading, true);
  assert.equal(stale.reports.items.length, 0);

  // Matching list response
  state = receiveNativeMessage(state, {
    type: 'reportsList',
    requestId: 'rl-1',
    data: {
      ok: true,
      config: { enabled: true, daily: true, weekly: false, monthly: true },
      reports: [
        { reportId: 'daily:2026-11-16', granularity: 'daily', periodKey: '2026-11-16', totalTokens: 5000, knownCostUsd: 0.12, projectCount: 2 },
        { reportId: 'daily:2026-11-16', granularity: 'daily', periodKey: '2026-11-16', totalTokens: 9999 }, // duplicate ignored
        { granularity: 'yearly', periodKey: '2026' }, // invalid granularity ignored
      ],
    },
  });
  assert.equal(state.reports.listLoading, false);
  assert.equal(state.reports.listError, '');
  assert.deepEqual(state.reports.config, { enabled: true, daily: true, weekly: false, monthly: true });
  assert.equal(state.reports.items.length, 1);
  assert.equal(state.reports.items[0].totalTokens, 5000);

  // Detail request
  state = { ...state, reports: beginReportDetail(state.reports, { granularity: 'weekly', periodKey: '2026-W47', requestId: 'rd-1' }) };
  assert.equal(state.reports.detailLoading, true);
  assert.equal(state.reports.granularity, 'weekly');
  assert.equal(state.reports.periodKey, '2026-W47');

  state = receiveNativeMessage(state, {
    type: 'reportDetail',
    requestId: 'rd-1',
    data: {
      ok: true,
      report: {
        schemaVersion: 1,
        schema: 'token-monitor-report/v1',
        reportId: 'weekly:2026-W47',
        granularity: 'weekly',
        period: { key: '2026-W47', label: '2026-W47', startDate: '2026-11-16', endDate: '2026-11-22', isCurrent: true, generatedAt: '2026-11-16T12:00:00Z' },
        hub: { runtime: 'node-hub', deviceCount: 2, activeDeviceCount: 2, staleDeviceCount: 0 },
        coverage: { tokenComponentsComplete: true, projectsComplete: true, projectAttributionSource: 'daily-snapshots', historyComplete: true },
        summary: { totalTokens: 5000, knownCostUsd: 0.12, cacheHitRatePct: 80, activeDays: 3, projectCount: 1, throughput: { avgOutputTokensPerSec: 64.5 } },
        projects: [{ key: 'token-monitor', label: 'token-monitor', tokens: 5000, costUsd: 0.12, tokenSharePct: 100, costSharePct: 100, clients: [{ client: 'codex', tokens: 5000, sharePct: 100 }], models: [{ model: 'gpt-5', tokens: 5000, sharePct: 100 }] }],
        clients: [{ client: 'codex', tokens: 5000, costUsd: 0.12, tokenSharePct: 100, cacheHitRatePct: 80 }],
        models: [{ model: 'gpt-5', tokens: 5000, costUsd: 0.12, tokenSharePct: 100, cacheHitRatePct: 80, avgOutputTokensPerSec: 64.5 }],
        devices: [{ deviceId: 'dev-1', hostname: 'Mac', platform: 'darwin', stale: false, tokens: 5000, costUsd: 0.12, tokenSharePct: 100, projectCount: 1 }],
        timeline: [{ date: '2026-11-16', tokens: 5000, costUsd: 0.12, activeTimeMs: 60000, topClient: 'codex', topModel: 'gpt-5' }],
        signals: [{ code: 'top-project-concentration', severity: 'info', summary: 'token-monitor 占 100%' }],
      },
      markdown: '# Weekly Report',
    },
  });

  assert.equal(state.reports.detailLoading, false);
  assert.equal(state.reports.detailError, '');
  assert.equal(state.reports.report?.reportId, 'weekly:2026-W47');
  assert.equal(state.reports.report?.projects[0].label, 'token-monitor');
  assert.equal(state.reports.markdown, '# Weekly Report');
  assert.match(reportErrorLabel('unsupported_hub'), /升级/);
});

test('connection switches and background lifecycle clear or halt pending reports cleanly', async () => {
  const { createInitialState, receiveNativeMessage } = await stateModule;
  const { beginReportsList, beginReportDetail } = await reportsModule;

  let state = createInitialState();
  state = {
    ...state,
    reports: beginReportDetail(beginReportsList(state.reports, { granularity: '', requestId: 'rl-1' }), { granularity: 'daily', periodKey: 'current', requestId: 'rd-1' }),
  };
  state = receiveNativeMessage(state, {
    type: 'reportDetail',
    requestId: 'rd-1',
    data: {
      ok: true,
      report: { granularity: 'daily', period: { key: '2026-11-16' }, summary: { totalTokens: 100 } },
      markdown: '# Daily',
    },
  });
  assert.equal(state.reports.report?.granularity, 'daily');

  // Going background clears loading flags
  state = { ...state, reports: beginReportsList(state.reports, { granularity: '', requestId: 'rl-2' }) };
  state = receiveNativeMessage(state, { type: 'lifecycle', foreground: false });
  assert.equal(state.reports.listLoading, false);
  assert.equal(state.reports.detailLoading, false);

  // Switching Hub discards all cached report state
  state = receiveNativeMessage(state, { type: 'connection', url: 'https://other-hub.test' });
  assert.equal(state.reports.report, null);
  assert.equal(state.reports.markdown, '');
  assert.deepEqual(state.reports.items, []);
  assert.equal(state.reports.config, null);
});

test('malformed report payloads fail closed without throwing', async () => {
  const { createInitialState, receiveNativeMessage } = await stateModule;
  const { beginReportDetail } = await reportsModule;

  let state = {
    ...createInitialState(),
    reports: beginReportDetail(createInitialState().reports, { granularity: 'monthly', periodKey: '2026-11', requestId: 'rd-bad' }),
  };
  state = receiveNativeMessage(state, {
    type: 'reportDetail',
    requestId: 'rd-bad',
    data: { ok: true, report: { granularity: 'invalid-granularity' } },
  });
  assert.equal(state.reports.detailLoading, false);
  assert.equal(state.reports.detailError, 'invalid_response');
  assert.equal(state.reports.report, null);
});
