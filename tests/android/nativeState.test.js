'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const stateModule = import('../../ui/src/nativeState.js');

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
