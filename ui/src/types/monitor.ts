export type PageId = 'overview' | 'devices' | 'limits' | 'sessions' | 'sessionDetail' | 'settings';
export type PeriodId = 'today' | 'month' | 'allTime';
export type BreakdownKind = 'clients' | 'models' | 'projects';
export type QuotaTabId = 'limits' | 'subscriptions';
export type ConnectionStatus = 'online' | 'offline' | 'loading' | 'disconnected';

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
  relatedAccountKey?: string;
  profileName?: string;
  workspaceKind?: string;
  sourceDeviceId?: string;
  source?: string;
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

export interface MonitorStats {
  periods?: Partial<Record<PeriodId, PeriodData>>;
  devices?: DeviceData[];
  limits?: {
    providers?: LimitProvider[];
  };
  historyPreview?: {
    daily?: DailyHistoryRow[];
    summary?: { activeDays?: number; activeDaysComplete?: boolean };
  };
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

export interface HubNativeBridge {
  conversation?: (deviceId: string, key: string, cursor: string, requestId: string) => void;
  cancelConversation?: () => void;
  quotaHistory?: (key: string) => void;
  ready?: () => void;
  connect: (url: string, secret: string, allowHttp: boolean) => void;
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
