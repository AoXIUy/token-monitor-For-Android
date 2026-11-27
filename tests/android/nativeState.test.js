'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const stateModule = import('../../ui/src/nativeState.js');

test('update prompts and verified download progress survive Hub changes without accepting file paths', async () => {
  const { createInitialState, receiveNativeMessage } = await stateModule;
  let state = receiveNativeMessage(createInitialState(), { type: 'appUpdate', available: true, latestVersion: '2.0.0', promptToken: 'offer-1' });
  state = receiveNativeMessage(state, { type: 'appUpdateDownload', phase: 'downloading', version: '2.0.0', downloaded: 50, total: 100,
    message: 'Downloading', url: 'https://evil.test/app.apk', path: '/private/secret' });
  assert.equal(state.appUpdate.download.downloaded, 50);
  state = { ...state, dismissedUpdatePrompt: 'offer-1' };
  state = receiveNativeMessage(state, { type: 'connection', url: 'https://another-hub.test' });
  assert.equal(state.dismissedUpdatePrompt, 'offer-1');
  assert.equal(state.appUpdate.download.phase, 'downloading');
  state = receiveNativeMessage(state, { type: 'appUpdate', available: true, latestVersion: '2.0.0', promptToken: 'offer-2' });
  assert.equal(state.appUpdate.download.downloaded, 50);
  assert.notEqual(state.appUpdate.promptToken, state.dismissedUpdatePrompt);
  state = receiveNativeMessage(state, { type: 'appUpdateDownload', phase: 'installing', total: 100, downloaded: 100 });
  assert.equal(state.dismissedUpdatePrompt, 'offer-2');
  assert.equal(JSON.stringify(state).includes('evil.test'), false);
  assert.equal(JSON.stringify(state).includes('/private/secret'), false);
});

test('malformed download events cannot claim unbounded progress or invent an install state', async () => {
  const { createInitialState, receiveNativeMessage } = await stateModule;
  const initial = createInitialState();
  assert.equal(receiveNativeMessage(initial, { type: 'appUpdateDownload', phase: 'trusted-without-verification' }), initial);
  const state = receiveNativeMessage(initial, { type: 'appUpdateDownload', phase: 'downloading', total: 100, downloaded: 999 });
  assert.equal(state.appUpdate.download.downloaded, 100);
  for (const bad of [NaN, Infinity, -1, '100']) {
    const malformed = receiveNativeMessage(initial, { type: 'appUpdateDownload', phase: 'downloading', total: bad, downloaded: bad });
    assert.equal(malformed.appUpdate.download.total, 0);
    assert.equal(malformed.appUpdate.download.downloaded, 0);
  }
});

test('app update information and dismissed notices survive Hub switches without accepting URLs or secrets', async () => {
  const { createInitialState, receiveNativeMessage } = await stateModule;
  let state = receiveNativeMessage(createInitialState(), { type: 'appUpdate', currentVersion: '1.0.8', latestVersion: '1.10.0',
    available: true, automatic: false, checking: false, checkedAt: 123, name: 'Release', notes: '<img src=x onerror=alert(1)>',
    size: 1024, error: '', secret: 'must-not-store', downloadUrl: 'https://evil.test/app.apk' });
  assert.equal(state.appUpdate.available, true);
  assert.equal(state.appUpdate.automatic, false);
  assert.equal(state.appUpdate.notes, '<img src=x onerror=alert(1)>');
  assert.equal(JSON.stringify(state).includes('evil.test'), false);
  assert.equal(JSON.stringify(state).includes('must-not-store'), false);
  state.dismissedUpdateVersion = '1.10.0';
  const next = receiveNativeMessage(state, { type: 'connection', url: 'https://different-hub.example.com' });
  assert.equal(next.appUpdate, state.appUpdate);
  assert.equal(next.dismissedUpdateVersion, '1.10.0');
  assert.equal(next.appUpdate.checkedAt, 123);
});

test('malformed app update messages do not fabricate availability, dates or download sizes', async () => {
  const { createInitialState, receiveNativeMessage } = await stateModule;
  for (const bad of [NaN, Infinity, -1, '123']) {
    const state = receiveNativeMessage(createInitialState(), { type: 'appUpdate', available: true, checkedAt: bad, size: bad });
    assert.equal(state.appUpdate.available, false);
    assert.equal(state.appUpdate.checkedAt, 0);
    assert.equal(state.appUpdate.size, 0);
  }
});

test('Android React connection changes discard previous Hub data and never store credentials', async () => {
  const { createInitialState, receiveNativeMessage } = await stateModule;
  const previous = { ...createInitialState(), stats: { devices: [{ deviceId: 'old' }] },
    subscriptions: { subscriptions: [{ provider: 'claude' }] }, device: 'old', detailKey: 'old:key',
    monitorPending: true, connectPending: true, statusHealthy: true, foreground: false };
  const next = receiveNativeMessage(previous, { type: 'connection', url: 'https://new.example.com', allowHttp: false, secret: 'must-not-store' });
  assert.equal(next.connection, 'https://new.example.com');
  assert.equal(next.page, 'overview');
  assert.equal(next.connectionEpoch, previous.connectionEpoch + 1);
  assert.equal(next.stats, null);
  assert.equal(next.subscriptions, null);
  assert.equal(next.device, '');
  assert.equal(next.detailKey, '');
  assert.equal(next.fetchedAt, 0);
  assert.equal(next.statusHealthy, false);
  assert.equal(next.notifications.enabled, false);
  assert.equal(next.monitorPending, false);
  assert.equal(next.connectPending, false);
  assert.equal(next.foreground, false);
  assert.equal(JSON.stringify(next).includes('must-not-store'), false);
  assert.equal(previous.stats.devices[0].deviceId, 'old');
});

test('Android React failures keep last data while explicit disconnect removes it', async () => {
  const { createInitialState, receiveNativeMessage } = await stateModule;
  const stats = { periods: { today: { totalTokens: 123 } } };
  let state = receiveNativeMessage(createInitialState(), { type: 'stats', data: stats, fetchedAt: 100 });
  assert.equal(state.stats, stats);
  assert.equal(state.fetchedAt, 100);
  state = receiveNativeMessage(state, { type: 'status', state: 'offline', message: 'Network unavailable' });
  assert.equal(state.stats, stats);
  assert.equal(state.statusHealthy, false);
  assert.equal(state.message, 'Network unavailable');
  state = receiveNativeMessage(state, { type: 'connection', url: '' });
  assert.equal(state.page, 'settings');
  assert.equal(state.stats, null);
  assert.equal(state.message, '');
});

test('Android React does not invent a fresh observation time for malformed stats', async () => {
  const { createInitialState, receiveNativeMessage } = await stateModule;
  for (const fetchedAt of [undefined, NaN, Infinity, '100']) {
    const state = receiveNativeMessage(createInitialState(), { type: 'stats', data: {}, fetchedAt });
    assert.equal(state.fetchedAt, 0);
  }
});

test('Android React notification links await fresh status and open the requested session', async () => {
  const { createInitialState, receiveNativeMessage } = await stateModule;
  const state = receiveNativeMessage({ ...createInitialState(), device: 'old', statusHealthy: true },
    { type: 'openSession', key: 'codex:child' });
  assert.equal(state.page, 'sessionDetail');
  assert.equal(state.detailKey, 'codex:child');
  assert.equal(state.period, 'month');
  assert.equal(state.device, '');
  assert.equal(state.statusHealthy, false);
});

test('Android React notification and form acknowledgements release pending controls', async () => {
  const { createInitialState, receiveNativeMessage } = await stateModule;
  let state = { ...createInitialState(), monitorPending: true, connectPending: true };
  state = receiveNativeMessage(state, { type: 'notifications', enabled: true, permission: true, message: 'Monitoring', lastReadAt: 42 });
  assert.equal(state.monitorPending, false);
  assert.deepEqual(state.notifications, { enabled: true, permission: true, message: 'Monitoring', lastReadAt: 42 });
  state = receiveNativeMessage(state, { type: 'formError', message: 'Invalid Hub URL' });
  assert.equal(state.connectPending, false);
  assert.equal(state.formError, 'Invalid Hub URL');
  assert.equal(receiveNativeMessage(state, { type: 'unrecognized' }), state);
  assert.equal(receiveNativeMessage(state, { type: 'status', state: 'fake-online' }), state);
});

test('limits display preferences sanitize hashes and survive Hub connection changes', async () => {
  const { createInitialState, receiveNativeMessage } = await stateModule;
  const validHash = 'a'.repeat(64);
  const secondHash = 'b'.repeat(64);
  let state = receiveNativeMessage(createInitialState(), {
    type: 'limitsPrefs',
    hideUncollected: false,
    showRemaining: true,
    hiddenAccountHashes: [validHash, 'not-a-hash', 'user@example.com', validHash, secondHash],
  });
  assert.deepEqual(state.limitsPrefs, {
    hideUncollected: false,
    showRemaining: true,
    hiddenAccountHashes: [validHash, secondHash],
  });
  state = receiveNativeMessage(state, { type: 'connection', url: 'https://another-hub.example.com' });
  assert.deepEqual(state.limitsPrefs, {
    hideUncollected: false,
    showRemaining: true,
    hiddenAccountHashes: [validHash, secondHash],
  });
});

test('approval alerts sanitize items, open overview on tap and reset on reconnect', async () => {
  const { createInitialState, receiveNativeMessage } = await stateModule;
  const id = '11111111-2222-4333-8444-555555555555';
  let state = { ...createInitialState(), page: 'sessions', approvalsPending: true };
  state = receiveNativeMessage(state, {
    type: 'approvalAlerts',
    enabled: true,
    permission: true,
    status: 'ok',
    message: '待电脑端确认 1 条',
    items: [
      { id: ` ${id.toUpperCase()} `, deviceId: 'pc', deviceName: 'Workstation', client: 'codex', tool: 'Bash', command: 'ls -la', createdAt: 1000, expiresAt: 121000 },
      { id }, // duplicate
      { id: '' }, // invalid
    ],
  });
  assert.equal(state.approvalsPending, false);
  assert.equal(state.approvals.enabled, true);
  assert.equal(state.approvals.items.length, 1);
  assert.equal(state.approvals.items[0].id, id);
  assert.equal('pendingIds' in state.approvals, false);
  assert.equal('lastError' in state.approvals, false);

  state = receiveNativeMessage(state, { type: 'openApprovalAlerts' });
  assert.equal(state.page, 'overview');

  state = receiveNativeMessage(state, { type: 'connection', url: 'https://other-hub.test' });
  assert.equal(state.approvals.enabled, false);
  assert.equal(state.approvals.items.length, 0);
});

test('display preferences sanitize separateQoderClients, exactTrendTokens, theme, periodTabOrder, systemDark and survive Hub connection changes', async () => {
  const { createInitialState, receiveNativeMessage } = await stateModule;
  let state = createInitialState();
  assert.deepEqual(state.displayPrefs, {
    separateQoderClients: false,
    exactTrendTokens: false,
    theme: 'obsidian',
    periodTabOrder: [],
  });
  assert.equal(state.systemDark, true);
  assert.equal(state.imeVisible, false);

  state = receiveNativeMessage(state, {
    type: 'displayPrefs',
    separateQoderClients: true,
    exactTrendTokens: true,
    theme: 'daylight',
    periodTabOrder: ['today', 'yesterday', 'last7', 'month', 'today', 'invalid'],
    systemDark: false,
  });
  assert.deepEqual(state.displayPrefs, {
    separateQoderClients: true,
    exactTrendTokens: true,
    theme: 'daylight',
    periodTabOrder: ['today', 'yesterday', 'last7', 'month'],
  });
  assert.equal(state.systemDark, false);

  state = receiveNativeMessage(state, {
    type: 'displayPrefs',
    separateQoderClients: 'truthy-string',
    exactTrendTokens: 1,
    theme: 'not-a-real-theme',
    systemDark: 'yes',
  });
  assert.deepEqual(state.displayPrefs, {
    separateQoderClients: true,
    exactTrendTokens: true,
    theme: 'daylight',
    periodTabOrder: ['today', 'yesterday', 'last7', 'month'],
  });
  assert.equal(state.systemDark, false);

  // Fewer than 3 valid tabs resets to default []
  state = receiveNativeMessage(state, {
    type: 'displayPrefs',
    theme: '  AUTO  ',
    periodTabOrder: ['today', 'yesterday'],
    systemDark: true,
  });
  assert.equal(state.displayPrefs.theme, 'auto');
  assert.deepEqual(state.displayPrefs.periodTabOrder, []);
  assert.equal(state.systemDark, true);

  state = receiveNativeMessage(state, { type: 'imeVisibility', visible: true });
  assert.equal(state.imeVisible, true);

  state = receiveNativeMessage(state, { type: 'connection', url: 'https://another-hub.example.com' });
  assert.deepEqual(state.displayPrefs, {
    separateQoderClients: true,
    exactTrendTokens: true,
    theme: 'auto',
    periodTabOrder: [],
  });
  assert.equal(state.systemDark, true);
  assert.equal(state.imeVisible, true);

  state = receiveNativeMessage(state, { type: 'imeVisibility', visible: false });
  assert.equal(state.imeVisible, false);
});

test('fixedRangeResult tracks requestIds, pauses on background lifecycle, and clears on reconnect', async () => {
  const { createInitialState, receiveNativeMessage } = await stateModule;
  const { beginFixedRangeQuery } = await import('../../ui/src/fixedRangeState.js');
  let state = createInitialState();
  state = {
    ...state,
    fixedRange: beginFixedRangeQuery(state.fixedRange, {
      period: 'yesterday',
      requestId: 'fr-1',
      signature: 'sig-1',
    }),
  };
  assert.equal(state.fixedRange.yesterday?.loading, true);

  // Stale requestId is ignored
  const afterStale = receiveNativeMessage(state, {
    type: 'fixedRangeResult',
    period: 'yesterday',
    requestId: 'fr-stale',
    scanned: { pc1: { start: '2026-11-25', end: '2026-11-25', period: { totalTokens: 999 } } },
  });
  assert.equal(afterStale.fixedRange.yesterday?.loading, true);
  assert.equal(afterStale.fixedRange.yesterday?.scanned, null);

  // Matching requestId populates sanitized scanned slices and deviceHistories
  state = receiveNativeMessage(state, {
    type: 'fixedRangeResult',
    period: 'yesterday',
    requestId: 'fr-1',
    scanned: {
      pc1: {
        revision: 'rev-1',
        start: '2026-11-25',
        end: '2026-11-25',
        period: { totalTokens: 1200, costUsd: 0.45 },
      },
      badSlice: { start: 'not-a-date', end: '2026-11-25', period: {} },
    },
    deviceHistories: [{ deviceId: 'pc2', updatedAt: '2026-11-26T00:00:00Z', historyAvailable: true, history: { daily: [] } }],
  });
  assert.equal(state.fixedRange.yesterday?.loading, false);
  assert.equal(state.fixedRange.yesterday?.scanned?.pc1?.period?.totalTokens, 1200);
  assert.equal('badSlice' in (state.fixedRange.yesterday?.scanned || {}), false);
  assert.equal(state.fixedRange.yesterday?.deviceHistories?.length, 1);

  // Backgrounding pauses in-flight loading without dropping already resolved cache
  state = {
    ...state,
    fixedRange: beginFixedRangeQuery(state.fixedRange, {
      period: 'last7',
      requestId: 'fr-2',
      signature: 'sig-2',
    }),
  };
  assert.equal(state.fixedRange.last7?.loading, true);
  state = receiveNativeMessage(state, { type: 'lifecycle', foreground: false });
  assert.equal(state.fixedRange.last7?.loading, false);
  assert.equal(state.fixedRange.yesterday?.scanned?.pc1?.period?.totalTokens, 1200);

  // Refreshing same period retains scanned/deviceHistories and strips unverified titles when revision rotates (#1685)
  let titledState = receiveNativeMessage(createInitialState(), {
    type: 'fixedRangeResult',
    period: 'yesterday',
    requestId: '',
    scanned: {},
  });
  titledState = {
    ...titledState,
    fixedRange: beginFixedRangeQuery(titledState.fixedRange, {
      period: 'yesterday',
      requestId: 'fr-titled-1',
      signature: 'sig-a',
      revisions: { pc1: 'rev-a' },
    }),
  };
  titledState = receiveNativeMessage(titledState, {
    type: 'fixedRangeResult',
    period: 'yesterday',
    requestId: 'fr-titled-1',
    scanned: {
      pc1: {
        revision: 'rev-a',
        start: '2026-11-25',
        end: '2026-11-25',
        period: {
          totalTokens: 500,
          sessions: { 'codex:s1': { client: 'codex', sessionId: 's1', title: 'Private Title', totalTokens: 500 } },
        },
      },
    },
  });
  const refreshingVerified = beginFixedRangeQuery(titledState.fixedRange, {
    period: 'yesterday',
    requestId: 'fr-titled-2',
    signature: 'sig-b',
    revisions: { pc1: 'rev-a' },
  });
  assert.equal(refreshingVerified.yesterday?.loading, true);
  assert.equal(refreshingVerified.yesterday?.scanned?.pc1?.period?.sessions?.['codex:s1']?.title, 'Private Title');

  const refreshingRevoked = beginFixedRangeQuery(titledState.fixedRange, {
    period: 'yesterday',
    requestId: 'fr-titled-3',
    signature: 'sig-c',
    revisions: { pc1: 'rev-b' },
  });
  assert.equal(refreshingRevoked.yesterday?.loading, true);
  assert.equal(refreshingRevoked.yesterday?.scanned?.pc1?.period?.totalTokens, 500);
  assert.equal(refreshingRevoked.yesterday?.scanned?.pc1?.period?.sessions?.['codex:s1']?.title, undefined);

  // Paged session recovery supports today and month when sessionDetailsOmitted > 0 (#1682)
  const { fixedRangeStatsSignature, needsPagedSessions } = await import('../../ui/src/fixedRangeState.js');
  const omittedStats = {
    fixedRangeRevisions: { pc1: 'rev-d1' },
    sessionDetailsOmitted: { today: 3 },
    devices: [
      {
        deviceId: 'pc1',
        updatedAt: '2026-11-27T10:00:00Z',
        sessionDetailsOmitted: { today: 3 },
        periodWindows: { today: { key: '2026-11-27', endsAt: '2026-11-28T00:00:00Z' } },
      },
    ],
  };
  assert.equal(needsPagedSessions(omittedStats, 'today'), true);
  assert.equal(needsPagedSessions(omittedStats, 'month'), false);
  assert.ok(fixedRangeStatsSignature(omittedStats, 'today').length > 0);
  assert.equal(fixedRangeStatsSignature(omittedStats, 'month'), '');

  // Connection change resets fixedRange cache
  state = receiveNativeMessage(state, { type: 'connection', url: 'https://new-hub.example.com' });
  assert.deepEqual(state.fixedRange, {});
});

test('limitAccountPresentation sanitizes custom labels/order and resets on reconnect', async () => {
  const { createInitialState, receiveNativeMessage } = await stateModule;
  let state = createInitialState();
  assert.deepEqual(state.limitAccountPresentation, {});

  state = receiveNativeMessage(state, {
    type: 'limitAccountPresentation',
    data: {
      deepseek: {
        labels: {
          'sha256:one': '  Work   Account  ',
          'sha256:cleared': '   ',
          'sha256:email': 'user@example.com',
          'sha256:url': 'https://evil.example/path',
          '': 'blank-key',
          '  untrimmed ': 'bad-key',
        },
        order: ['sha256:one', 'sha256:one', 'sha256:two', '  bad  '],
      },
      alibaba: {
        labels: { 'sha256:ali:cn-personal': '百炼主力' },
        order: ['sha256:ali:cn-personal'],
      },
      'INVALID PROVIDER!': { labels: { a: 'b' }, order: ['a'] },
    },
  });

  assert.deepEqual(state.limitAccountPresentation, {
    deepseek: {
      labels: {
        'sha256:one': 'Work Account',
        'sha256:cleared': '',
      },
      order: ['sha256:one', 'sha256:two'],
    },
    alibaba: {
      labels: { 'sha256:ali:cn-personal': '百炼主力' },
      order: ['sha256:ali:cn-personal'],
    },
  });

  state = receiveNativeMessage(state, { type: 'connection', url: 'https://other-hub.example.com' });
  assert.deepEqual(state.limitAccountPresentation, {});
});

test('hubProfiles strip secret fields and survive inactive profile updates', async () => {
  const { createInitialState, receiveNativeMessage } = await stateModule;
  let state = createInitialState();
  assert.deepEqual(state.hubProfiles, []);
  assert.equal(state.activeHubProfileId, '');

  state = receiveNativeMessage(state, {
    type: 'connection',
    url: 'https://hub-a.example.com',
    allowHttp: false,
    activeHubProfileId: 'hub-a',
    hubProfiles: [
      { id: 'hub-a', name: 'Work Hub', url: 'https://hub-a.example.com', allowHttp: false, secret: 'do-not-leak' },
      { id: 'hub-a', name: 'Duplicate ID', url: 'https://dup.example.com', allowHttp: false },
      { id: '', name: 'No ID', url: 'https://invalid.example.com', allowHttp: false },
      { id: 'hub-b', name: ' ', url: 'http://127.0.0.1:17321', allowHttp: true, token: 'secret-too' },
    ],
  });
  assert.equal(state.activeHubProfileId, 'hub-a');
  assert.equal(state.hubProfiles.length, 2);
  assert.deepEqual(state.hubProfiles[0], {
    id: 'hub-a',
    name: 'Work Hub',
    url: 'https://hub-a.example.com',
    allowHttp: false,
  });
  assert.deepEqual(state.hubProfiles[1], {
    id: 'hub-b',
    name: 'http://127.0.0.1:17321',
    url: 'http://127.0.0.1:17321',
    allowHttp: true,
  });
  assert.equal(JSON.stringify(state).includes('do-not-leak'), false);
  assert.equal(JSON.stringify(state).includes('secret-too'), false);

  state = receiveNativeMessage(state, { type: 'stats', data: { periods: { today: { totalTokens: 42 } } }, fetchedAt: 100 });
  const epochBefore = state.connectionEpoch;

  state = receiveNativeMessage(state, {
    type: 'hubProfiles',
    activeHubProfileId: 'hub-a',
    hubProfiles: [{ id: 'hub-a', name: 'Work Hub', url: 'https://hub-a.example.com', allowHttp: false }],
  });
  assert.equal(state.connectionEpoch, epochBefore);
  assert.equal(state.stats?.periods?.today?.totalTokens, 42);
  assert.equal(state.hubProfiles.length, 1);

  state = receiveNativeMessage(state, { type: 'connection', url: 'https://synthetic.example.com' });
  assert.equal(state.hubProfiles.length, 1);
  assert.equal(state.activeHubProfileId, 'hub-a');

  state = receiveNativeMessage(state, { type: 'connection', url: '' });
  assert.equal(state.hubProfiles.length, 1);
  assert.equal(state.activeHubProfileId, '');
});

test('custom CA profile metadata and caCertDraft sanitize fields without leaking PEM or secret', async () => {
  const { createInitialState, receiveNativeMessage } = await stateModule;
  let state = createInitialState();
  const fp = 'a'.repeat(64);
  const fakePem = '-----BEGIN CERTIFICATE-----\nSECRET_RAW_PEM\n-----END CERTIFICATE-----';

  state = receiveNativeMessage(state, {
    type: 'connection',
    url: 'https://private.example.com',
    allowHttp: false,
    hasCustomCa: true,
    activeHubProfileId: 'hub-tls',
    hubProfiles: [
      {
        id: 'hub-tls',
        name: 'Private Hub',
        url: 'https://private.example.com',
        allowHttp: false,
        hasCustomCa: true,
        caFingerprint: fp,
        caSubject: 'CN=Private CA',
        caNotAfter: 1893456000000,
        caCertPem: fakePem,
        secret: 'never-leak-secret',
      },
    ],
  });
  assert.equal(state.hasCustomCa, true);
  assert.equal(state.hubProfiles.length, 1);
  assert.deepEqual(state.hubProfiles[0], {
    id: 'hub-tls',
    name: 'Private Hub',
    url: 'https://private.example.com',
    allowHttp: false,
    hasCustomCa: true,
    caFingerprint: fp,
    caSubject: 'CN=Private CA',
    caNotAfter: 1893456000000,
  });
  assert.equal(JSON.stringify(state).includes('SECRET_RAW_PEM'), false);
  assert.equal(JSON.stringify(state).includes('never-leak-secret'), false);

  state = receiveNativeMessage(state, {
    type: 'caCertDraft',
    requestId: 'req-1',
    ok: true,
    draftToken: 'tok-abc',
    cert: {
      sha256: fp,
      subject: 'CN=Private CA',
      issuer: 'CN=Private CA',
      notBefore: 1700000000000,
      notAfter: 1893456000000,
      certCount: 1,
      isCa: true,
      pem: fakePem,
    },
    caCertPem: fakePem,
  });
  assert.equal(state.caDraft?.loading, false);
  assert.equal(state.caDraft?.draftToken, 'tok-abc');
  assert.equal(state.caDraft?.cert?.sha256, fp);
  assert.equal(state.caDraft?.error, '');
  assert.equal(JSON.stringify(state).includes('SECRET_RAW_PEM'), false);

  // Stale requestId must be ignored when a newer requestId is tracked
  const afterReq1 = state;
  state = receiveNativeMessage(state, {
    type: 'caCertDraft',
    requestId: 'req-stale',
    ok: false,
    error: 'stale error',
  });
  assert.deepEqual(state.caDraft, afterReq1.caDraft);

  // Malformed sha256 in cert summary must fail closed rather than storing invalid metadata
  state = { ...state, caDraft: { requestId: 'req-2', loading: true, draftToken: '', cert: null, error: '' } };
  state = receiveNativeMessage(state, {
    type: 'caCertDraft',
    requestId: 'req-2',
    ok: true,
    draftToken: 'tok-bad',
    cert: { sha256: 'not-hex', subject: 'CN=Bad' },
  });
  assert.equal(state.caDraft?.draftToken, '');
  assert.equal(state.caDraft?.cert, null);
  assert.ok(state.caDraft?.error);

  // Cancelled picker clears draft when no previous draftToken exists
  state = { ...state, caDraft: { requestId: 'req-3', loading: true, draftToken: '', cert: null, error: '' } };
  state = receiveNativeMessage(state, {
    type: 'caCertDraft',
    requestId: 'req-3',
    cancelled: true,
  });
  assert.equal(state.caDraft, null);

  // Connection change clears ephemeral caDraft
  state = receiveNativeMessage(state, {
    type: 'caCertDraft',
    requestId: 'req-4',
    ok: true,
    draftToken: 'tok-live',
    cert: { sha256: fp, subject: 'CN=Private CA', issuer: 'CN=Private CA', notBefore: 1, notAfter: 2, certCount: 1, isCa: true },
  });
  assert.equal(state.caDraft?.draftToken, 'tok-live');
  state = receiveNativeMessage(state, { type: 'connection', url: 'https://other.example.com', allowHttp: false, hasCustomCa: false });
  assert.equal(state.caDraft, null);
  assert.equal(state.hasCustomCa, false);
});
