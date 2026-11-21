'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const M = require('../../app/src/main/assets/model');
const sessionLive = require('../../src/shared/sessionLive');

test('v0.95.0: recognizes Junie and OpenCodeReview client labels and aggregates period totals', () => {
  assert.equal(M.clientLabel('junie'), 'Junie');
  assert.equal(M.clientLabel('opencodereview'), 'OpenCodeReview');

  const stats = {
    updatedAt: '2026-11-21T09:00:00Z',
    staleAfterMs: 3600000,
    periods: {
      today: {
        totalTokens: 300,
        inputTokens: 200,
        outputTokens: 100,
        totalCostUsd: 0.05,
        clients: { junie: 200, opencodereview: 100 },
        clientCosts: { junie: 0.03, opencodereview: 0.02 },
        sessions: {
          'junie:s1': {
            key: 'junie:s1',
            client: 'junie',
            title: 'Fix Junie inspection',
            totalTokens: 200,
            inputTokens: 120,
            outputTokens: 80,
            costUsd: 0.03,
            lastActiveAt: '2026-11-21T08:59:00Z',
          },
          'opencodereview:s2': {
            key: 'opencodereview:s2',
            client: 'opencodereview',
            title: 'Review PR #1579',
            totalTokens: 100,
            inputTokens: 80,
            outputTokens: 20,
            costUsd: 0.02,
            lastActiveAt: '2026-11-21T08:58:00Z',
          },
        },
      },
    },
  };

  const selected = M.select(stats, null, 'today', Date.parse('2026-11-21T09:00:30Z'));
  const breakdownRows = M.breakdown(selected.period, 'clients');
  assert.deepEqual(
    breakdownRows.map((row) => ({ id: row.id, label: M.clientLabel(row.id), tokens: row.tokens })),
    [
      { id: 'junie', label: 'Junie', tokens: 200 },
      { id: 'opencodereview', label: 'OpenCodeReview', tokens: 100 },
    ],
  );
  const sessionRows = M.sessions(selected.period);
  assert.deepEqual(
    sessionRows.map((session) => ({ key: session.key, clientLabel: M.clientLabel(session.client) })),
    [
      { key: 'junie:s1', clientLabel: 'Junie' },
      { key: 'opencodereview:s2', clientLabel: 'OpenCodeReview' },
    ],
  );
});

test('v0.95.0: preserves session context meters for Grok, WorkBuddy and CatPaw rows', () => {
  for (const [client, contextTokens, contextWindow, expectedPercent] of [
    ['grok', 64000, 128000, 50],
    ['workbuddy', 150000, 200000, 75],
    ['catpaw', 40000, 160000, 25],
  ]) {
    const context = sessionLive.sessionContextWindow({ client, contextTokens, contextWindow });
    assert.deepEqual(context, {
      contextTokens,
      contextWindow,
      percentUsed: expectedPercent,
      percentLeft: 100 - expectedPercent,
    });
  }

  const detail = M.sessionDetail({
    updatedAt: '2026-11-21T09:00:00Z',
    periods: {
      month: {
        sessions: {
          'catpaw:ctx-1': {
            key: 'catpaw:ctx-1',
            client: 'catpaw',
            title: 'CatPaw context session',
            contextTokens: 40000,
            contextWindow: 160000,
            totalTokens: 40000,
            inputTokens: 30000,
            outputTokens: 10000,
            lastActiveAt: '2026-11-21T08:59:00Z',
          },
        },
      },
    },
  }, 'catpaw:ctx-1', { period: 'month' });
  assert.deepEqual(detail?.context, {
    contextTokens: 40000,
    contextWindow: 160000,
    percentUsed: 25,
    percentLeft: 75,
  });
});

test('v0.95.0: ui/src/utils/formatters.ts styles Junie and OpenCodeReview cleanly', () => {
  const formattersSource = fs.readFileSync(
    path.join(__dirname, '../../ui/src/utils/formatters.ts'),
    'utf8',
  );
  assert.match(formattersSource, /case 'junie':/);
  assert.match(formattersSource, /case 'opencodereview':/);

  const clientCatalogCode = fs.readFileSync(
    path.join(__dirname, '../../src/shared/clientCatalog.js'),
    'utf8',
  );
  const sandbox = { module: { exports: {} }, exports: {} };
  vm.runInNewContext(clientCatalogCode, sandbox);
  const catalog = sandbox.module.exports;
  assert.equal(catalog.CLIENT_LABELS.junie, 'Junie');
  assert.equal(catalog.CLIENT_LABELS.opencodereview, 'OpenCodeReview');
  assert.ok(catalog.DEFAULT_CLIENT_IDS.includes('junie'));
  assert.ok(catalog.DEFAULT_CLIENT_IDS.includes('opencodereview'));
});
