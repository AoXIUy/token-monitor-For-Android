// @ts-check

/** @type {readonly import('./types/monitor').DerivedPeriodId[]} */
export const DERIVED_PERIOD_IDS = Object.freeze(['yesterday', 'week', 'last7', 'last30']);

/** @type {readonly import('./types/monitor').PeriodId[]} */
export const PAGED_SESSION_PERIOD_IDS = Object.freeze(['today', 'month']);

/** @type {readonly import('./types/monitor').PeriodId[]} */
export const ALLOWED_PERIOD_TABS = Object.freeze([
  'today',
  'yesterday',
  'week',
  'last7',
  'month',
  'last30',
  'allTime',
]);

/** @param {unknown} value @returns {value is import('./types/monitor').DerivedPeriodId} */
export function isDerivedPeriodId(value) {
  return typeof value === 'string' && DERIVED_PERIOD_IDS.includes(/** @type {any} */ (value));
}

/** @param {unknown} value @returns {value is import('./types/monitor').PeriodId} */
export function isFixedRangeQueryPeriod(value) {
  return isDerivedPeriodId(value) || value === 'today' || value === 'month';
}

/**
 * @param {import('./types/monitor').MonitorStats | null} stats
 * @param {import('./types/monitor').PeriodId} period
 * @returns {boolean}
 */
export function needsPagedSessions(stats, period) {
  if (!stats || (period !== 'today' && period !== 'month')) return false;
  if (!((stats.sessionDetailsOmitted?.[period] ?? 0) > 0)) return false;
  const revisions = stats.fixedRangeRevisions || {};
  return (stats.devices || []).some(
    (device) =>
      (device?.sessionDetailsOmitted?.[period] ?? 0) > 0 &&
      Boolean(device?.periodWindows?.today?.key) &&
      Boolean(Object.prototype.hasOwnProperty.call(revisions, device.deviceId) && revisions[device.deviceId]),
  );
}

/** @param {unknown} raw @returns {import('./types/monitor').PeriodId[]} */
export function sanitizePeriodTabOrder(raw) {
  if (!Array.isArray(raw)) return [];
  /** @type {import('./types/monitor').PeriodId[]} */
  const seen = [];
  for (const item of raw) {
    if (typeof item !== 'string') continue;
    const trimmed = /** @type {import('./types/monitor').PeriodId} */ (item.trim());
    if (ALLOWED_PERIOD_TABS.includes(trimmed) && !seen.includes(trimmed)) {
      seen.push(trimmed);
      if (seen.length >= 6) break;
    }
  }
  return seen.length < 3 ? [] : seen;
}

/** @returns {import('./types/monitor').FixedRangeState} */
export function createInitialFixedRangeState() {
  return {};
}

/**
 * @param {import('./types/monitor').MonitorStats | null} stats
 * @param {import('./types/monitor').PeriodId} period
 * @returns {string}
 */
export function fixedRangeStatsSignature(stats, period) {
  if (!stats) return '';
  if (!isDerivedPeriodId(period)) {
    if (!needsPagedSessions(stats, period)) return '';
  } else if (stats.periods?.[period] && !stats.fixedRangeRevisions) {
    // Pre-populated fixture/demo periods need no async network fetch.
    return '';
  }
  const revisions = Object.entries(stats.fixedRangeRevisions || {}).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  const devices = (stats.devices || []).map((device) => [
    device.deviceId || '',
    device.updatedAt || '',
    device.periodWindows?.today?.key || '',
    device.periodWindows?.today?.endsAt || '',
    device.sessionDetailsOmitted?.[period] || 0,
  ]);
  return JSON.stringify([period, revisions, stats.deviceHistoryRevision || '', devices]);
}

/** @param {unknown} value */
function isPlainObject(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

/**
 * Keep session titles on retained slices only while the device's range revision
 * remains verified in the current Hub stats snapshot (#1685).
 * @param {Record<string, import('./types/monitor').FixedRangeSlice> | null | undefined} scanned
 * @param {Record<string, string> | null | undefined} revisions
 * @returns {Record<string, import('./types/monitor').FixedRangeSlice> | null}
 */
function retainVerifiedScannedTitles(scanned, revisions) {
  if (!scanned || !isPlainObject(scanned)) return null;
  if (!revisions || !isPlainObject(revisions)) {
    /** @type {Record<string, import('./types/monitor').FixedRangeSlice>} */
    const strippedAll = {};
    for (const [devId, slice] of Object.entries(scanned)) {
      strippedAll[devId] = stripSliceTitles(slice);
    }
    return strippedAll;
  }
  let changed = false;
  /** @type {Record<string, import('./types/monitor').FixedRangeSlice>} */
  const out = {};
  for (const [devId, slice] of Object.entries(scanned)) {
    const currentRev = revisions[devId];
    if (slice?.revision && currentRev === slice.revision) {
      out[devId] = slice;
    } else {
      changed = true;
      out[devId] = stripSliceTitles(slice);
    }
  }
  return changed ? out : scanned;
}

/**
 * @param {import('./types/monitor').FixedRangeSlice} slice
 * @returns {import('./types/monitor').FixedRangeSlice}
 */
function stripSliceTitles(slice) {
  const sessions = slice?.period?.sessions;
  if (!sessions || !isPlainObject(sessions)) return slice;
  let anyTitled = false;
  /** @type {Record<string, Omit<import('./types/monitor').SessionRow, 'key'>>} */
  const nextSessions = {};
  for (const [key, sess] of Object.entries(sessions)) {
    if (sess && typeof sess === 'object' && sess.title) {
      anyTitled = true;
      const copy = { ...sess };
      delete copy.title;
      nextSessions[key] = copy;
    } else {
      nextSessions[key] = sess;
    }
  }
  if (!anyTitled) return slice;
  return {
    ...slice,
    period: {
      ...slice.period,
      sessions: nextSessions,
    },
  };
}

/**
 * @param {import('./types/monitor').FixedRangeState} state
 * @param {{ period: import('./types/monitor').PeriodId, requestId: string, signature: string, revisions?: Record<string, string> | null }} query
 * @returns {import('./types/monitor').FixedRangeState}
 */
export function beginFixedRangeQuery(state, { period, requestId, signature, revisions }) {
  if (!isFixedRangeQueryPeriod(period) || !requestId) return state;
  const previous = state[period];
  const retainedScanned = previous?.scanned
    ? previous.signature === signature || revisions === undefined
      ? previous.scanned
      : retainVerifiedScannedTitles(previous.scanned, revisions)
    : null;
  const retainedHistories = previous?.deviceHistories ?? null;
  return {
    ...state,
    [period]: {
      loading: true,
      requestId,
      signature,
      scanned: retainedScanned,
      deviceHistories: retainedHistories,
      historyError: '',
      error: '',
    },
  };
}

/**
 * @param {import('./types/monitor').FixedRangeState} state
 * @param {Record<string, unknown>} message
 * @returns {import('./types/monitor').FixedRangeState}
 */
export function receiveFixedRangeResult(state, message) {
  const period = message.period;
  if (!isFixedRangeQueryPeriod(period)) return state;
  const current = state[period];
  const requestId = typeof message.requestId === 'string' ? message.requestId.trim().slice(0, 80) : '';
  if (!current || (current.requestId && requestId && current.requestId !== requestId)) {
    return state;
  }
  /** @type {Record<string, import('./types/monitor').FixedRangeSlice> | null} */
  let scanned = null;
  if (isPlainObject(message.scanned)) {
    scanned = {};
    for (const [devId, rawSlice] of Object.entries(/** @type {Record<string, unknown>} */ (message.scanned))) {
      if (!devId || devId.length > 256 || !isPlainObject(rawSlice)) continue;
      const slice = /** @type {Record<string, unknown>} */ (rawSlice);
      const start = typeof slice.start === 'string' ? slice.start.slice(0, 10) : '';
      const end = typeof slice.end === 'string' ? slice.end.slice(0, 10) : '';
      if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end) || !isPlainObject(slice.period)) {
        continue;
      }
      scanned[devId] = {
        ...(typeof slice.revision === 'string' && slice.revision ? { revision: slice.revision.slice(0, 128) } : {}),
        start,
        end,
        period: /** @type {import('./types/monitor').PeriodData} */ (slice.period),
      };
    }
  }
  const deviceHistories = Array.isArray(message.deviceHistories)
    ? /** @type {Array<Record<string, unknown>>} */ (message.deviceHistories.filter(isPlainObject))
    : null;
  const historyError = typeof message.historyError === 'string' ? message.historyError.slice(0, 120) : '';
  const error = typeof message.error === 'string' ? message.error.slice(0, 120) : '';
  const retainOnTransientError = Boolean(error && error !== 'unauthorized' && scanned === null && deviceHistories === null);
  return {
    ...state,
    [period]: {
      ...current,
      loading: false,
      scanned: retainOnTransientError ? current.scanned : scanned,
      deviceHistories: retainOnTransientError ? current.deviceHistories : deviceHistories,
      historyError,
      error,
    },
  };
}

/**
 * @param {import('./types/monitor').FixedRangeState} state
 * @returns {import('./types/monitor').FixedRangeState}
 */
export function pauseFixedRangeLoading(state) {
  let changed = false;
  /** @type {import('./types/monitor').FixedRangeState} */
  const next = {};
  for (const period of /** @type {const} */ ([...DERIVED_PERIOD_IDS, ...PAGED_SESSION_PERIOD_IDS])) {
    const entry = state[period];
    if (!entry) continue;
    if (entry.loading) {
      changed = true;
      next[period] = { ...entry, loading: false };
    } else {
      next[period] = entry;
    }
  }
  return changed ? next : state;
}
