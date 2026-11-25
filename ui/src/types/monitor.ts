export type PageId = 'overview' | 'devices' | 'limits' | 'sessions' | 'sessionDetail' | 'reports' | 'settings';
export type PeriodId = 'today' | 'month' | 'allTime';
export type ReportGranularity = 'daily' | 'weekly' | 'monthly';
export type BreakdownKind = 'clients' | 'devices' | 'models' | 'projects';
export type QuotaTabId = 'limits' | 'subscriptions' | 'antigravityManager';
export type ConnectionStatus = 'online' | 'offline' | 'loading' | 'disconnected';
export type ThemeId = 'obsidian' | 'daylight' | 'amber' | 'emerald' | 'nebula' | 'frost';
export type ThemePreference = ThemeId | 'auto';

export interface ProjectUsage {
  label?: string;
  tokens?: number;
  costUsd?: number | null;
}

export interface LiveActivity {
  state?: 'running' | 'waiting' | 'ended' | 'idle';
  observedAt?: string;
  expiresAt?: string;
}

export interface SessionRow {
  key: string;
  sessionId?: string;
  nativeSessionId?: string;
  t3ThreadId?: string;
  sessionKind?: string;
  title?: string;
  client?: string;
  parentClient?: string;
  parentSessionId?: string;
  groupRows?: SessionRow[];
  groupRole?: 'main' | 'subagent';
  subagentCount?: number;
  detailKey?: string;
  projectLabel?: string;
  startedAt?: string;
  lastUsedAt?: string;
  turnEnded?: boolean;
  archived?: boolean;
  isArchived?: boolean;
  tokenDataUnavailable?: boolean;
  totalTokens?: number | null;
  inputTokens?: number | null;
  outputTokens?: number | null;
  cacheReadTokens?: number | null;
  cacheWriteTokens?: number | null;
  cacheReported?: boolean;
  reasoningTokens?: number | null;
  reasoningEffort?: string | null;
  latestModel?: string | null;
  unclassifiedTokens?: number | null;
  unpricedTokens?: number | null;
  timedOutputTokens?: number | null;
  timedDurationMs?: number | null;
  costUsd?: number | null;
  messageCount?: number | null;
  contextTokens?: number | null;
  contextWindow?: number | null;
  promptCacheExpiresAt?: string;
  models?: Record<string, number>;
  modelCosts?: Record<string, number>;
  modelTokenComponents?: Record<string, ModelTokenComponents>;
  providers?: Record<string, number>;
  liveActivity?: LiveActivity;
}

export interface ModelTokenComponents {
  totalTokens: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
}

export interface PeriodData {
  totalTokens?: number;
  inputTokens?: number;
  outputTokens?: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
  unclassifiedTokens?: number;
  unpricedTokens?: number;
  costUsd?: number | null;
  capabilities?: {
    tokenComponents?: boolean;
  };
  clients?: Record<string, number>;
  clientCosts?: Record<string, number>;
  models?: Record<string, number>;
  modelCosts?: Record<string, number>;
  projects?: Record<string, ProjectUsage>;
  sessions?: Record<string, Omit<SessionRow, 'key'>>;
}

export interface QuotaWindow {
  limitId?: string;
  productId?: string;
  windowMinutes?: number;
  additional?: boolean;
  kind?: 'session' | 'weekly' | 'daily' | 'monthly' | 'billing' | 'credits' | string;
  label?: string;
  metric?: 'spend' | 'credits' | 'percent' | string;
  used?: number | null;
  remaining?: number | null;
  limit?: number | null;
  usedPercent?: number | null;
  remainingPercent?: number | null;
  currency?: string;
  resetsAt?: string;
  resetDescription?: string;
  boundaryKind?: 'reset' | 'expiry' | 'mixed';
  showMeter?: boolean;
  detail?: string;
}

export interface LimitProvider {
  androidHistoryKey?: string;
  adapterId?: string;
  region?: string;
  sourceDetail?: string;
  provider: string;
  accountKey?: string;
  accountKeyPortable?: boolean;
  accountKeyAliases?: string[];
  relatedAccountKey?: string;
  profileName?: string;
  workspaceKind?: string;
  sourceDeviceId?: string;
  source?: string;
  accountDisplayName?: string;
  accountName?: string;
  accountEmail?: string;
  planLabel?: string;
  accountLabel?: string;
  status?: 'ok' | 'unavailable' | 'unauthorized' | 'notConfigured' | 'disabled' | 'rateLimited' | 'sourceRateLimited' | 'unconfigured' | 'error' | string;
  stale?: boolean;
  updatedAt?: string;
  balance?: {
    amount?: number | null;
    monthSpend?: number | null;
    todaySpend?: number | null;
    weekSpend?: number | null;
    allTimeSpend?: number | null;
    searchSpend?: number | null;
    fetchSpend?: number | null;
    giftBalance?: number | null;
    cashBalance?: number | null;
    currency?: string;
    limit?: number | null;
  };
  windows?: QuotaWindow[];
}

export interface DeviceData {
  deviceId: string;
  hostname?: string;
  platform?: string;
  deviceKind?: string;
  osName?: string;
  osVersion?: string;
  agentVersion?: string;
  stale?: boolean;
  updatedAt?: string;
  receivedAt?: string;
  periodWindows?: Partial<Record<PeriodId, { endsAt?: string }>>;
  periods?: Partial<Record<PeriodId, PeriodData>>;
  limits?: {
    providers?: LimitProvider[];
  };
  sessionDetailsOmitted?: Partial<Record<PeriodId, number>>;
}

export interface SessionDevice {
  deviceId: string;
  hostname: string;
  platform: string;
  deviceKind: string;
  stale: boolean;
}

export interface DailyHistoryRow {
  date: string;
  tokens: number;
  cost?: number | null;
}

export interface LimitAccountPresentationGroup {
  labels: Record<string, string>;
  order: string[];
}

export type LimitAccountPresentationMap = Record<string, LimitAccountPresentationGroup>;

export interface MonitorStats {
  periods?: Partial<Record<PeriodId, PeriodData>>;
  devices?: DeviceData[];
  limits?: {
    providers?: LimitProvider[];
    multiAccountProviders?: string[];
  };
  historyPreview?: {
    daily?: DailyHistoryRow[];
    summary?: { activeDays?: number; activeDaysComplete?: boolean };
  };
  syncSettingsRevisions?: Record<string, number>;
  projectsIncomplete?: boolean;
  periodProjectsOmitted?: Partial<Record<PeriodId, number>>;
  sessionDetailsOmitted?: Partial<Record<PeriodId, number>>;
}

export interface TopUpEntry {
  date: string;
  amountMinor: number;
}

export interface SubscriptionRow {
  id?: string;
  provider: string;
  planName?: string;
  kind: 'subscription' | 'topup';
  amountMinor?: number | null;
  currency?: string;
  interval?: 'month' | 'year' | 'week' | 'day' | string;
  intervalCount?: number;
  autoRenew?: boolean;
  startDate?: string;
  endDate?: string;
  nextRenewalOverride?: string;
  note?: string;
  binding?: {
    accountEmail?: string;
    profileName?: string;
  };
  topUps?: TopUpEntry[];
}

export interface SubscriptionsPayload {
  updatedAt?: string;
  subscriptions: SubscriptionRow[];
}

export interface NotificationState {
  enabled: boolean;
  permission: boolean;
  message: string;
  lastReadAt?: string | number;
}

export interface ApprovalItem {
  id: string;
  deviceId: string;
  deviceName: string;
  client: 'codex' | 'antigravity' | string;
  sessionId?: string;
  tool: string;
  command: string;
  description?: string;
  projectLabel?: string;
  createdAt: number;
  expiresAt: number;
}

export interface ApprovalsState {
  enabled: boolean;
  permission: boolean;
  status: 'off' | 'ok' | 'disabled' | 'unsupported' | 'error' | string;
  message: string;
  items: ApprovalItem[];
}

export interface SessionStatusResult {
  state: 'running' | 'waiting' | 'ended' | 'idle' | 'archived' | 'unknown';
  label: string;
  detail: string;
  source: 'native' | 'inferred' | 'transcript' | 'archive' | 'unknown';
  observedAt: string;
  nextChangeAt: number;
}

export interface CaCertSummary {
  sha256: string;
  subject: string;
  issuer: string;
  notBefore: number;
  notAfter: number;
  certCount: number;
  isCa: boolean;
}

export interface CaCertDraftState {
  requestId: string;
  loading: boolean;
  draftToken: string;
  cert: CaCertSummary | null;
  error: string;
}

export interface HubProfile {
  id: string;
  name: string;
  url: string;
  allowHttp: boolean;
  hasCustomCa?: boolean;
  caFingerprint?: string;
  caSubject?: string;
  caNotAfter?: number;
}

export interface HubNativeBridge {
  conversation?: (deviceId: string, key: string, cursor: string, requestId: string) => void;
  cancelConversation?: () => void;
  quotaHistory?: (key: string) => void;
  ready?: () => void;
  connect: (url: string, secret: string, allowHttp: boolean) => void;
  connectWithTls?: (url: string, secret: string, allowHttp: boolean, caDraftToken: string) => void;
  selectHubProfile?: (id: string) => void;
  addHubProfile?: (name: string, url: string, secret: string, allowHttp: boolean) => void;
  addHubProfileWithTls?: (name: string, url: string, secret: string, allowHttp: boolean, caDraftToken: string) => void;
  saveHubProfile?: (id: string, name: string, url: string, secret: string, allowHttp: boolean) => void;
  saveHubProfileWithTls?: (id: string, name: string, url: string, secret: string, allowHttp: boolean, caMode: 'keep' | 'replace' | 'clear', caDraftToken: string) => void;
  deleteHubProfile?: (id: string) => void;
  pickCaCertificate?: (requestId: string) => void;
  validateCaCertificatePem?: (pem: string, requestId: string) => void;
  clearCaCertificateDraft?: (draftToken: string) => void;
  disconnect?: () => void;
  refresh?: () => void;
  subscriptions?: () => void;
  monitor?: (enabled: boolean) => void;
  approvalAlerts?: (enabled: boolean) => void;
  testNotification?: () => void;
  notificationSettings?: () => void;
  checkForUpdates?: () => void;
  automaticUpdates?: (enabled: boolean) => void;
  downloadUpdate?: () => void;
  installUpdate?: () => void;
  cancelUpdateDownload?: () => void;
  dismissAppUpdatePrompt?: () => void;
  saveLimitsPrefs?: (serialized: string) => void;
  saveDisplayPrefs?: (serialized: string) => void;
  initialDisplayPrefs?: () => string;
  listReports?: (granularity: string, limit: number, requestId: string) => void;
  getReport?: (granularity: string, periodKey: string, requestId: string) => void;
  cancelReports?: () => void;
  queryAntigravityManager?: (requestId: string) => void;
  cancelAntigravityManager?: () => void;
  copyText?: (text: string) => boolean;
}

export interface DisplayPrefs {
  separateQoderClients: boolean;
  exactTrendTokens: boolean;
  theme: ThemePreference;
}

export interface LimitsPrefs {
  hideUncollected: boolean;
  showRemaining: boolean;
  hiddenAccountHashes: string[];
}

export interface UpdateDownloadState {
  phase: 'idle' | 'downloading' | 'verifying' | 'ready' | 'permission' | 'installing' | 'error' | 'cancelled';
  version: string;
  downloaded: number;
  total: number;
  message: string;
  error: string;
}

export interface AppUpdateState {
  currentVersion: string;
  latestVersion: string;
  automatic: boolean;
  checking: boolean;
  available: boolean;
  checkedAt: number;
  name: string;
  notes: string;
  publishedAt: string;
  size: number;
  error: string;
  promptToken: string;
  download: UpdateDownloadState;
}

declare global {
  interface Window {
    HubNative?: HubNativeBridge;
    receiveNative?: (serialized: string | Record<string, unknown>) => void;
    handleBackNavigation?: () => boolean;
    MonitorModel?: unknown;

  }
}

export interface MonitorState {
  conversation: SessionConversationState | null;
  quotaHistory: QuotaHistoryPayload | null;
  historyError: string;
  appUpdate: AppUpdateState;
  dismissedUpdateVersion: string;
  dismissedUpdatePrompt: string;
  page: PageId;
  period: PeriodId;
  device: string;
  stats: MonitorStats | null;
  subscriptions: SubscriptionsPayload | null;
  subscriptionError: string;
  connection: string;
  allowHttp: boolean;
  hasCustomCa: boolean;
  hubProfiles: HubProfile[];
  activeHubProfileId: string;
  caDraft: CaCertDraftState | null;
  status: ConnectionStatus;
  message: string;
  fetchedAt: number;
  foreground: boolean;
  statusHealthy: boolean;
  detailKey: string;
  notifications: NotificationState;
  monitorPending: boolean;
  approvals: ApprovalsState;
  approvalsPending: boolean;
  connectPending: boolean;
  formError: string;
  connectionEpoch: number;
  limitsPrefs: LimitsPrefs;
  displayPrefs: DisplayPrefs;
  systemDark: boolean;
  imeVisible: boolean;
  limitAccountPresentation: LimitAccountPresentationMap;
  reports: ReportsState;
  agManager: AgManagerState;
}

export interface AgManagerQuotaBucket {
  bucketId: string;
  window: string;
  remainingFraction: number;
  resetTime: string;
  displayName: string;
}

export interface AgManagerQuotaGroup {
  displayName: string;
  description: string;
  buckets: AgManagerQuotaBucket[];
}

export interface AgManagerModelQuota {
  name: string;
  displayName: string;
  percentage: number;
  resetTime: string;
}

export interface AgManagerCapabilityPill {
  label: string;
  tone: 'violet' | 'amber' | 'emerald';
}

export interface AgManagerQuotaCell {
  id: string;
  family: 'gemini' | 'claude' | 'other';
  title: string;
  resetText: string;
  resetTone: '5h' | 'weekly' | '';
  pct: number;
  isFull: boolean;
  ariaLabel: string;
}

export interface AgManagerAccountSummary {
  id: string;
  email: string;
  name: string;
  subscriptionTier: 'FREE' | 'PRO' | 'ULTRA' | string;
  disabled: boolean;
  disabledReason: string;
  validationBlocked: boolean;
  validationMessage: string;
  banned: boolean;
  hasDeviceProfile: boolean;
  lastUsedAt?: number;
  quota: {
    isForbidden: boolean;
    forbiddenReason: string;
    lastUpdated: number;
    groups?: AgManagerQuotaGroup[];
    models: AgManagerModelQuota[];
  };
}

export interface AgManagerActiveSlotBinding {
  slot: string;
  label: string;
  target: string;
  email: string;
}

export interface AgManagerDeviceSummary {
  total: number;
  available: number;
  abnormal: number;
  ultra: number;
  pro: number;
  free: number;
  activeSlots: AgManagerActiveSlotBinding[];
}

export interface AgManagerDeviceSnapshot {
  version: number;
  deviceId: string;
  hostname: string;
  updatedAt: string;
  settings: {
    startupRefresh: boolean;
    autoRefresh: boolean;
    refreshIntervalMinutes: number;
  };
  activeAccounts: {
    classic: string;
    ide: string;
    agy: string;
    acp: string;
  };
  accounts: AgManagerAccountSummary[];
}

export interface AgManagerState {
  loading: boolean;
  error: string;
  errorCode: string;
  requestId: string;
  updatedAt: string;
  devices: AgManagerDeviceSnapshot[];
  selectedDeviceId: string;
  tierFilter: 'all' | 'PRO' | 'ULTRA' | 'FREE';
  statusFilter: 'all' | 'available' | 'abnormal';
  searchQuery: string;
}

export interface HubReportConfig {
  enabled: boolean;
  daily: boolean;
  weekly: boolean;
  monthly: boolean;
}

export interface ReportListItem {
  reportId: string;
  granularity: ReportGranularity;
  periodKey: string;
  label: string;
  startDate: string;
  endDate: string;
  generatedAt: string;
  totalTokens: number;
  knownCostUsd: number;
  projectCount: number;
  hasAiAnalysis?: boolean;
}

export interface ReportAiAnalysis {
  schemaVersion: number;
  generatedAt: string;
  protocol: string;
  providerLabel: string;
  model: string;
  language: string;
  question?: string | null;
  summaryMarkdown: string;
  tokenUsage?: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  } | null;
  basedOnSignature?: string;
  stale?: boolean;
}

export interface ReportIntegrationsStatus {
  ai: {
    enabled: boolean;
    protocol: string;
    providerLabel: string;
    model: string;
    language: string;
    autoAnalyzeOnRollover: boolean;
    apiKeyConfigured: boolean;
  };
  openclaw: {
    enabled: boolean;
    mode: string;
    channel: string;
    to: string;
    pushOnRollover: boolean;
    includeAiAnalysis: boolean;
    includeLimits: boolean;
    hookTokenConfigured: boolean;
  };
  lastPush?: {
    at: string;
    ok: boolean;
    error?: string | null;
    message?: string | null;
    statusCode?: number | null;
    reportId?: string | null;
    channel?: string | null;
    mode?: string | null;
  } | null;
}

export interface UsageReportProject {
  key: string;
  label: string;
  tokens: number;
  costUsd: number;
  unpricedTokens: number;
  tokenSharePct: number;
  costSharePct: number;
  sessionCount: number;
  clients: Array<{ client: string; tokens: number; sharePct: number }>;
  models: Array<{ model: string; tokens: number; sharePct: number }>;
}

export interface UsageReportClient {
  client: string;
  tokens: number;
  costUsd: number;
  unpricedTokens: number;
  tokenSharePct: number;
  costSharePct: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  outputTokens: number;
  inputTokens: number;
  unclassifiedTokens: number;
  cacheHitRatePct: number | null;
  messageCount: number;
}

export interface UsageReportModel {
  model: string;
  tokens: number;
  costUsd: number;
  unpricedTokens: number;
  tokenSharePct: number;
  costSharePct: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  outputTokens: number;
  inputTokens: number;
  unclassifiedTokens: number;
  cacheHitRatePct: number | null;
  avgOutputTokensPerSec: number | null;
}

export interface UsageReportDevice {
  deviceId: string;
  hostname: string;
  platform: string;
  stale: boolean;
  tokens: number;
  costUsd: number;
  tokenSharePct: number;
  projectCount: number;
}

export interface UsageReportTimelineRow {
  date: string;
  tokens: number;
  costUsd: number;
  activeTimeMs: number;
  topClient: string;
  topModel: string;
}

export interface UsageReportSignal {
  code: string;
  severity: 'info' | 'warning' | 'alert' | string;
  project?: string;
  model?: string;
  valuePct?: number;
  summary: string;
}

export interface UsageReportData {
  schemaVersion: number;
  schema: string;
  reportId: string;
  granularity: ReportGranularity;
  period: {
    key: string;
    label: string;
    startDate: string;
    endDate: string;
    timeZone: string;
    isCurrent: boolean;
    generatedAt: string;
    previousPeriodKey?: string;
  };
  hub: {
    runtime: string;
    deviceCount: number;
    activeDeviceCount: number;
    staleDeviceCount: number;
  };
  coverage: {
    tokenComponentsComplete: boolean;
    projectsComplete: boolean;
    projectAttributionSource: string;
    historyComplete: boolean;
  };
  summary: {
    totalTokens: number;
    knownCostUsd: number;
    unpricedTokens: number;
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
    cacheWriteTokens: number;
    unclassifiedTokens: number;
    cacheHitRatePct: number | null;
    messageCount: number;
    sessionCount: number;
    projectCount: number;
    activeDays: number;
    activeTimeMs: number;
    peakDay: { date: string; tokens: number; costUsd: number } | null;
    throughput: {
      timedTokens: number;
      timedOutputTokens: number;
      timedDurationMs: number;
      avgOutputTokensPerSec: number | null;
    };
    comparison: {
      previousPeriodKey: string;
      previousTokens: number;
      previousCostUsd: number;
      tokenDelta: number;
      tokenDeltaPct: number | null;
      costDelta: number;
      costDeltaPct: number | null;
    } | null;
  };
  projects: UsageReportProject[];
  clients: UsageReportClient[];
  models: UsageReportModel[];
  devices: UsageReportDevice[];
  timeline: UsageReportTimelineRow[];
  signals: UsageReportSignal[];
}

export interface ReportsState {
  granularity: ReportGranularity;
  periodKey: string;
  listLoading: boolean;
  listError: string;
  listRequestId: string;
  config: HubReportConfig | null;
  integrations: ReportIntegrationsStatus | null;
  items: ReportListItem[];
  detailLoading: boolean;
  detailError: string;
  detailRequestId: string;
  report: UsageReportData | null;
  aiAnalysis: ReportAiAnalysis | null;
  markdown: string;
}

export interface SessionConversationMessage {
  id: string;
  role: 'user' | 'assistant' | 'tool' | 'system';
  text: string;
  timestamp: string;
  kind: string;
  continued: boolean;
}

export interface SessionConversationItem extends SessionConversationMessage {
  parts: number;
}

export interface SessionConversationItemDescriptor {
  isEvent: boolean;
  category: 'user' | 'assistant' | 'thinking' | 'tool_call' | 'tool_result' | 'context' | 'event';
  badge: string;
  title: string;
  detail: string;
  preview: string;
}

export interface SessionConversationEventCounts {
  total: number;
  thinking: number;
  tool: number;
  context: number;
}

export type SessionConversationBlock =
  | {
      type: 'dialogue';
      id: string;
      item: SessionConversationItem;
      meta: SessionConversationItemDescriptor;
    }
  | {
      type: 'events';
      id: string;
      events: Array<{
        item: SessionConversationItem;
        meta: SessionConversationItemDescriptor;
      }>;
      counts: SessionConversationEventCounts;
      summaryLabel: string;
    };

export interface SessionConversationGroupedView {
  blocks: SessionConversationBlock[];
  dialogueCount: number;
  eventCount: number;
  matchedDialogueCount: number;
  matchedEventCount: number;
}

export interface SessionConversationState {
  deviceId: string;
  key: string;
  requestId: string;
  cursor: string;
  messages: SessionConversationMessage[];
  revision: string;
  nextCursor: string;
  incomplete: boolean;
  loading: boolean;
  error: string;
}

export interface QuotaHistoryPoint {
  at: number;
  value: number;
  unit: string;
  balance: boolean;
  reset: number | null;
  basis?: string;
  interval: number;
  breakBefore?: boolean;
  uncertainUntil?: number;
  allowanceMissingBefore?: boolean;
}
export interface QuotaHistoryWindow {
  key: string;
  window: QuotaWindow;
  unit: string;
  balance: boolean;
  points: QuotaHistoryPoint[];
  distribution: {
    buckets: Array<{ key: string; value: number | null; observations: number; uncertain: boolean }>;
    unallocated: number;
    resets: number;
  };
}
export interface QuotaHistoryPayload {
  key: string;
  now: number;
  windows: QuotaHistoryWindow[];
  persistent: boolean;
  error?: string;
}
