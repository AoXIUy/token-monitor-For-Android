import type {
  BreakdownKind, DailyHistoryRow, DeviceData, LimitProvider, MonitorStats,
  PeriodData, PeriodId, QuotaWindow, SessionRow, SessionStatusResult, SubscriptionRow,
} from '../types/monitor';

export interface Selection {
  period: PeriodData | null;
  providers: LimitProvider[];
  device: DeviceData | null;
  expired: boolean;
}
interface BreakdownRow { id: string; label: string; tokens: number; cost: number | null }
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
  owners: Array<{ deviceId: string; hostname: string; stale: boolean; platform: string; updatedAt?: string; receivedAt?: string; session: Omit<SessionRow, 'key'> }>;
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
  compact(value: unknown): string;
  money(value: unknown, currency?: string): string;
  select(stats: MonitorStats | null, deviceId: string, period: PeriodId, now?: number): Selection;
  breakdown(period: PeriodData | null, kind: BreakdownKind): BreakdownRow[];
  sessions(period: PeriodData | null, search?: string): SessionRow[];
  sessionDetail(stats: MonitorStats, key: string, options?: SessionOptions): SessionDetail | null;
  sessionStatus(row: SessionRow, options: SessionOptions): SessionStatusResult;
  daily(stats: MonitorStats): DailyHistoryRow[];
  components(period: PeriodData): { cached: number; output: number; cachePercent: string } | null;
  limitAccount(provider: LimitProvider, stats?: MonitorStats | null, deviceId?: string): { key: string; sourceLabel: string };
  quota(provider: LimitProvider, window: QuotaWindow): { label: string; value: string; percent: number | null; remaining?: boolean; detail?: string };
  subscriptionAmount(row: SubscriptionRow): number | null;
}

// The APK loads the tested model before React. Keep status, balance and detail
// calculations in that authoritative module instead of forking them in TS.
if (!window.MonitorModel) throw new Error('Packaged MonitorModel is missing');
export const MonitorModel = window.MonitorModel as MonitorModelApi;
