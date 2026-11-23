'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const stateModule = import('../../ui/src/agManagerState.js');
const nativeModule = import('../../ui/src/nativeState.js');

test('agManagerState sanitizes snapshots, strips credentials, and rejects stale requestIds', async () => {
  const {
    createInitialAgManagerState,
    beginAgManagerQuery,
    receiveAgManagerResult,
    receiveAgManagerError,
    setAgManagerFilter,
    selectVisibleAgManagerAccounts,
  } = await stateModule;

  let state = createInitialAgManagerState();
  state = beginAgManagerQuery(state, { requestId: 'req-2' });
  assert.equal(state.loading, true);

  // Stale request must be ignored.
  const ignored = receiveAgManagerResult(state, {
    requestId: 'req-1',
    payload: { devices: [{ deviceId: 'stale-dev', accounts: [] }] },
  });
  assert.equal(ignored, state);

  state = receiveAgManagerResult(state, {
    requestId: 'req-2',
    payload: {
      updatedAt: '2026-11-23T10:00:00Z',
      devices: [
        {
          deviceId: 'pc-1',
          hostname: 'Main-PC',
          updatedAt: '2026-11-23T10:00:00Z',
          settings: { startupRefresh: false, autoRefresh: true, refreshIntervalMinutes: 15 },
          activeAccounts: { classic: 'a1', ide: '', agy: 'bob@example.com', acp: '' },
          accounts: [
            {
              id: 'a1',
              email: 'alice@example.com',
              name: 'Alice',
              subscriptionTier: 'ultra',
              hasDeviceProfile: true,
              refresh_token: '1//must-strip',
              accessToken: 'ya29.must-strip',
              quota: {
                models: [
                  { name: 'claude-sonnet-4-6', displayName: 'Claude Sonnet 4.6', percentage: 105, resetTime: '2026-11-23T12:00:00Z' },
                ],
              },
            },
            {
              id: 'a2',
              email: 'bob@example.com',
              subscriptionTier: 'PRO',
              validationBlocked: true,
              validationMessage: 'Verify required',
              quota: { isForbidden: true, models: [] },
            },
          ],
        },
        {
          deviceId: 'pc-2',
          hostname: 'Backup-PC',
          accounts: [
            { id: 'b1', email: 'carol@example.com', subscriptionTier: 'FREE', quota: { models: [] } },
          ],
        },
      ],
    },
  });

  assert.equal(state.loading, false);
  assert.equal(state.devices.length, 2);
  assert.equal(state.selectedDeviceId, 'pc-1');
  const serialized = JSON.stringify(state);
  assert.equal(serialized.includes('1//must-strip'), false);
  assert.equal(serialized.includes('ya29.must-strip'), false);

  const view1 = selectVisibleAgManagerAccounts(state);
  assert.deepEqual(view1.counts, { total: 2, available: 1, abnormal: 1 });
  assert.deepEqual(view1.activeByAccountKey.a1, ['Classic']);
  assert.deepEqual(view1.activeByAccountKey.a2, ['AGY']);
  assert.equal(view1.visibleAccounts[0].quota.models[0].percentage, 100);

  state = setAgManagerFilter(state, { statusFilter: 'abnormal', tierFilter: 'PRO' });
  const viewAbnormal = selectVisibleAgManagerAccounts(state);
  assert.equal(viewAbnormal.visibleAccounts.length, 1);
  assert.equal(viewAbnormal.visibleAccounts[0].email, 'bob@example.com');

  state = setAgManagerFilter(state, { deviceId: 'pc-2', statusFilter: 'all', tierFilter: 'all', searchQuery: 'carol' });
  const view2 = selectVisibleAgManagerAccounts(state);
  assert.equal(view2.activeDevice.hostname, 'Backup-PC');
  assert.equal(view2.visibleAccounts.length, 1);

  state = beginAgManagerQuery(state, { requestId: 'req-3' });
  state = receiveAgManagerError(state, { requestId: 'req-3', code: 'unsupported_hub' });
  assert.equal(state.errorCode, 'unsupported_hub');
  assert.match(state.error, /未启用 Antigravity 账号池同步|较旧/);
});

test('nativeState wires antigravityManager messages and resets on Hub switch', async () => {
  const { createInitialState, receiveNativeMessage } = await nativeModule;
  let state = createInitialState();
  state = receiveNativeMessage(state, {
    type: 'antigravityManagerResult',
    payload: { devices: [{ deviceId: 'pc-1', accounts: [{ id: '1', email: 'a@b.com' }] }] },
  });
  assert.equal(state.agManager.devices.length, 1);
  state = receiveNativeMessage(state, { type: 'lifecycle', foreground: false });
  assert.equal(state.agManager.loading, false);
  state = receiveNativeMessage(state, { type: 'connection', url: 'https://other-hub.test' });
  assert.equal(state.agManager.devices.length, 0);
});
