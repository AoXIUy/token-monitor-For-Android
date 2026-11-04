'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const M = require('../../app/src/main/assets/model');
const fetchedAt = new Date(2026, 10, 4, 0, 5).getTime();
const fixture = daily => ({ historyPreview: { daily } });
const day = (date, tokens) => ({ date, tokens });

test('Android widget week uses seven local calendar days instead of seven recorded days', () => {
  const stats = fixture([day('2026-10-01', 100), day('2026-10-15', 200), day('2026-11-02', 10), day('2026-11-04', 5)]);
  const before = JSON.stringify(stats);
  assert.deepEqual(M.widgetHistory(stats, fetchedAt), {
    recentDays: 2, sevenDayDays: 2, sevenDayTokens: 15, peakDayTokens: 10,
  });
  assert.equal(JSON.stringify(stats), before);
});

test('Android widget calendar windows reject invalid, future and duplicate daily readings', () => {
  const stats = fixture([day('2026-10-21', 1000), day('2026-10-22', 50), day('2026-10-28', 20),
    day('2026-10-29', 3), day('2026-11-02', 10), day('2026-11-04', 5), day('2026-11-04', 4),
    day('2026-11-05', 1000), day('2026-11-31', 1000), day('invalid', 1000),
    day('2026-11-03', -1), day('2026-11-01', '1000'), null]);
  assert.deepEqual(M.widgetHistory(stats, fetchedAt), {
    recentDays: 5, sevenDayDays: 3, sevenDayTokens: 18, peakDayTokens: 50,
  });
});

test('Android widget missing week stays unknown while explicit zero and leap dates remain available', () => {
  assert.deepEqual(M.widgetHistory(fixture([day('2026-10-28', 20)]), fetchedAt), {
    recentDays: 1, sevenDayDays: 0, sevenDayTokens: null, peakDayTokens: 20,
  });
  assert.deepEqual(M.widgetHistory(fixture([day('2026-10-21', 20)]), fetchedAt), {
    recentDays: 0, sevenDayDays: 0, sevenDayTokens: null, peakDayTokens: null,
  });
  assert.equal(M.widgetHistory(fixture([day('2026-11-04', 0)]), fetchedAt).sevenDayTokens, 0);
  assert.equal(M.widgetHistory(fixture([day('2024-02-29', 5)]), new Date(2024, 2, 1, 0, 5).getTime()).sevenDayTokens, 5);
  assert.equal(M.widgetHistory(null, NaN).sevenDayTokens, null);
});
