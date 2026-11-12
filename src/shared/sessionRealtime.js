'use strict';

(function expose(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.TokenMonitorSessionRealtime = api;
})(typeof window !== 'undefined' ? window : null, function createApi() {
  const HISTORY_MS = 300000;
  const LIVE_MS = 15000;
  const MAX_GAP_MS = 30000;
  const MAX_POINTS = 360;
  const timestamp = value => typeof value === 'string' ? Date.parse(value) : NaN;
  const counter = value => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;

  // Only source-device snapshots are eligible. Aggregate/paint/fetch timestamps
  // cannot establish when a session counter was actually measured.
  function sessionSources(stats, query, clock = Date.now()) {
    const target = typeof query === 'string' ? { key: query } : query;
    if (!target) return [];
    const result = [];
    for (const device of Array.isArray(stats?.devices) ? stats.devices : []) {
      if (!device || typeof device.deviceId !== 'string' || !device.deviceId) continue;
      for (const period of ['today', 'month']) {
        const snapshot = device.periods?.[period];
        const sessions = snapshot?.sessions;
        if (!sessions || typeof sessions !== 'object' || Array.isArray(sessions)) continue;
        const endsAt = device.periodWindows?.[period]?.endsAt;
        if (endsAt && !(timestamp(endsAt) > clock)) continue;
        let key = target.key || (target.client && target.sessionId ? `${target.client}:${target.sessionId}` : '');
        if (!key || !Object.hasOwn(sessions, key)) {
          const matches = Object.entries(sessions).filter(([, row]) => row && row.client === target.client
            && (row.sessionId === target.sessionId || row.nativeSessionId === target.sessionId));
          if (matches.length !== 1) continue;
          key = matches[0][0];
        }
        const row = sessions[key];
        if (!row || !['antigravity', 'codex'].includes(row.client)) continue;
        const at = timestamp(device.updatedAt);
        const received = timestamp(device.receivedAt || device.updatedAt);
        const boundary = device.periodWindows?.[period]?.key || endsAt
          || (typeof device.updatedAt === 'string' ? device.updatedAt.slice(0, period === 'today' ? 10 : 7) : '');
        const available = device.stale !== true && snapshot.capabilities?.tokenComponents !== false
          && counter(row.outputTokens) && Number.isFinite(at) && Number.isFinite(received)
          && at <= clock && received <= clock && clock - at <= MAX_GAP_MS && clock - received <= MAX_GAP_MS;
        result.push({ deviceId: device.deviceId, hostname: device.hostname || device.deviceId,
          identity: JSON.stringify([device.deviceId, key, period, boundary]),
          key, at, outputTokens: row.outputTokens, available });
        break;
      }
    }
    return result;
  }

  function createTracker() {
    let identity = '', baseline = null, latest = null, points = [], reason = 'waiting';
    function reset() { identity = ''; baseline = null; latest = null; points = []; reason = 'waiting'; }
    function read(clock = Date.now()) {
      points = points.filter(point => point.end > clock - HISTORY_MS && point.end <= clock).slice(-MAX_POINTS);
      const fresh = latest && clock >= latest.end && clock - latest.end < LIVE_MS;
      return { state: fresh ? latest.rate > 0 ? 'live' : 'idle' : reason === 'unavailable' ? 'unavailable' : latest ? 'stale' : 'waiting',
        tokensPerSecond: fresh ? latest.rate : null,
        // Same measured interval, expressed in minutes; not total-token burn.
        tokensPerMinute: fresh ? latest.rate * 60 : null,
        sampledAt: fresh ? latest.end : null, intervalMs: fresh ? latest.end - latest.start : null,
        points: points.map(point => ({ ...point })) };
    }
    function observe(sample, clock = Date.now()) {
      if (!sample) { baseline = null; latest = null; reason = 'unavailable'; return read(clock); }
      if (identity !== sample.identity) { reset(); identity = sample.identity; }
      if (!sample.available || !counter(sample.outputTokens) || !Number.isFinite(sample.at)
        || sample.at > clock || clock - sample.at > MAX_GAP_MS) {
        baseline = null; latest = null; reason = 'unavailable'; return read(clock);
      }
      reason = 'waiting';
      if (!baseline) { baseline = { ...sample }; return read(clock); }
      // Progressive collector frames can precede a final accounting snapshot
      // whose timestamp was captured at tick start. Late frames cannot erase
      // a newer measurement or create another interval.
      if (sample.at < baseline.at) return read(clock);
      if (sample.at === baseline.at && sample.outputTokens === baseline.outputTokens) return read(clock);
      const elapsed = sample.at - baseline.at;
      const added = sample.outputTokens - baseline.outputTokens;
      if (elapsed <= 0 || added < 0) {
        points = []; latest = null; baseline = { ...sample }; return read(clock);
      }
      if (elapsed > MAX_GAP_MS) { latest = null; baseline = { ...sample }; return read(clock); }
      latest = { start: baseline.at, end: sample.at, tokens: added, rate: added * 1000 / elapsed };
      baseline = { ...sample };
      points.push(latest);
      return read(clock);
    }
    return { observe, read, reset };
  }

  // Fixed wall-time axis and step intervals. Missing observations stay gaps;
  // neither a smoothed curve nor an idle timer fabricates token production.
  function chart(points, clock, width = 280, height = 76) {
    const visible = points.filter(point => point.end > clock - HISTORY_MS && point.end <= clock);
    const peak = Math.max(0, ...visible.map(point => point.rate));
    const x = at => Math.max(0, Math.min(width, (at - clock + HISTORY_MS) / HISTORY_MS * width));
    const y = rate => height - 4 - rate / Math.max(1, peak) * (height - 8);
    const segments = [];
    let prior = null;
    for (const point of visible) {
      const start = `${x(point.start).toFixed(2)},${y(point.rate).toFixed(2)}`;
      const end = `${x(point.end).toFixed(2)},${y(point.rate).toFixed(2)}`;
      if (prior && prior.end === point.start) segments[segments.length - 1] += ` ${start} ${end}`;
      else segments.push(`${start} ${end}`);
      prior = point;
    }
    return { segments, peak };
  }
  return { HISTORY_MS, LIVE_MS, MAX_GAP_MS, sessionSources, createTracker, chart };
});
