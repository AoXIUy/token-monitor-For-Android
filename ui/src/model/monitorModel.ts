import type {
  BreakdownKind, DailyHistoryRow, DeviceData, LimitProvider, ModelTokenComponents, MonitorStats,
  PeriodData, PeriodId, QuotaWindow, SessionDevice, SessionRow, SessionStatusResult, SubscriptionRow,
} from '../types/monitor';

export interface Selection {
  period: PeriodData | null;
  providers: LimitProvider[];
  device: DeviceData | null;
  expired: boolean;
}
interface BreakdownRow { id: string; label: string; tokens: number; cost: number | null; components?: ModelTokenComponents }
export interface DeviceBreakdownRow {
  id: string;
  deviceId: string;
  label: string;
  hostname: string | null;
  deviceKind: string;
  platform: string | null;
  osName: string | null;
  osVersion: string | null;
  agentVersion: string | null;
  stale: boolean;
  updatedAt: string | null;
  status: 'active' | 'expired' | 'missing';
  available: boolean;
  expired: boolean;
  tokens: number | null;
  cost: number | null;
  clients: BreakdownRow[];
}
interface CacheEfficiency { hit: number; miss: number; percent: number }
interface SessionOptions {
  now?: number;
  stats?: MonitorStats;
  deviceId?: string;
  period?: PeriodId;
  connected?: boolean;
  foreground?: boolean;
  fetchedAt?: number;
}
interface SessionDetail {
  row: SessionRow;
  period: PeriodId;
  owners: Array<SessionDevice & { updatedAt?: string; receivedAt?: string; session: Omit<SessionRow, 'key'> }>;
  children: Array<{ key: string; label: string }>;
  parentKey: string;
  models: BreakdownRow[];
  providers: Array<{ label: string; tokens: number }>;
  context: { contextTokens: number; contextWindow: number; percentUsed: number } | null;
  promptCache: { minutes: number; expiresAt: number } | null;
  tokensPerSecond: number | null;
}
export interface MonitorModelApi {
  numeric(value: unknown): number | null;
  count(value: unknown): number;
  clientLabel(id?: string): string;
  compact(value: unknown): string;
  money(value: unknown, currency?: string): string;
  select(stats: MonitorStats | null, deviceId: string, period: PeriodId, now?: number): Selection;
  breakdown(period: PeriodData | null, kind: Exclude<BreakdownKind, 'devices'>): BreakdownRow[];
  deviceBreakdown(stats: MonitorStats | null, period: PeriodId, now?: number): DeviceBreakdownRow[];
  sessions(period: PeriodData | null, search?: string): SessionRow[];
  filterSessionTools(rows: SessionRow[], tool?: string): { rows: SessionRow[]; tools: string[]; tool: string };
  filterSessionStatuses(statuses: SessionStatusResult[], filter?: 'all' | 'running' | 'waiting' | 'ended'): {
    counts: { running: number; waiting: number; ended: number }; indices: number[];
  };
  deviceKind(value?: string): string;
  sessionDevices(row: SessionRow, stats: MonitorStats, period: PeriodId, deviceId?: string): SessionDevice[];
  sessionDetail(stats: MonitorStats, key: string, options?: SessionOptions): SessionDetail | null;
  sessionStatus(row: SessionRow, options: SessionOptions): SessionStatusResult;
  sessionReasoningEffort(row: SessionRow): string | null;
  sessionLatestModel(row: SessionRow): string | null;
  sessionModelLabel(row: SessionRow): string;
  sessionCacheEfficiency(row: SessionRow): CacheEfficiency | null;
  cacheEfficiency(period: PeriodData | null): CacheEfficiency | null;
  cacheSessions(period: PeriodData): Array<CacheEfficiency & { key: string; client?: string; title: string }>;
  daily(stats: MonitorStats): DailyHistoryRow[];
  activityDays(stats: MonitorStats): { count: number; complete: boolean } | null;
  widgetHistory(stats: MonitorStats | null | undefined, fetchedAt: number): {
    recentDays: number; sevenDayDays: number; sevenDayTokens: number | null; peakDayTokens: number | null;
  };
  components(period: PeriodData): { cached: number; output: number; cachePercent: string } | null;
  limitAccount(provider: LimitProvider, stats?: MonitorStats | null, deviceId?: string): { key: string; sourceLabel: string; productLabel?: string; regionLabel?: string };
  limitGroups(providers: LimitProvider[], stats?: MonitorStats | null, deviceId?: string): Array<{key: string; label: string; linked: boolean; providers: LimitProvider[]}>;
  limitSpend(provider: LimitProvider): Array<{key: string; label: string; value: string}>;
  limitBalanceDetails(provider: LimitProvider): Array<{key: string; label: string; value: string}>;
  quotaTrendBounds(provider: LimitProvider, window: QuotaWindow, now: number): { start: number; end: number; cycle: boolean };
  quota(provider: LimitProvider, window: QuotaWindow, options?: { showUsed?: boolean }): { label: string; value: string; percent: number | null; remaining?: boolean; detail?: string; description?: string };
  limitWindows(provider: LimitProvider): QuotaWindow[];
  limitHasHistory(provider: LimitProvider): boolean;
  subscriptionAmount(row: SubscriptionRow): number | null;
}

// The APK loads the tested model before React. Keep status, balance and detail
// calculations in that authoritative module instead of forking them in TS.
if (!window.MonitorModel) throw new Error('Packaged MonitorModel is missing');
export const MonitorModel = window.MonitorModel as MonitorModelApi;
