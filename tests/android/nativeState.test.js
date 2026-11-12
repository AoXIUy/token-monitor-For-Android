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
