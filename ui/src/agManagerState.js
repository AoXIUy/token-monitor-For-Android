// @ts-check

const MAX_GROUPS_PER_ACCOUNT = 16;
const MAX_BUCKETS_PER_GROUP = 8;

/** @type {Record<string, string>} */
const AG_SLOT_LABELS = {
  classic: '经典款',
  ide: 'IDE',
  agy: 'AGY',
  acp: 'ACP',
};

const GENERIC_CAPABILITY_WORDS = new Set([
  'pro', 'flash', 'lite', 'ultra', 'high', 'medium', 'low', 'xhigh',
  'image', 'exp', 'preview', 'disabled', 'thinking', 'tiered', 'models',
  'model', 'wtu', 'weekly', '5h', '7d', 'hour', 'quota', 'pool', 'default', 'standard',
]);

/** @param {unknown} value @param {number} [limit] */
function cleanText(value, limit = 160) {
  return typeof value === 'string' ? value.replace(/[\r\n\t]+/g, ' ').trim().slice(0, limit) : '';
}

/** @param {unknown} value */
function finiteNum(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

/** @param {unknown} value */
function nonNegativeFiniteNum(value) {
  const n = typeof value === 'number'
    ? value
    : (typeof value === 'string' && value.trim() !== '' ? Number(value) : NaN);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

/** @param {unknown} value */
function normalizeTier(value) {
  const upper = cleanText(value, 24).toUpperCase();
  if (upper === 'ULTRA' || upper === 'PRO' || upper === 'FREE') return upper;
  if (upper.includes('ULTRA')) return 'ULTRA';
  if (upper.includes('PRO')) return 'PRO';
  return 'FREE';
}

/** @param {unknown} raw @returns {import('./types/monitor').AgManagerQuotaBucket | null} */
function sanitizeQuotaBucket(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const obj = /** @type {Record<string, unknown>} */ (raw);
  const rawFraction = obj.remainingFraction ?? obj.remaining_fraction;
  if (rawFraction === undefined || rawFraction === null || rawFraction === '') return null;
  const fractionNum = Number(rawFraction);
  if (!Number.isFinite(fractionNum)) return null;
  return {
    bucketId: cleanText(obj.bucketId ?? obj.bucket_id, 128),
    window: cleanText(obj.window, 32),
    remainingFraction: Math.max(0, Math.min(1, fractionNum)),
    resetTime: cleanText(obj.resetTime ?? obj.reset_time, 64),
    displayName: cleanText(obj.displayName ?? obj.display_name, 128),
  };
}

/** @param {unknown} raw @returns {import('./types/monitor').AgManagerQuotaGroup | null} */
function sanitizeQuotaGroup(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const obj = /** @type {Record<string, unknown>} */ (raw);
  const displayName = cleanText(obj.displayName ?? obj.display_name, 128);
  if (!displayName) return null;
  const rawBuckets = Array.isArray(obj.buckets) ? obj.buckets : [];
  /** @type {import('./types/monitor').AgManagerQuotaBucket[]} */
  const buckets = [];
  for (const entry of rawBuckets.slice(0, MAX_BUCKETS_PER_GROUP)) {
    const bucket = sanitizeQuotaBucket(entry);
    if (bucket) buckets.push(bucket);
  }
  return {
    displayName,
    description: cleanText(obj.description, 256),
    buckets,
  };
}

/** @param {unknown} raw @returns {import('./types/monitor').AgManagerModelQuota | null} */
function sanitizeModel(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const obj = /** @type {Record<string, unknown>} */ (raw);
  const name = cleanText(obj.name, 100);
  if (!name) return null;
  return {
    name,
    displayName: cleanText(obj.displayName ?? obj.display_name, 100) || name,
    percentage: Math.max(0, Math.min(100, Math.round(finiteNum(obj.percentage)))),
    resetTime: cleanText(obj.resetTime ?? obj.reset_time, 64),
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
  const rawGroups = Array.isArray(rawQuota.groups) ? rawQuota.groups : [];
  /** @type {import('./types/monitor').AgManagerQuotaGroup[]} */
  const groups = [];
  for (const entry of rawGroups.slice(0, MAX_GROUPS_PER_ACCOUNT)) {
    const group = sanitizeQuotaGroup(entry);
    if (group) groups.push(group);
  }
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
    subscriptionTier: normalizeTier(obj.subscriptionTier ?? rawQuota.subscriptionTier ?? rawQuota.subscription_tier),
    disabled: obj.disabled === true,
    disabledReason: cleanText(obj.disabledReason, 240),
    validationBlocked: obj.validationBlocked === true,
    validationMessage: cleanText(obj.validationMessage, 240),
    banned: obj.banned === true,
    hasDeviceProfile: obj.hasDeviceProfile === true,
    lastUsedAt: nonNegativeFiniteNum(obj.lastUsedAt),
    quota: {
      isForbidden: rawQuota.isForbidden === true || rawQuota.is_forbidden === true,
      forbiddenReason: cleanText(rawQuota.forbiddenReason ?? rawQuota.forbidden_reason, 240),
      lastUpdated: nonNegativeFiniteNum(rawQuota.lastUpdatedAt ?? rawQuota.lastUpdated ?? rawQuota.last_updated),
      groups,
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
      const hay = `${acc.email} ${acc.name} ${(acc.quota?.models || []).map(m => `${m.name} ${m.displayName}`).join(' ')} ${(acc.quota?.groups || []).map(g => g.displayName).join(' ')}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
  return { activeDevice, visibleAccounts, counts, activeEmails, activeByAccountKey };
}

/**
 * Map a client slot name (e.g. 'classic', 'ide', 'agy', 'acp') to a compact UI label.
 *
 * @param {unknown} slot
 * @returns {string}
 */
export function formatAgSlotLabel(slot) {
  const text = cleanText(slot, 32);
  if (!text) return '';
  return AG_SLOT_LABELS[text.toLowerCase()] || text.toUpperCase();
}

/**
 * Normalize a timestamp in seconds, milliseconds, or ISO date string into 'YYYY/MM/DD HH:mm'.
 * Returns an empty string when invalid or <= 0.
 *
 * @param {unknown} rawTs
 * @returns {string}
 */
export function formatAgCompactTimestamp(rawTs) {
  let ms = NaN;
  if (typeof rawTs === 'number') {
    if (Number.isFinite(rawTs) && rawTs > 0) {
      ms = rawTs < 1e12 ? rawTs * 1000 : rawTs;
    }
  } else if (typeof rawTs === 'string') {
    const trimmed = rawTs.trim();
    if (trimmed) {
      const numeric = Number(trimmed);
      if (Number.isFinite(numeric) && numeric > 0) {
        ms = numeric < 1e12 ? numeric * 1000 : numeric;
      } else {
        const parsed = Date.parse(trimmed);
        if (Number.isFinite(parsed) && parsed > 0) {
          ms = parsed;
        }
      }
    }
  }
  if (!Number.isFinite(ms) || ms <= 0) return '';
  const date = new Date(ms);
  if (Number.isNaN(date.getTime())) return '';
  /** @param {number} n */
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}/${pad(date.getMonth() + 1)}/${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/**
 * Infer up to 3 capability pills from an account's quota models
 * (Gemini 4+ codename, Claude version/family, GPT variant).
 *
 * @param {import('./types/monitor').AgManagerAccountSummary | null | undefined} account
 * @returns {import('./types/monitor').AgManagerCapabilityPill[]}
 */
export function inferAgCapabilityPills(account) {
  const models = Array.isArray(account?.quota?.models) ? account.quota.models : [];
  if (models.length === 0) return [];
  /** @type {import('./types/monitor').AgManagerCapabilityPill[]} */
  const pills = [];

  let g4Code = '';
  let claudeLabel = '';
  let gptLabel = '';

  for (const model of models) {
    const rawName = String(model?.name || '').trim().toLowerCase();
    if (!rawName) continue;

    if (!g4Code) {
      if (rawName.includes('argon') || rawName.includes('orchestrator-g1-pro')) {
        g4Code = 'Argon';
      } else if (rawName.startsWith('gemini-')) {
        const match = rawName.match(/^gemini-(\d+)(?:\.\d+)?-([a-z]+)/);
        if (match) {
          const major = Number.parseInt(match[1], 10);
          const candidate = match[2];
          if (major >= 4 && candidate && !GENERIC_CAPABILITY_WORDS.has(candidate)) {
            g4Code = candidate.charAt(0).toUpperCase() + candidate.slice(1);
          }
        }
      }
    }

    if (!claudeLabel && rawName.startsWith('claude')) {
      const verMatch = rawName.match(/claude-(?:sonnet|opus|haiku)?-?(\d+)(?:[-.](\d+))?/);
      if (verMatch) {
        claudeLabel = verMatch[2] ? `Claude ${verMatch[1]}.${verMatch[2]}` : `Claude ${verMatch[1]}`;
      } else {
        claudeLabel = 'Claude';
      }
    }

    if (!gptLabel && rawName.startsWith('gpt')) {
      const sizeMatch = rawName.match(/(\d+[abkm])\b/i);
      gptLabel = sizeMatch ? `GPT-${sizeMatch[1].toUpperCase()}` : 'GPT';
    }
  }

  if (g4Code) pills.push({ label: g4Code, tone: 'violet' });
  if (claudeLabel) pills.push({ label: claudeLabel, tone: 'amber' });
  if (gptLabel) pills.push({ label: gptLabel, tone: 'emerald' });
  return pills.slice(0, 3);
}

/**
 * @param {string} resetIso
 * @param {number} nowMs
 * @returns {string}
 */
function formatAgResetCountdown(resetIso, nowMs) {
  if (!resetIso) return '—';
  const targetMs = Date.parse(resetIso);
  if (!Number.isFinite(targetMs)) return '—';
  const diffSec = Math.max(0, Math.floor((targetMs - nowMs) / 1000));
  if (diffSec === 0) return '已就绪';
  const days = Math.floor(diffSec / 86400);
  const hours = Math.floor((diffSec % 86400) / 3600);
  const mins = Math.floor((diffSec % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${Math.max(1, mins)}m`;
}

/** @param {import('./types/monitor').AgManagerQuotaBucket} bucket */
function is5hBucket(bucket) {
  const text = `${bucket?.window || ''} ${bucket?.bucketId || ''}`.toLowerCase();
  return text.includes('5h') || text.includes('hour');
}

/** @param {import('./types/monitor').AgManagerQuotaBucket} bucket */
function isWeeklyBucket(bucket) {
  const text = `${bucket?.window || ''} ${bucket?.bucketId || ''}`.toLowerCase();
  return text.includes('week') || text.includes('7d');
}

/** @param {import('./types/monitor').AgManagerQuotaGroup} group */
function isClaudeOr3pGroup(group) {
  const text = `${group?.displayName || ''} ${(group?.buckets || []).map((b) => `${b.bucketId || ''} ${b.displayName || ''}`).join(' ')}`.toLowerCase();
  return text.includes('claude') || text.includes('gpt') || text.includes('3p');
}

/** @param {import('./types/monitor').AgManagerQuotaGroup} group */
function isDedicatedCodenameGroup(group) {
  const text = `${group?.displayName || ''} ${(group?.buckets || []).map((b) => `${b.bucketId || ''} ${b.displayName || ''}`).join(' ')}`.toLowerCase();
  return /\b(argon|hydrogen|carbon|helium|wtu)\b/.test(text);
}

/**
 * @param {import('./types/monitor').AgManagerQuotaGroup} group
 * @returns {'gemini' | 'claude' | 'other'}
 */
function classifyGroupFamily(group) {
  if (isClaudeOr3pGroup(group)) return 'claude';
  const text = `${group?.displayName || ''} ${(group?.buckets || []).map((b) => `${b.bucketId || ''} ${b.displayName || ''}`).join(' ')}`.toLowerCase();
  if (text.includes('gemini') || isDedicatedCodenameGroup(group)) return 'gemini';
  return 'other';
}

/**
 * @param {import('./types/monitor').AgManagerModelQuota} model
 * @returns {'gemini' | 'claude' | 'other'}
 */
function classifyModelFamily(model) {
  const text = `${model?.name || ''} ${model?.displayName || ''}`.toLowerCase();
  if (/claude|gpt/.test(text)) return 'claude';
  if (/gemini|argon|hydrogen|carbon|helium/.test(text)) return 'gemini';
  return 'other';
}

/** @param {number} pct */
function clampPct(pct) {
  const n = Number(pct);
  return Number.isFinite(n) ? Math.max(0, Math.min(100, Math.round(n))) : 0;
}

/**
 * Build compact quota cells for a 2-column mobile meter grid.
 * Prefers structured `quota.groups` (pairing [Gemini 5h | Claude/GPT 5h],
 * [Gemini Weekly | Claude/GPT Weekly], plus full-width extra/dedicated groups)
 * and gracefully falls back to summarized `quota.models` cells when groups are absent.
 *
 * @param {import('./types/monitor').AgManagerAccountSummary | null | undefined} account
 * @param {number} [nowMs]
 * @returns {import('./types/monitor').AgManagerQuotaCell[]}
 */
export function buildAgQuotaCells(account, nowMs = Date.now()) {
  const groups = Array.isArray(account?.quota?.groups) ? account.quota.groups : [];
  const models = Array.isArray(account?.quota?.models) ? account.quota.models : [];

  if (groups.length > 0) {
    const claudeGroup = groups.find((g) => isClaudeOr3pGroup(g)) || null;
    const nonClaude = groups.filter((g) => g !== claudeGroup);
    const geminiGroup = nonClaude.find((g) => !isDedicatedCodenameGroup(g) && !isClaudeOr3pGroup(g) && String(g.displayName || '').toLowerCase().includes('gemini'))
      || nonClaude.find((g) => !isDedicatedCodenameGroup(g) && !isClaudeOr3pGroup(g))
      || null;
    const extraGroups = nonClaude.filter((g) => g !== geminiGroup);

    /** @param {import('./types/monitor').AgManagerQuotaGroup | null} group */
    const splitBuckets = (group) => {
      const buckets = Array.isArray(group?.buckets) ? group.buckets : [];
      const b5h = buckets.find((b) => is5hBucket(b)) || null;
      const bWeekly = buckets.find((b) => b !== b5h && isWeeklyBucket(b)) || null;
      const others = buckets.filter((b) => b !== b5h && b !== bWeekly);
      return { b5h, bWeekly, others };
    };

    const gBuckets = splitBuckets(geminiGroup);
    const cBuckets = splitBuckets(claudeGroup);

    /** @param {import('./types/monitor').AgManagerQuotaBucket} bucket */
    const toPct = (bucket) => clampPct(Number(bucket?.remainingFraction || 0) * 100);
    /** @type {import('./types/monitor').AgManagerQuotaCell[]} */
    const cells = [];

    if (gBuckets.b5h) {
      const pct = toPct(gBuckets.b5h);
      const resetText = formatAgResetCountdown(gBuckets.b5h.resetTime, nowMs);
      cells.push({
        id: 'gemini-5h',
        family: 'gemini',
        title: '',
        resetText,
        resetTone: '5h',
        pct,
        isFull: false,
        ariaLabel: `Gemini 5h: ${pct}% (${resetText})`,
      });
    }
    if (cBuckets.b5h) {
      const pct = toPct(cBuckets.b5h);
      const resetText = formatAgResetCountdown(cBuckets.b5h.resetTime, nowMs);
      cells.push({
        id: 'claude-5h',
        family: 'claude',
        title: '',
        resetText,
        resetTone: '5h',
        pct,
        isFull: false,
        ariaLabel: `Claude / GPT 5h: ${pct}% (${resetText})`,
      });
    }
    if (gBuckets.bWeekly) {
      const pct = toPct(gBuckets.bWeekly);
      const resetText = formatAgResetCountdown(gBuckets.bWeekly.resetTime, nowMs);
      cells.push({
        id: 'gemini-weekly',
        family: 'gemini',
        title: '',
        resetText,
        resetTone: 'weekly',
        pct,
        isFull: false,
        ariaLabel: `Gemini weekly: ${pct}% (${resetText})`,
      });
    }
    if (cBuckets.bWeekly) {
      const pct = toPct(cBuckets.bWeekly);
      const resetText = formatAgResetCountdown(cBuckets.bWeekly.resetTime, nowMs);
      cells.push({
        id: 'claude-weekly',
        family: 'claude',
        title: '',
        resetText,
        resetTone: 'weekly',
        pct,
        isFull: false,
        ariaLabel: `Claude / GPT weekly: ${pct}% (${resetText})`,
      });
    }

    let extraIndex = 0;
    /**
     * @param {string} groupTitle
     * @param {import('./types/monitor').AgManagerQuotaBucket} bucket
     * @param {'gemini' | 'claude' | 'other'} family
     */
    const pushExtra = (groupTitle, bucket, family) => {
      const pct = toPct(bucket);
      const resetText = formatAgResetCountdown(bucket.resetTime, nowMs);
      const title = [groupTitle, bucket.window || bucket.bucketId].filter(Boolean).join(' · ');
      /** @type {'5h' | 'weekly' | ''} */
      const resetTone = is5hBucket(bucket) ? '5h' : (isWeeklyBucket(bucket) ? 'weekly' : '');
      cells.push({
        id: `extra-${extraIndex++}-${bucket.bucketId || bucket.window || 'bucket'}`,
        family,
        title,
        resetText,
        resetTone,
        pct,
        isFull: true,
        ariaLabel: `${title}: ${pct}% (${resetText})`,
      });
    };

    for (const bucket of gBuckets.others) {
      pushExtra(geminiGroup?.displayName || 'Gemini', bucket, 'gemini');
    }
    for (const bucket of cBuckets.others) {
      pushExtra(claudeGroup?.displayName || 'Claude', bucket, 'claude');
    }
    for (const group of extraGroups) {
      const family = classifyGroupFamily(group);
      for (const bucket of group.buckets || []) {
        pushExtra(group.displayName || bucket.displayName || 'Quota', bucket, family);
      }
    }

    if (cells.length > 0) return cells;
  }

  if (models.length > 0) {
    /**
     * @param {import('./types/monitor').AgManagerModelQuota[]} list
     * @returns {import('./types/monitor').AgManagerModelQuota | null}
     */
    const pickMin = (list) => {
      /** @type {import('./types/monitor').AgManagerModelQuota | null} */
      let min = null;
      for (const cur of list) {
        if (!min || cur.percentage < min.percentage) min = cur;
      }
      return min;
    };

    const geminiPro = pickMin(models.filter((m) => /gemini/i.test(m.name) && !/flash|image/i.test(m.name)));
    const claudeGpt = pickMin(models.filter((m) => /claude|gpt/i.test(m.name)));
    const geminiFlash = pickMin(models.filter((m) => /flash|image/i.test(m.name)));

    /** @type {Array<{ id: string, family: 'gemini' | 'claude' | 'other', title: string, model: import('./types/monitor').AgManagerModelQuota }>} */
    const summaryEntries = [];
    if (geminiPro) summaryEntries.push({ id: 'model-gemini-pro', family: 'gemini', title: 'Gemini Pro', model: geminiPro });
    if (claudeGpt) summaryEntries.push({ id: 'model-claude-gpt', family: 'claude', title: 'Claude / GPT', model: claudeGpt });
    if (geminiFlash) summaryEntries.push({ id: 'model-gemini-flash', family: 'gemini', title: 'Gemini Flash', model: geminiFlash });

    if (summaryEntries.length === 0) {
      models.slice(0, 4).forEach((model, idx) => {
        summaryEntries.push({
          id: `model-${idx}-${model.name}`,
          family: classifyModelFamily(model),
          title: model.displayName || model.name,
          model,
        });
      });
    }

    const total = summaryEntries.length;
    /** @type {import('./types/monitor').AgManagerQuotaCell[]} */
    const fallbackCells = [];
    summaryEntries.forEach((entry, idx) => {
      const pct = clampPct(entry.model.percentage);
      const resetText = formatAgResetCountdown(entry.model.resetTime, nowMs);
      const isFull = total % 2 === 1 && idx === total - 1;
      fallbackCells.push({
        id: entry.id,
        family: entry.family,
        title: entry.title,
        resetText,
        resetTone: '',
        pct,
        isFull,
        ariaLabel: `${entry.title}: ${pct}% (${resetText})`,
      });
    });
    return fallbackCells;
  }

  return [];
}
