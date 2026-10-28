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
  reasoningTokens?: number | null;
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
  providers?: Record<string, number>;
  liveActivity?: LiveActivity;
}

export interface PeriodData {
  totalTokens?: number;
  inputTokens?: number;
  outputTokens?: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
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
}

export interface LimitProvider {
  provider: string;
  accountKey?: string;
  profileName?: string;
  workspaceKind?: string;
  sourceDeviceId?: string;
  accountName?: string;
  accountEmail?: string;
  planLabel?: string;
  accountLabel?: string;
  status?: 'ok' | 'unavailable' | 'unauthorized' | 'notConfigured' | 'disabled' | 'rateLimited' | 'sourceRateLimited' | 'unconfigured' | 'error' | string;
  stale?: boolean;
  updatedAt?: string;
  balance?: {
    amount?: number | null;
    currency?: string;
    limit?: number | null;
  };
  windows?: QuotaWindow[];
}

export interface DeviceData {
  deviceId: string;
  hostname?: string;
  platform?: string;
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

export interface SessionStatusResult {
  state: 'running' | 'waiting' | 'ended' | 'idle' | 'archived' | 'unknown';
  label: string;
  detail: string;
  source: 'native' | 'inferred' | 'transcript' | 'archive' | 'unknown';
  observedAt: string;
  nextChangeAt: number;
}

export interface HubNativeBridge {
  ready?: () => void;
  connect: (url: string, secret: string, allowHttp: boolean) => void;
  disconnect?: () => void;
  refresh?: () => void;
  subscriptions?: () => void;
  monitor?: (enabled: boolean) => void;
  testNotification?: () => void;
  notificationSettings?: () => void;
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
  connectPending: boolean;
  formError: string;
  connectionEpoch: number;
}
