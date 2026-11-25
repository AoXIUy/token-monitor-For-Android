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

test('agManagerState sanitizes quota.groups cleanly, clamps fractions, and strips secrets', async () => {
  const {
    createInitialAgManagerState,
    beginAgManagerQuery,
    receiveAgManagerResult,
  } = await stateModule;

  let state = createInitialAgManagerState();
  state = beginAgManagerQuery(state, { requestId: 'req-groups' });
  state = receiveAgManagerResult(state, {
    requestId: 'req-groups',
    payload: {
      devices: [
        {
          deviceId: 'pc-groups',
          hostname: 'Groups-PC',
          accounts: [
            {
              id: 'acc-1',
              email: 'groups@example.com',
              subscriptionTier: 'google_one_pro',
              lastUsedAt: 1763890000,
              quota: {
                last_updated: 1763892000,
                groups: [
                  {
                    display_name: 'Gemini',
                    description: 'Gemini pool',
                    secretToken: 'must-not-leak-group',
                    buckets: [
                      {
                        bucket_id: 'gemini-5h',
                        window: '5h',
                        remaining_fraction: 1.4,
                        reset_time: '2026-11-23T15:00:00Z',
                        display_name: 'Gemini 5h',
                        accessToken: 'must-not-leak-bucket',
                      },
                      {
                        bucketId: 'gemini-weekly',
                        window: 'weekly',
                        remainingFraction: -0.2,
                        resetTime: '2026-11-28T10:00:00Z',
                        displayName: 'Gemini Weekly',
                      },
                      {
                        bucketId: 'invalid-null-fraction',
                        window: '5h',
                        remainingFraction: null,
                      },
                      {
                        bucketId: 'invalid-nan-fraction',
                        window: '5h',
                        remainingFraction: 'not-a-number',
                      },
                    ],
                  },
                  {
                    displayName: '',
                    buckets: [{ bucketId: 'skip', window: '5h', remainingFraction: 0.5 }],
                  },
                ],
                models: [],
              },
            },
          ],
        },
      ],
    },
  });

  const serialized = JSON.stringify(state);
  assert.equal(serialized.includes('must-not-leak-group'), false);
  assert.equal(serialized.includes('must-not-leak-bucket'), false);

  const acc = state.devices[0].accounts[0];
  assert.equal(acc.subscriptionTier, 'PRO');
  assert.equal(acc.lastUsedAt, 1763890000);
  assert.equal(acc.quota.lastUpdated, 1763892000);
  assert.equal(acc.quota.groups.length, 1);
  assert.equal(acc.quota.groups[0].displayName, 'Gemini');
  assert.equal(acc.quota.groups[0].buckets.length, 2);
  assert.deepEqual(acc.quota.groups[0].buckets[0], {
    bucketId: 'gemini-5h',
    window: '5h',
    remainingFraction: 1,
    resetTime: '2026-11-23T15:00:00Z',
    displayName: 'Gemini 5h',
  });
  assert.equal(acc.quota.groups[0].buckets[1].remainingFraction, 0);
});

test('formatAgSlotLabel maps known slots and uppercases unknown ones', async () => {
  const { formatAgSlotLabel } = await stateModule;
  assert.equal(formatAgSlotLabel('classic'), '经典款');
  assert.equal(formatAgSlotLabel('Classic'), '经典款');
  assert.equal(formatAgSlotLabel('ide'), 'IDE');
  assert.equal(formatAgSlotLabel('agy'), 'AGY');
  assert.equal(formatAgSlotLabel('acp'), 'ACP');
  assert.equal(formatAgSlotLabel('custom_slot'), 'CUSTOM_SLOT');
  assert.equal(formatAgSlotLabel(''), '');
  assert.equal(formatAgSlotLabel(null), '');
});

test('formatAgCompactTimestamp normalizes seconds, ms, and ISO strings', async () => {
  const { formatAgCompactTimestamp } = await stateModule;
  const sampleMs = new Date(2026, 10, 23, 8, 5, 0).getTime();
  const sampleSec = Math.floor(sampleMs / 1000);

  assert.equal(formatAgCompactTimestamp(sampleSec), '2026/11/23 08:05');
  assert.equal(formatAgCompactTimestamp(sampleMs), '2026/11/23 08:05');
  assert.equal(formatAgCompactTimestamp(String(sampleSec)), '2026/11/23 08:05');
  assert.equal(formatAgCompactTimestamp(new Date(sampleMs).toISOString()), '2026/11/23 08:05');

  assert.equal(formatAgCompactTimestamp(0), '');
  assert.equal(formatAgCompactTimestamp(-100), '');
  assert.equal(formatAgCompactTimestamp(NaN), '');
  assert.equal(formatAgCompactTimestamp('invalid'), '');
  assert.equal(formatAgCompactTimestamp(null), '');
  assert.equal(formatAgCompactTimestamp(undefined), '');
});

test('inferAgCapabilityPills infers Gemini 4+ codename, Claude version, and GPT size', async () => {
  const { inferAgCapabilityPills } = await stateModule;

  const full = inferAgCapabilityPills({
    quota: {
      models: [
        { name: 'gemini-3-pro-high', displayName: 'Gemini 3 Pro High', percentage: 90, resetTime: '' },
        { name: 'gemini-4-pro-high', displayName: 'Gemini 4 Pro', percentage: 90, resetTime: '' },
        { name: 'gemini-4-hydrogen-preview', displayName: 'Gemini 4 Hydrogen', percentage: 90, resetTime: '' },
        { name: 'claude-sonnet-4-6-thinking', displayName: 'Claude Sonnet 4.6', percentage: 85, resetTime: '' },
        { name: 'gpt-oss-120b-medium', displayName: 'GPT OSS 120B', percentage: 85, resetTime: '' },
      ],
    },
  });
  assert.deepEqual(full, [
    { label: 'Hydrogen', tone: 'violet' },
    { label: 'Claude 4.6', tone: 'amber' },
    { label: 'GPT-120B', tone: 'emerald' },
  ]);

  const argonAndFallbacks = inferAgCapabilityPills({
    quota: {
      models: [
        { name: 'orchestrator-g1-pro', displayName: 'Argon', percentage: 100, resetTime: '' },
        { name: 'claude-thinking', displayName: 'Claude Thinking', percentage: 80, resetTime: '' },
        { name: 'gpt-5', displayName: 'GPT 5', percentage: 70, resetTime: '' },
      ],
    },
  });
  assert.deepEqual(argonAndFallbacks, [
    { label: 'Argon', tone: 'violet' },
    { label: 'Claude', tone: 'amber' },
    { label: 'GPT', tone: 'emerald' },
  ]);

  assert.deepEqual(inferAgCapabilityPills({ quota: { models: [] } }), []);
  assert.deepEqual(inferAgCapabilityPills(null), []);
});

test('buildAgQuotaCells pairs group buckets and appends full-width dedicated groups', async () => {
  const { buildAgQuotaCells } = await stateModule;
  const nowMs = Date.parse('2026-11-23T10:00:00Z');

  const cells = buildAgQuotaCells({
    quota: {
      groups: [
        {
          displayName: 'Gemini',
          description: '',
          buckets: [
            { bucketId: 'g-5h', window: '5h', remainingFraction: 0.92, resetTime: '2026-11-23T12:30:00Z', displayName: 'Gemini 5h' },
            { bucketId: 'g-wk', window: 'weekly', remainingFraction: 0.78, resetTime: '2026-11-27T16:00:00Z', displayName: 'Gemini Weekly' },
          ],
        },
        {
          displayName: 'Claude / GPT',
          description: '',
          buckets: [
            { bucketId: 'c-5h', window: '5h', remainingFraction: 0.45, resetTime: '2026-11-23T11:15:00Z', displayName: 'Claude 5h' },
            { bucketId: 'c-wk', window: '7d', remainingFraction: 0.12, resetTime: '2026-11-23T09:00:00Z', displayName: 'Claude Weekly' },
          ],
        },
        {
          displayName: 'Hydrogen',
          description: 'Dedicated pool',
          buckets: [
            { bucketId: 'h-wk', window: 'weekly', remainingFraction: 0.9, resetTime: '2026-11-28T10:00:00Z', displayName: 'Hydrogen Weekly' },
          ],
        },
      ],
      models: [],
    },
  }, nowMs);

  assert.equal(cells.length, 5);
  assert.deepEqual(cells.map((c) => c.id), [
    'gemini-5h',
    'claude-5h',
    'gemini-weekly',
    'claude-weekly',
    'extra-0-h-wk',
  ]);
  assert.deepEqual(cells[0], {
    id: 'gemini-5h',
    family: 'gemini',
    title: '',
    resetText: '2h 30m',
    resetTone: '5h',
    pct: 92,
    isFull: false,
    ariaLabel: 'Gemini 5h: 92% (2h 30m)',
  });
  assert.equal(cells[1].family, 'claude');
  assert.equal(cells[1].resetTone, '5h');
  assert.equal(cells[1].resetText, '1h 15m');
  assert.equal(cells[1].pct, 45);
  assert.equal(cells[2].resetText, '4d 6h');
  assert.equal(cells[2].resetTone, 'weekly');
  assert.equal(cells[3].resetText, '已就绪');
  assert.equal(cells[3].pct, 12);
  assert.deepEqual(cells[4], {
    id: 'extra-0-h-wk',
    family: 'gemini',
    title: 'Hydrogen · weekly',
    resetText: '5d 0h',
    resetTone: 'weekly',
    pct: 90,
    isFull: true,
    ariaLabel: 'Hydrogen · weekly: 90% (5d 0h)',
  });
});

test('buildAgQuotaCells falls back gracefully to summarized models or top models', async () => {
  const { buildAgQuotaCells } = await stateModule;
  const nowMs = Date.parse('2026-11-23T10:00:00Z');

  const summarized = buildAgQuotaCells({
    quota: {
      groups: [{ displayName: 'Empty Group', description: '', buckets: [] }],
      models: [
        { name: 'gemini-3-pro-high', displayName: 'Gemini 3 Pro High', percentage: 60, resetTime: '2026-11-23T14:00:00Z' },
        { name: 'gemini-2.5-pro', displayName: 'Gemini 2.5 Pro', percentage: 48, resetTime: '2026-11-23T13:00:00Z' },
        { name: 'claude-opus-4-6-thinking', displayName: 'Claude Opus 4.6', percentage: 15, resetTime: '2026-11-23T11:30:00Z' },
        { name: 'gpt-oss-120b', displayName: 'GPT 120B', percentage: 40, resetTime: '2026-11-23T12:00:00Z' },
        { name: 'gemini-3-flash', displayName: 'Gemini 3 Flash', percentage: 82, resetTime: '' },
      ],
    },
  }, nowMs);

  assert.equal(summarized.length, 3);
  assert.deepEqual(summarized.map((c) => ({ id: c.id, family: c.family, title: c.title, pct: c.pct, isFull: c.isFull, resetText: c.resetText })), [
    { id: 'model-gemini-pro', family: 'gemini', title: 'Gemini Pro', pct: 48, isFull: false, resetText: '3h 0m' },
    { id: 'model-claude-gpt', family: 'claude', title: 'Claude / GPT', pct: 15, isFull: false, resetText: '1h 30m' },
    { id: 'model-gemini-flash', family: 'gemini', title: 'Gemini Flash', pct: 82, isFull: true, resetText: '—' },
  ]);

  const genericModels = buildAgQuotaCells({
    quota: {
      models: [
        { name: 'deepseek-r1', displayName: 'DeepSeek R1', percentage: 75, resetTime: '2026-11-23T10:45:00Z' },
        { name: 'qwen-3-coder', displayName: 'Qwen 3 Coder', percentage: 50, resetTime: '' },
      ],
    },
  }, nowMs);
  assert.equal(genericModels.length, 2);
  assert.equal(genericModels[0].family, 'other');
  assert.equal(genericModels[0].title, 'DeepSeek R1');
  assert.equal(genericModels[0].resetText, '45m');
  assert.equal(genericModels[0].isFull, false);
  assert.equal(genericModels[1].isFull, false);

  assert.deepEqual(buildAgQuotaCells({ quota: { models: [] } }, nowMs), []);
  assert.deepEqual(buildAgQuotaCells(null, nowMs), []);
});

test('agManagerState handles Hub wire schema nulls, duplicate ids, and all abnormal flags', async () => {
  const {
    createInitialAgManagerState,
    beginAgManagerQuery,
    receiveAgManagerResult,
    isAgAccountAbnormal,
  } = await stateModule;

  let state = createInitialAgManagerState();
  state = beginAgManagerQuery(state, { requestId: 'req-wire' });
  state = receiveAgManagerResult(state, {
    requestId: 'req-wire',
    payload: {
      ok: true,
      updatedAt: '2026-11-23T11:00:00Z',
      devices: [
        {
          version: 1,
          deviceId: 'host-wire',
          hostname: 'Wire-PC',
          updatedAt: '2026-11-23T11:00:00Z',
          settings: { startupRefresh: false, autoRefresh: true, refreshIntervalMinutes: 10 },
          activeAccounts: { classic: 'id-1', ide: null, agy: null, acp: null },
          accounts: [
            {
              id: 'id-1',
              accountKey: 'acct-key-1',
              email: 'first@example.com',
              name: 'First',
              subscriptionTier: 'ULTRA',
              disabled: false,
              banned: false,
              validationBlocked: false,
              banCode: '',
              forbiddenModels: ['claude-opus-4-6'],
              quota: { lastUpdatedAt: 1763895600, isForbidden: false, groups: [], models: [] },
            },
            {
              id: 'id-1',
              email: 'duplicate@example.com',
              subscriptionTier: 'FREE',
              quota: null,
            },
            {
              id: 'id-2',
              email: 'disabled@example.com',
              subscriptionTier: 'PRO',
              disabled: true,
              quota: null,
            },
            {
              id: 'id-3',
              email: 'banned@example.com',
              subscriptionTier: 'FREE',
              banned: true,
              banCode: 'TOS',
              quota: null,
            },
            {
              id: 'id-4',
              email: 'verify@example.com',
              subscriptionTier: 'FREE',
              validationBlocked: true,
              quota: null,
            },
            {
              id: 'id-5',
              email: 'forbidden@example.com',
              subscriptionTier: 'FREE',
              quota: { isForbidden: true, models: [] },
            },
          ],
        },
      ],
    },
  });

  const accounts = state.devices[0].accounts;
  assert.equal(accounts.length, 5);
  assert.equal(accounts[0].email, 'first@example.com');
  assert.equal(accounts[0].quota.lastUpdated, 1763895600);
  assert.equal(accounts[1].quota.isForbidden, false);
  assert.deepEqual(accounts[1].quota.models, []);
  assert.deepEqual(accounts[1].quota.groups, []);
  assert.deepEqual(state.devices[0].activeAccounts, { classic: 'id-1', ide: '', agy: '', acp: '' });

  assert.equal(isAgAccountAbnormal(accounts[0]), false);
  assert.equal(isAgAccountAbnormal(accounts[1]), true);
  assert.equal(isAgAccountAbnormal(accounts[2]), true);
  assert.equal(isAgAccountAbnormal(accounts[3]), true);
  assert.equal(isAgAccountAbnormal(accounts[4]), true);
});

test('buildAgQuotaCells keeps dedicated codename-only and secondary Claude groups full-width', async () => {
  const { buildAgQuotaCells } = await stateModule;
  const nowMs = Date.parse('2026-11-23T10:00:00Z');

  const hydrogenOnly = buildAgQuotaCells({
    quota: {
      groups: [
        {
          displayName: 'Hydrogen',
          description: 'Dedicated Hydrogen pool',
          buckets: [
            { bucketId: 'h-wk', window: 'weekly', remainingFraction: 0.9, resetTime: '2026-11-28T10:00:00Z', displayName: 'Hydrogen Weekly' },
          ],
        },
      ],
      models: [],
    },
  }, nowMs);

  assert.equal(hydrogenOnly.length, 1);
  assert.deepEqual(hydrogenOnly[0], {
    id: 'extra-0-h-wk',
    family: 'gemini',
    title: 'Hydrogen · weekly',
    resetText: '5d 0h',
    resetTone: 'weekly',
    pct: 90,
    isFull: true,
    ariaLabel: 'Hydrogen · weekly: 90% (5d 0h)',
  });

  const secondaryClaude = buildAgQuotaCells({
    quota: {
      groups: [
        {
          displayName: 'Claude / GPT',
          description: '',
          buckets: [
            { bucketId: 'c-5h', window: '5h', remainingFraction: 0.6, resetTime: '2026-11-23T12:00:00Z', displayName: 'Claude 5h' },
          ],
        },
        {
          displayName: 'Claude 3P Overflow',
          description: '',
          buckets: [
            { bucketId: 'c3p-wk', window: 'weekly', remainingFraction: 0.3, resetTime: '2026-11-26T10:00:00Z', displayName: 'Claude 3P Weekly' },
          ],
        },
      ],
      models: [],
    },
  }, nowMs);

  assert.equal(secondaryClaude.length, 2);
  assert.equal(secondaryClaude[0].id, 'claude-5h');
  assert.equal(secondaryClaude[0].isFull, false);
  assert.deepEqual(secondaryClaude[1], {
    id: 'extra-0-c3p-wk',
    family: 'claude',
    title: 'Claude 3P Overflow · weekly',
    resetText: '3d 0h',
    resetTone: 'weekly',
    pct: 30,
    isFull: true,
    ariaLabel: 'Claude 3P Overflow · weekly: 30% (3d 0h)',
  });
});

test('agManagerState filtering, error rejection, device fallback, and nativeState lifecycle', async () => {
  const {
    createInitialAgManagerState,
    beginAgManagerQuery,
    receiveAgManagerResult,
    receiveAgManagerError,
    setAgManagerFilter,
    selectVisibleAgManagerAccounts,
  } = await stateModule;
  const { createInitialState, receiveNativeMessage } = await nativeModule;

  let state = createInitialAgManagerState();
  state = beginAgManagerQuery(state, { requestId: 'req-a' });
  state = receiveAgManagerResult(state, {
    requestId: 'req-a',
    payload: {
      devices: [
        {
          deviceId: 'dev-1',
          hostname: 'First',
          accounts: [
            {
              id: 'a1',
              email: 'one@example.com',
              quota: {
                groups: [{ displayName: 'Hydrogen', buckets: [{ bucketId: 'h1', window: '5h', remainingFraction: 0.8 }] }],
                models: [{ name: 'gemini-4', displayName: 'Gemini Hydrogen Preview', percentage: 80 }],
              },
            },
          ],
        },
        {
          deviceId: 'dev-2',
          hostname: 'Second',
          accounts: [{ id: 'a2', email: 'two@example.com', quota: { models: [] } }],
        },
      ],
    },
  });

  state = setAgManagerFilter(state, { deviceId: 'dev-2' });
  assert.equal(state.selectedDeviceId, 'dev-2');

  // Search matches group displayName and model displayName.
  let filtered = setAgManagerFilter(state, { deviceId: 'dev-1', searchQuery: 'hydrogen' });
  assert.equal(selectVisibleAgManagerAccounts(filtered).visibleAccounts.length, 1);
  filtered = setAgManagerFilter(state, { deviceId: 'dev-1', searchQuery: 'Hydrogen Preview' });
  assert.equal(selectVisibleAgManagerAccounts(filtered).visibleAccounts.length, 1);

  // Refresh preserves selected device when still present, falls back when removed.
  state = beginAgManagerQuery(state, { requestId: 'req-b' });
  state = receiveAgManagerResult(state, {
    requestId: 'req-b',
    payload: {
      devices: [
        { deviceId: 'dev-1', accounts: [] },
        { deviceId: 'dev-2', accounts: [] },
      ],
    },
  });
  assert.equal(state.selectedDeviceId, 'dev-2');

  state = beginAgManagerQuery(state, { requestId: 'req-c' });
  state = receiveAgManagerResult(state, {
    requestId: 'req-c',
    payload: { devices: [{ deviceId: 'dev-1', accounts: [] }] },
  });
  assert.equal(state.selectedDeviceId, 'dev-1');

  // Stale error is ignored; fresh error preserves custom message or defaults cleanly.
  state = beginAgManagerQuery(state, { requestId: 'req-err-active' });
  const ignoredErr = receiveAgManagerError(state, { requestId: 'req-err-stale', code: 'read_failed', message: 'Stale error' });
  assert.equal(ignoredErr, state);

  const customErr = receiveAgManagerError(state, { requestId: 'req-err-active', code: 'unauthorized', message: '认证失败，请检查 Hub secret' });
  assert.equal(customErr.loading, false);
  assert.equal(customErr.errorCode, 'unauthorized');
  assert.equal(customErr.error, '认证失败，请检查 Hub secret');

  const defaultErr = receiveAgManagerError(state, { requestId: 'req-err-active' });
  assert.equal(defaultErr.errorCode, 'read_failed');
  assert.equal(defaultErr.error, '读取 Antigravity 账号池失败');

  // nativeState keeps devices on background lifecycle (only clears loading) and resets on connection change/disconnect.
  let native = createInitialState();
  native = receiveNativeMessage(native, {
    type: 'connection',
    url: 'https://hub-one.test',
  });
  native = receiveNativeMessage(native, {
    type: 'antigravityManagerResult',
    payload: { devices: [{ deviceId: 'dev-1', accounts: [{ id: 'a1', email: 'a@b.com' }] }] },
  });
  native = { ...native, agManager: { ...native.agManager, loading: true } };
  native = receiveNativeMessage(native, { type: 'lifecycle', foreground: false });
  assert.equal(native.agManager.loading, false);
  assert.equal(native.agManager.devices.length, 1);

  native = receiveNativeMessage(native, { type: 'connection', url: '' });
  assert.equal(native.agManager.devices.length, 0);
  assert.equal(native.agManager.selectedDeviceId, '');
});

test('formatAgDeviceLabels disambiguates colliding hostnames while preserving unique names', async () => {
  const { formatAgDeviceLabels } = await stateModule;
  const labels = formatAgDeviceLabels([
    { deviceId: 'dev-debian-01', hostname: 'debian' },
    { deviceId: 'dev-win-a-1234567890', hostname: 'Workstation' },
    { deviceId: 'dev-win-b-0987654321', hostname: 'workstation' },
    { deviceId: 'only-id', hostname: '' },
  ]);
  assert.equal(labels['dev-debian-01'], 'debian');
  assert.equal(labels['dev-win-a-1234567890'], 'Workstation · dev-wi…7890');
  assert.equal(labels['dev-win-b-0987654321'], 'workstation · dev-wi…4321');
  assert.equal(labels['only-id'], 'only-id');
  assert.deepEqual(formatAgDeviceLabels([]), {});
});

test('summarizeAgDevice counts tiers/status and resolves active client slots', async () => {
  const { summarizeAgDevice } = await stateModule;
  const summary = summarizeAgDevice({
    deviceId: 'host-1',
    hostname: 'Host-1',
    updatedAt: '2026-11-24T00:00:00Z',
    settings: { startupRefresh: false, autoRefresh: true, refreshIntervalMinutes: 10 },
    activeAccounts: { classic: 'id-1', ide: 'bob@example.com', agy: '', acp: 'orphan-slot' },
    accounts: [
      { id: 'id-1', email: 'alice@example.com', subscriptionTier: 'ULTRA' },
      { id: 'id-2', email: 'bob@example.com', subscriptionTier: 'PRO', disabled: true },
      { id: 'id-3', email: 'carol@example.com', subscriptionTier: 'FREE' },
    ],
  });
  assert.equal(summary.total, 3);
  assert.equal(summary.available, 2);
  assert.equal(summary.abnormal, 1);
  assert.equal(summary.ultra, 1);
  assert.equal(summary.pro, 1);
  assert.equal(summary.free, 1);
  assert.deepEqual(summary.activeSlots, [
    { slot: 'classic', label: '经典款', target: 'id-1', email: 'alice@example.com' },
    { slot: 'ide', label: 'IDE', target: 'bob@example.com', email: 'bob@example.com' },
    { slot: 'acp', label: 'ACP', target: 'orphan-slot', email: 'orphan-slot' },
  ]);
});

test('scoreAgAccountAvailability ranks high-quota healthy accounts above low, empty, and abnormal ones', async () => {
  const { scoreAgAccountAvailability } = await stateModule;
  const high = {
    id: 'h',
    email: 'h@example.com',
    quota: {
      groups: [
        { displayName: 'Gemini', buckets: [{ bucketId: 'g-5h', window: '5h', remainingFraction: 0.9 }] },
        { displayName: 'Claude', buckets: [{ bucketId: 'c-5h', window: '5h', remainingFraction: 0.8 }] },
      ],
      models: [],
    },
  };
  const tieSameAvgLowerMin = {
    id: 'm',
    email: 'm@example.com',
    quota: {
      groups: [
        { displayName: 'Gemini', buckets: [{ bucketId: 'g-5h', window: '5h', remainingFraction: 1.0 }] },
        { displayName: 'Claude', buckets: [{ bucketId: 'c-5h', window: '5h', remainingFraction: 0.7 }] },
      ],
      models: [],
    },
  };
  const lowZero = {
    id: 'z',
    email: 'z@example.com',
    quota: {
      groups: [{ displayName: 'Gemini', buckets: [{ bucketId: 'g-5h', window: '5h', remainingFraction: 0 }] }],
      models: [],
    },
  };
  const emptyHealthy = { id: 'e', email: 'e@example.com', quota: { groups: [], models: [] } };
  const abnormalHigh = {
    id: 'a',
    email: 'a@example.com',
    banned: true,
    quota: {
      groups: [{ displayName: 'Gemini', buckets: [{ bucketId: 'g-5h', window: '5h', remainingFraction: 1 }] }],
      models: [],
    },
  };

  assert.ok(scoreAgAccountAvailability(high) > scoreAgAccountAvailability(tieSameAvgLowerMin));
  assert.ok(scoreAgAccountAvailability(tieSameAvgLowerMin) > scoreAgAccountAvailability(lowZero));
  assert.ok(scoreAgAccountAvailability(lowZero) > scoreAgAccountAvailability(emptyHealthy));
  assert.ok(scoreAgAccountAvailability(emptyHealthy) > scoreAgAccountAvailability(abnormalHigh));
  assert.equal(scoreAgAccountAvailability(abnormalHigh), -1);
});

test('agManagerState deduplicates repeated deviceIds and model names to keep React keys unique', async () => {
  const {
    createInitialAgManagerState,
    beginAgManagerQuery,
    receiveAgManagerResult,
  } = await stateModule;

  let state = createInitialAgManagerState();
  state = beginAgManagerQuery(state, { requestId: 'req-dedupe' });
  state = receiveAgManagerResult(state, {
    requestId: 'req-dedupe',
    payload: {
      devices: [
        {
          deviceId: 'host-dup',
          hostname: 'Primary',
          accounts: [
            {
              id: 'acc-1',
              email: 'one@example.com',
              quota: {
                models: [
                  { name: 'gemini-3-pro', displayName: 'Gemini 3 Pro', percentage: 80 },
                  { name: 'gemini-3-pro', displayName: 'Duplicate Model', percentage: 10 },
                  { name: 'claude-4', displayName: 'Claude 4', percentage: 60 },
                ],
              },
            },
          ],
        },
        {
          deviceId: 'host-dup',
          hostname: 'Duplicate Host',
          accounts: [{ id: 'acc-2', email: 'two@example.com' }],
        },
      ],
    },
  });

  assert.equal(state.devices.length, 1);
  assert.equal(state.devices[0].hostname, 'Primary');
  assert.equal(state.devices[0].accounts[0].quota.models.length, 2);
  assert.equal(state.devices[0].accounts[0].quota.models[0].percentage, 80);
});
