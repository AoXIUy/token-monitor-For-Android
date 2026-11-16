// @ts-check

const VALID_GRANULARITIES = ['daily', 'weekly', 'monthly'];

/** @param {unknown} value @returns {import('./types/monitor').ReportGranularity} */
export function normalizeGranularity(value) {
  return typeof value === 'string' && VALID_GRANULARITIES.includes(value)
    ? /** @type {import('./types/monitor').ReportGranularity} */ (value)
    : 'daily';
}

/** @param {unknown} value @param {number} [limit] */
function cleanText(value, limit = 200) {
  return typeof value === 'string' ? value.slice(0, limit) : '';
}

/** @param {unknown} value */
function finiteNum(value, fallback = 0) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** @param {unknown} value @returns {number | null} */
function nullableNum(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/** @returns {import('./types/monitor').ReportsState} */
export function createInitialReportsState() {
  return {
    granularity: 'daily',
    periodKey: 'current',
    listLoading: false,
    listError: '',
    listRequestId: '',
    config: null,
    items: [],
    detailLoading: false,
    detailError: '',
    detailRequestId: '',
    report: null,
    markdown: '',
  };
}

/**
 * @param {import('./types/monitor').ReportsState} previous
 * @param {{ granularity?: string, requestId: string }} query
 * @returns {import('./types/monitor').ReportsState}
 */
export function beginReportsList(previous, query) {
  return {
    ...previous,
    listLoading: true,
    listError: '',
    listRequestId: cleanText(query.requestId, 80),
  };
}

/**
 * @param {import('./types/monitor').ReportsState} previous
 * @param {{ granularity: string, periodKey?: string, requestId: string }} query
 * @returns {import('./types/monitor').ReportsState}
 */
export function beginReportDetail(previous, query) {
  const granularity = normalizeGranularity(query.granularity);
  const periodKey = cleanText(query.periodKey, 32) || 'current';
  const sameTarget = previous.granularity === granularity && previous.periodKey === periodKey;
  return {
    ...previous,
    granularity,
    periodKey,
    detailLoading: true,
    detailError: '',
    detailRequestId: cleanText(query.requestId, 80),
    report: sameTarget ? previous.report : null,
    markdown: sameTarget ? previous.markdown : '',
  };
}

/** @param {unknown} raw @returns {import('./types/monitor').HubReportConfig | null} */
function sanitizeConfig(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const obj = /** @type {Record<string, unknown>} */ (raw);
  return {
    enabled: obj.enabled === true,
    daily: obj.daily !== false,
    weekly: obj.weekly !== false,
    monthly: obj.monthly !== false,
  };
}

/** @param {unknown} raw @returns {import('./types/monitor').ReportListItem[]} */
function sanitizeReportItems(raw) {
  if (!Array.isArray(raw)) return [];
  /** @type {import('./types/monitor').ReportListItem[]} */
  const items = [];
  const seen = new Set();
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue;
    const item = /** @type {Record<string, unknown>} */ (entry);
    const granularity = cleanText(item.granularity, 16);
    if (!VALID_GRANULARITIES.includes(granularity)) continue;
    const periodKey = cleanText(item.periodKey, 32);
    if (!periodKey) continue;
    const reportId = cleanText(item.reportId, 64) || `${granularity}:${periodKey}`;
    if (seen.has(reportId)) continue;
    seen.add(reportId);
    items.push({
      reportId,
      granularity: /** @type {import('./types/monitor').ReportGranularity} */ (granularity),
      periodKey,
      label: cleanText(item.label, 120) || periodKey,
      startDate: cleanText(item.startDate, 16),
      endDate: cleanText(item.endDate, 16),
      generatedAt: cleanText(item.generatedAt, 48),
      totalTokens: Math.max(0, finiteNum(item.totalTokens)),
      knownCostUsd: Math.max(0, finiteNum(item.knownCostUsd)),
      projectCount: Math.max(0, Math.floor(finiteNum(item.projectCount))),
    });
    if (items.length >= 120) break;
  }
  return items;
}

/** @param {unknown} raw @returns {import('./types/monitor').UsageReportData | null} */
export function sanitizeUsageReport(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const src = /** @type {Record<string, any>} */ (raw);
  const granularity = cleanText(src.granularity, 16);
  if (!VALID_GRANULARITIES.includes(granularity)) return null;
  const periodObj = src.period && typeof src.period === 'object' ? src.period : {};
  const summaryObj = src.summary && typeof src.summary === 'object' ? src.summary : {};
  const hubObj = src.hub && typeof src.hub === 'object' ? src.hub : {};
  const coverageObj = src.coverage && typeof src.coverage === 'object' ? src.coverage : {};
  const throughputObj = summaryObj.throughput && typeof summaryObj.throughput === 'object' ? summaryObj.throughput : {};
  const comparisonObj = summaryObj.comparison && typeof summaryObj.comparison === 'object' ? summaryObj.comparison : null;
  const peakObj = summaryObj.peakDay && typeof summaryObj.peakDay === 'object' ? summaryObj.peakDay : null;

  /** @param {unknown} list @param {number} max */
  const boundedArray = (list, max = 100) => (Array.isArray(list) ? list.slice(0, max) : []);

  return {
    schemaVersion: Math.max(1, Math.floor(finiteNum(src.schemaVersion, 1))),
    schema: cleanText(src.schema, 64) || 'token-monitor-report/v1',
    reportId: cleanText(src.reportId, 64) || `${granularity}:${cleanText(periodObj.key, 32)}`,
    granularity: /** @type {import('./types/monitor').ReportGranularity} */ (granularity),
    period: {
      key: cleanText(periodObj.key, 32),
      label: cleanText(periodObj.label, 120),
      startDate: cleanText(periodObj.startDate, 16),
      endDate: cleanText(periodObj.endDate, 16),
      timeZone: cleanText(periodObj.timeZone, 64),
      isCurrent: periodObj.isCurrent === true,
      generatedAt: cleanText(periodObj.generatedAt, 48),
      previousPeriodKey: cleanText(periodObj.previousPeriodKey, 32) || undefined,
    },
    hub: {
      runtime: cleanText(hubObj.runtime, 32),
      deviceCount: Math.max(0, Math.floor(finiteNum(hubObj.deviceCount))),
      activeDeviceCount: Math.max(0, Math.floor(finiteNum(hubObj.activeDeviceCount))),
      staleDeviceCount: Math.max(0, Math.floor(finiteNum(hubObj.staleDeviceCount))),
    },
    coverage: {
      tokenComponentsComplete: coverageObj.tokenComponentsComplete === true,
      projectsComplete: coverageObj.projectsComplete === true,
      projectAttributionSource: cleanText(coverageObj.projectAttributionSource, 32) || 'none',
      historyComplete: coverageObj.historyComplete === true,
    },
    summary: {
      totalTokens: Math.max(0, finiteNum(summaryObj.totalTokens)),
      knownCostUsd: Math.max(0, finiteNum(summaryObj.knownCostUsd)),
      unpricedTokens: Math.max(0, finiteNum(summaryObj.unpricedTokens)),
      inputTokens: Math.max(0, finiteNum(summaryObj.inputTokens)),
      outputTokens: Math.max(0, finiteNum(summaryObj.outputTokens)),
      cacheReadTokens: Math.max(0, finiteNum(summaryObj.cacheReadTokens)),
      cacheWriteTokens: Math.max(0, finiteNum(summaryObj.cacheWriteTokens)),
      unclassifiedTokens: Math.max(0, finiteNum(summaryObj.unclassifiedTokens)),
      cacheHitRatePct: nullableNum(summaryObj.cacheHitRatePct),
      messageCount: Math.max(0, Math.floor(finiteNum(summaryObj.messageCount))),
      sessionCount: Math.max(0, Math.floor(finiteNum(summaryObj.sessionCount))),
      projectCount: Math.max(0, Math.floor(finiteNum(summaryObj.projectCount))),
      activeDays: Math.max(0, Math.floor(finiteNum(summaryObj.activeDays))),
      activeTimeMs: Math.max(0, finiteNum(summaryObj.activeTimeMs)),
      peakDay: peakObj ? {
        date: cleanText(peakObj.date, 16),
        tokens: Math.max(0, finiteNum(peakObj.tokens)),
        costUsd: Math.max(0, finiteNum(peakObj.costUsd)),
      } : null,
      throughput: {
        timedTokens: Math.max(0, finiteNum(throughputObj.timedTokens)),
        timedOutputTokens: Math.max(0, finiteNum(throughputObj.timedOutputTokens)),
        timedDurationMs: Math.max(0, finiteNum(throughputObj.timedDurationMs)),
        avgOutputTokensPerSec: nullableNum(throughputObj.avgOutputTokensPerSec),
      },
      comparison: comparisonObj ? {
        previousPeriodKey: cleanText(comparisonObj.previousPeriodKey, 32),
        previousTokens: Math.max(0, finiteNum(comparisonObj.previousTokens)),
        previousCostUsd: Math.max(0, finiteNum(comparisonObj.previousCostUsd)),
        tokenDelta: finiteNum(comparisonObj.tokenDelta),
        tokenDeltaPct: nullableNum(comparisonObj.tokenDeltaPct),
        costDelta: finiteNum(comparisonObj.costDelta),
        costDeltaPct: nullableNum(comparisonObj.costDeltaPct),
      } : null,
    },
    projects: boundedArray(src.projects, 100).map((entry) => ({
      key: cleanText(entry?.key, 120),
      label: cleanText(entry?.label, 120) || cleanText(entry?.key, 120),
      tokens: Math.max(0, finiteNum(entry?.tokens)),
      costUsd: Math.max(0, finiteNum(entry?.costUsd)),
      unpricedTokens: Math.max(0, finiteNum(entry?.unpricedTokens)),
      tokenSharePct: Math.max(0, finiteNum(entry?.tokenSharePct)),
      costSharePct: Math.max(0, finiteNum(entry?.costSharePct)),
      sessionCount: Math.max(0, Math.floor(finiteNum(entry?.sessionCount))),
      clients: boundedArray(entry?.clients, 20).map((c) => ({
        client: cleanText(c?.client, 48),
        tokens: Math.max(0, finiteNum(c?.tokens)),
        sharePct: Math.max(0, finiteNum(c?.sharePct)),
      })),
      models: boundedArray(entry?.models, 20).map((m) => ({
        model: cleanText(m?.model, 120),
        tokens: Math.max(0, finiteNum(m?.tokens)),
        sharePct: Math.max(0, finiteNum(m?.sharePct)),
      })),
    })),
    clients: boundedArray(src.clients, 50).map((entry) => ({
      client: cleanText(entry?.client, 48),
      tokens: Math.max(0, finiteNum(entry?.tokens)),
      costUsd: Math.max(0, finiteNum(entry?.costUsd)),
      unpricedTokens: Math.max(0, finiteNum(entry?.unpricedTokens)),
      tokenSharePct: Math.max(0, finiteNum(entry?.tokenSharePct)),
      costSharePct: Math.max(0, finiteNum(entry?.costSharePct)),
      cacheReadTokens: Math.max(0, finiteNum(entry?.cacheReadTokens)),
      cacheWriteTokens: Math.max(0, finiteNum(entry?.cacheWriteTokens)),
      outputTokens: Math.max(0, finiteNum(entry?.outputTokens)),
      inputTokens: Math.max(0, finiteNum(entry?.inputTokens)),
      unclassifiedTokens: Math.max(0, finiteNum(entry?.unclassifiedTokens)),
      cacheHitRatePct: nullableNum(entry?.cacheHitRatePct),
      messageCount: Math.max(0, Math.floor(finiteNum(entry?.messageCount))),
    })),
    models: boundedArray(src.models, 100).map((entry) => ({
      model: cleanText(entry?.model, 120),
      tokens: Math.max(0, finiteNum(entry?.tokens)),
      costUsd: Math.max(0, finiteNum(entry?.costUsd)),
      unpricedTokens: Math.max(0, finiteNum(entry?.unpricedTokens)),
      tokenSharePct: Math.max(0, finiteNum(entry?.tokenSharePct)),
      costSharePct: Math.max(0, finiteNum(entry?.costSharePct)),
      cacheReadTokens: Math.max(0, finiteNum(entry?.cacheReadTokens)),
      cacheWriteTokens: Math.max(0, finiteNum(entry?.cacheWriteTokens)),
      outputTokens: Math.max(0, finiteNum(entry?.outputTokens)),
      inputTokens: Math.max(0, finiteNum(entry?.inputTokens)),
      unclassifiedTokens: Math.max(0, finiteNum(entry?.unclassifiedTokens)),
      cacheHitRatePct: nullableNum(entry?.cacheHitRatePct),
      avgOutputTokensPerSec: nullableNum(entry?.avgOutputTokensPerSec),
    })),
    devices: boundedArray(src.devices, 50).map((entry) => ({
      deviceId: cleanText(entry?.deviceId, 128),
      hostname: cleanText(entry?.hostname, 128),
      platform: cleanText(entry?.platform, 64),
      stale: entry?.stale === true,
      tokens: Math.max(0, finiteNum(entry?.tokens)),
      costUsd: Math.max(0, finiteNum(entry?.costUsd)),
      tokenSharePct: Math.max(0, finiteNum(entry?.tokenSharePct)),
      projectCount: Math.max(0, Math.floor(finiteNum(entry?.projectCount))),
    })),
    timeline: boundedArray(src.timeline, 40).map((entry) => ({
      date: cleanText(entry?.date, 16),
      tokens: Math.max(0, finiteNum(entry?.tokens)),
      costUsd: Math.max(0, finiteNum(entry?.costUsd)),
      activeTimeMs: Math.max(0, finiteNum(entry?.activeTimeMs)),
      topClient: cleanText(entry?.topClient, 48),
      topModel: cleanText(entry?.topModel, 120),
    })),
    signals: boundedArray(src.signals, 30).map((entry) => ({
      code: cleanText(entry?.code, 64),
      severity: cleanText(entry?.severity, 16) || 'info',
      project: cleanText(entry?.project, 120) || undefined,
      model: cleanText(entry?.model, 120) || undefined,
      valuePct: nullableNum(entry?.valuePct) ?? undefined,
      summary: cleanText(entry?.summary, 400),
    })).filter((s) => Boolean(s.summary)),
  };
}

/**
 * @param {import('./types/monitor').ReportsState} current
 * @param {Record<string, unknown>} message
 * @returns {import('./types/monitor').ReportsState}
 */
export function receiveReportsList(current, message) {
  if (!current.listLoading || (current.listRequestId && message.requestId !== current.listRequestId)) {
    return current;
  }
  if (typeof message.error === 'string' && message.error) {
    return { ...current, listLoading: false, listError: cleanText(message.error, 80) };
  }
  const data = /** @type {Record<string, unknown> | undefined} */ (
    message.data && typeof message.data === 'object' && !Array.isArray(message.data) ? message.data : undefined
  );
  if (!data || data.ok === false) {
    return { ...current, listLoading: false, listError: cleanText(data?.error, 80) || 'invalid_response' };
  }
  return {
    ...current,
    listLoading: false,
    listError: '',
    config: sanitizeConfig(data.config) ?? current.config,
    items: sanitizeReportItems(data.reports),
  };
}

/**
 * @param {import('./types/monitor').ReportsState} current
 * @param {Record<string, unknown>} message
 * @returns {import('./types/monitor').ReportsState}
 */
export function receiveReportDetail(current, message) {
  if (!current.detailLoading || (current.detailRequestId && message.requestId !== current.detailRequestId)) {
    return current;
  }
  if (typeof message.error === 'string' && message.error) {
    return { ...current, detailLoading: false, detailError: cleanText(message.error, 80) };
  }
  const data = /** @type {Record<string, unknown> | undefined} */ (
    message.data && typeof message.data === 'object' && !Array.isArray(message.data) ? message.data : undefined
  );
  if (!data || data.ok === false) {
    return { ...current, detailLoading: false, detailError: cleanText(data?.error, 80) || 'invalid_response' };
  }
  const report = sanitizeUsageReport(data.report);
  if (!report) {
    return { ...current, detailLoading: false, detailError: 'invalid_response' };
  }
  const markdown = cleanText(data.markdown, 512 * 1024);
  return {
    ...current,
    detailLoading: false,
    detailError: '',
    report,
    markdown,
  };
}

/** @param {string} error */
export function reportErrorLabel(error) {
  /** @type {Record<string, string>} */
  const labels = {
    unsupported_hub: '当前连接的 Hub 尚未支持分析报告接口，请升级电脑端 Node Hub / 桌面端。',
    unauthorized: 'Hub 认证失败，请检查连接设置中的 shared secret。',
    not_found: '该周期暂无已生成的报告；请在主 Hub 开启自动生成，或切换查看「当期实时」报告。',
    invalid_request: '报告参数无效。',
    read_failed: '报告读取失败，请检查网络连接后重试。',
    preview_unavailable: '浏览器预览模式使用内置演示报告数据。',
  };
  return labels[error] || '报告读取失败，请稍后重试。';
}
