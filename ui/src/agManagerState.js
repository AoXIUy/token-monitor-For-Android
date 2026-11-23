// @ts-check

/** @param {unknown} value @param {number} [limit] */
function cleanText(value, limit = 160) {
  return typeof value === 'string' ? value.replace(/[\r\n\t]+/g, ' ').trim().slice(0, limit) : '';
}

/** @param {unknown} value */
function finiteNum(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

/** @param {unknown} value */
function normalizeTier(value) {
  const upper = cleanText(value, 24).toUpperCase();
  if (upper === 'ULTRA' || upper === 'PRO' || upper === 'FREE') return upper;
  return 'FREE';
}

/** @param {unknown} raw @returns {import('./types/monitor').AgManagerModelQuota | null} */
function sanitizeModel(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const obj = /** @type {Record<string, unknown>} */ (raw);
  const name = cleanText(obj.name, 100);
  if (!name) return null;
  return {
    name,
    displayName: cleanText(obj.displayName, 100) || name,
    percentage: Math.max(0, Math.min(100, Math.round(finiteNum(obj.percentage)))),
    resetTime: cleanText(obj.resetTime, 64),
  };
}

/** @param {unknown} raw @returns {import('./types/monitor').AgManagerAccountSummary | null} */
function sanitizeAccount(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const obj = /** @type {Record<string, unknown>} */ (raw);
  const id = cleanText(obj.id, 128);
  const email = cleanText(obj.email, 160);
  if (!id || !email) return null;
  const rawQuota = obj.quota && typeof obj.quota === 'object' && !Array.isArray(obj.quota)
    ? /** @type {Record<string, unknown>} */ (obj.quota)
    : {};
  const rawModels = Array.isArray(rawQuota.models) ? rawQuota.models : [];
  /** @type {import('./types/monitor').AgManagerModelQuota[]} */
  const models = [];
  for (const entry of rawModels.slice(0, 64)) {
    const model = sanitizeModel(entry);
    if (model) models.push(model);
  }
  return {
    id,
    email,
    name: cleanText(obj.name, 120),
    subscriptionTier: normalizeTier(obj.subscriptionTier),
    disabled: obj.disabled === true,
    disabledReason: cleanText(obj.disabledReason, 240),
    validationBlocked: obj.validationBlocked === true,
    validationMessage: cleanText(obj.validationMessage, 240),
    banned: obj.banned === true,
    hasDeviceProfile: obj.hasDeviceProfile === true,
    quota: {
      isForbidden: rawQuota.isForbidden === true,
      forbiddenReason: cleanText(rawQuota.forbiddenReason, 240),
      lastUpdated: finiteNum(rawQuota.lastUpdatedAt ?? rawQuota.lastUpdated),
      models,
    },
  };
}

/** @param {unknown} raw @returns {import('./types/monitor').AgManagerDeviceSnapshot | null} */
function sanitizeDeviceSnapshot(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const obj = /** @type {Record<string, unknown>} */ (raw);
  const deviceId = cleanText(obj.deviceId, 128);
  if (!deviceId) return null;
  const rawSettings = obj.settings && typeof obj.settings === 'object' && !Array.isArray(obj.settings)
    ? /** @type {Record<string, unknown>} */ (obj.settings)
    : {};
  const rawActive = obj.activeAccounts && typeof obj.activeAccounts === 'object' && !Array.isArray(obj.activeAccounts)
    ? /** @type {Record<string, unknown>} */ (obj.activeAccounts)
    : {};
  const rawAccounts = Array.isArray(obj.accounts) ? obj.accounts : [];
  /** @type {import('./types/monitor').AgManagerAccountSummary[]} */
  const accounts = [];
  const seen = new Set();
  for (const entry of rawAccounts.slice(0, 200)) {
    const acc = sanitizeAccount(entry);
    if (!acc || seen.has(acc.id)) continue;
    seen.add(acc.id);
    accounts.push(acc);
  }
  return {
    version: 1,
    deviceId,
    hostname: cleanText(obj.hostname, 128) || deviceId,
    updatedAt: cleanText(obj.updatedAt, 64),
    settings: {
      startupRefresh: rawSettings.startupRefresh === true,
      autoRefresh: rawSettings.autoRefresh === true,
      refreshIntervalMinutes: Math.max(1, Math.min(1440, Math.round(finiteNum(rawSettings.refreshIntervalMinutes) || 10))),
    },
    activeAccounts: {
      classic: cleanText(rawActive.classic, 160),
      ide: cleanText(rawActive.ide, 160),
      agy: cleanText(rawActive.agy, 160),
      acp: cleanText(rawActive.acp, 160),
    },
    accounts,
  };
}

/** @returns {import('./types/monitor').AgManagerState} */
export function createInitialAgManagerState() {
  return {
    loading: false,
    error: '',
    errorCode: '',
    requestId: '',
    updatedAt: '',
    devices: [],
    selectedDeviceId: '',
    tierFilter: 'all',
    statusFilter: 'all',
    searchQuery: '',
  };
}

/**
 * @param {import('./types/monitor').AgManagerState} previous
 * @param {{ requestId: string }} query
 * @returns {import('./types/monitor').AgManagerState}
 */
export function beginAgManagerQuery(previous, query) {
  return {
    ...previous,
    loading: true,
    error: '',
    errorCode: '',
    requestId: cleanText(query.requestId, 80),
  };
}

/**
 * @param {import('./types/monitor').AgManagerState} previous
 * @param {Record<string, unknown>} message
 * @returns {import('./types/monitor').AgManagerState}
 */
export function receiveAgManagerResult(previous, message) {
  const reqId = cleanText(message.requestId, 80);
  if (reqId && previous.requestId && reqId !== previous.requestId) return previous;
  const rawPayload = message.payload && typeof message.payload === 'object' && !Array.isArray(message.payload)
    ? /** @type {Record<string, unknown>} */ (message.payload)
    : {};
  const rawDevices = Array.isArray(rawPayload.devices) ? rawPayload.devices : [];
  /** @type {import('./types/monitor').AgManagerDeviceSnapshot[]} */
  const devices = [];
  for (const item of rawDevices.slice(0, 32)) {
    const dev = sanitizeDeviceSnapshot(item);
    if (dev) devices.push(dev);
  }
  const hasSelected = devices.some(d => d.deviceId === previous.selectedDeviceId);
  return {
    ...previous,
    loading: false,
    error: '',
    errorCode: '',
    updatedAt: cleanText(rawPayload.updatedAt, 64) || devices[0]?.updatedAt || '',
    devices,
    selectedDeviceId: hasSelected ? previous.selectedDeviceId : (devices[0]?.deviceId || ''),
  };
}

/**
 * @param {import('./types/monitor').AgManagerState} previous
 * @param {Record<string, unknown>} message
 * @returns {import('./types/monitor').AgManagerState}
 */
export function receiveAgManagerError(previous, message) {
  const reqId = cleanText(message.requestId, 80);
  if (reqId && previous.requestId && reqId !== previous.requestId) return previous;
  const code = cleanText(message.code, 40) || 'read_failed';
  const rawMessage = cleanText(message.message, 240);
  return {
    ...previous,
    loading: false,
    errorCode: code,
    error: code === 'unsupported_hub'
      ? 'Hub 版本较旧或未启用 Antigravity 账号池同步'
      : (rawMessage || '读取 Antigravity 账号池失败'),
  };
}

/**
 * @param {import('./types/monitor').AgManagerState} state
 * @param {{ deviceId?: string, tierFilter?: 'all' | 'PRO' | 'ULTRA' | 'FREE', statusFilter?: 'all' | 'available' | 'abnormal', searchQuery?: string }} patch
 * @returns {import('./types/monitor').AgManagerState}
 */
export function setAgManagerFilter(state, patch) {
  return {
    ...state,
    ...(patch.deviceId !== undefined ? { selectedDeviceId: cleanText(patch.deviceId, 128) } : {}),
    ...(patch.tierFilter !== undefined ? { tierFilter: patch.tierFilter } : {}),
    ...(patch.statusFilter !== undefined ? { statusFilter: patch.statusFilter } : {}),
    ...(patch.searchQuery !== undefined ? { searchQuery: cleanText(patch.searchQuery, 100) } : {}),
  };
}

/** @param {import('./types/monitor').AgManagerAccountSummary} acc */
export function isAgAccountAbnormal(acc) {
  return Boolean(acc.disabled || acc.banned || acc.validationBlocked || acc.quota?.isForbidden);
}

/**
 * @param {import('./types/monitor').AgManagerState} state
 */
export function selectVisibleAgManagerAccounts(state) {
  const activeDevice = state.devices.find(d => d.deviceId === state.selectedDeviceId) || state.devices[0] || null;
  const accounts = activeDevice?.accounts || [];
  /** @type {Record<string, string[]>} */
  const activeEmails = {};
  /** @type {Record<string, string[]>} */
  const activeByAccountKey = {};
  if (activeDevice?.activeAccounts) {
    /** @type {Array<[string, string]>} */
    const clientEntries = [
      ['classic', 'Classic'],
      ['ide', 'IDE'],
      ['agy', 'AGY'],
      ['acp', 'ACP'],
    ];
    for (const [key, label] of clientEntries) {
      const target = activeDevice.activeAccounts[/** @type {keyof typeof activeDevice.activeAccounts} */ (key)];
      if (target) {
        const lower = target.toLowerCase();
        if (!activeEmails[lower]) activeEmails[lower] = [];
        activeEmails[lower].push(label);
        for (const acc of accounts) {
          if (acc.id === target || acc.email.toLowerCase() === lower) {
            if (!activeByAccountKey[acc.id]) activeByAccountKey[acc.id] = [];
            if (!activeByAccountKey[acc.id].includes(label)) activeByAccountKey[acc.id].push(label);
          }
        }
      }
    }
  }
  const counts = {
    total: accounts.length,
    available: accounts.filter(acc => !isAgAccountAbnormal(acc)).length,
    abnormal: accounts.filter(isAgAccountAbnormal).length,
  };
  const q = state.searchQuery.trim().toLowerCase();
  const visibleAccounts = accounts.filter((acc) => {
    if (state.statusFilter === 'available' && isAgAccountAbnormal(acc)) return false;
    if (state.statusFilter === 'abnormal' && !isAgAccountAbnormal(acc)) return false;
    if (state.tierFilter !== 'all' && acc.subscriptionTier !== state.tierFilter) return false;
    if (q) {
      const hay = `${acc.email} ${acc.name} ${(acc.quota?.models || []).map(m => `${m.name} ${m.displayName}`).join(' ')}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
  return { activeDevice, visibleAccounts, counts, activeEmails, activeByAccountKey };
}
