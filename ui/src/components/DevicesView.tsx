import React, { useMemo } from 'react';
import { ArrowRight, HardDrive } from 'lucide-react';
import { DeviceIcon } from './DeviceIcon';
import { CopyButton, EmptyState, ProgressMeter } from './ui/Primitives';
import { MonitorModel } from '../model/monitorModel';
import { MonitorStats } from '../types/monitor';
import { formatShortTime } from '../utils/formatters';

interface DevicesViewProps {
  stats: MonitorStats;
  onSelectDevice: (deviceId: string) => void;
}

export const DevicesView: React.FC<DevicesViewProps> = ({ stats, onSelectDevice }) => {
  const devices = stats.devices || [];

  const enrichedDevices = useMemo(() => {
    const now = Date.now();
    const mapped = devices.map((device, index) => {
      const todaySel = MonitorModel.select(stats, device.deviceId, 'today', now);
      const monthPeriod = MonitorModel.select(stats, device.deviceId, 'month', now).period;
      const todayTokens = todaySel.period ? MonitorModel.count(todaySel.period.totalTokens) : null;
      return {
        device,
        todayPeriod: todaySel.period,
        todayExpired: todaySel.expired,
        monthPeriod,
        todayTokens,
        index,
      };
    });

    return mapped.sort((a, b) => {
      // Active (not stale) devices first
      if (Boolean(a.device.stale) !== Boolean(b.device.stale)) {
        return Number(Boolean(a.device.stale)) - Number(Boolean(b.device.stale));
      }
      // Devices with active today readings before expired/missing
      const aHasToday = a.todayTokens !== null;
      const bHasToday = b.todayTokens !== null;
      if (aHasToday !== bHasToday) return aHasToday ? -1 : 1;
      // Higher today tokens first
      if ((b.todayTokens ?? -1) !== (a.todayTokens ?? -1)) {
        return (b.todayTokens ?? -1) - (a.todayTokens ?? -1);
      }
      return a.index - b.index;
    });
  }, [devices, stats]);

  if (!devices.length) {
    return (
      <EmptyState
        icon={<HardDrive className="w-6 h-6" />}
        title="还没有采集设备"
        description="在电脑上启动 Token Monitor 并连接到同一个 Hub。"
      />
    );
  }

  const activeCount = devices.filter((device) => !device.stale).length;
  const fleetTodayTokens = enrichedDevices.reduce(
    (sum, item) => sum + (item.todayTokens ?? 0),
    0,
  );

  return (
    <div className="space-y-3.5">
      <div className="flex items-center justify-between gap-2 px-1 text-xs text-[var(--tm-text-muted)] tabular-nums">
        <span>
          共 <strong className="text-[var(--tm-text-primary)] font-semibold">{devices.length}</strong> 台设备
          <span className="mx-1.5">·</span>
          <strong className="text-[var(--tm-success-text)] font-semibold">{activeCount}</strong> 台近期上报
        </span>
        <span className="text-[11px] text-[var(--tm-text-muted)]">按设备下钻明细</span>
      </div>

      {enrichedDevices.map(({ device, todayPeriod, todayExpired, monthPeriod, todayTokens }) => {
        const sharePct =
          todayPeriod && devices.length > 1 && fleetTodayTokens > 0
            ? Math.min(100, ((todayTokens ?? 0) / fleetTodayTokens) * 100)
            : null;
        const metaParts = [
          device.osName || device.platform,
          device.osVersion,
          device.agentVersion ? `Agent v${device.agentVersion}` : '',
        ].filter(Boolean);

        return (
          <section
            key={device.deviceId}
            className="glass-panel rounded-3xl p-4 sm:p-5 space-y-3"
          >
            <div className="flex items-start justify-between gap-2.5">
              <div className="flex items-start gap-3 min-w-0 flex-1">
                <div className="w-10 h-10 rounded-2xl bg-[var(--tm-accent-soft-bg)] border border-[var(--tm-accent-soft-border)] flex items-center justify-center text-[var(--tm-accent-text)] shrink-0">
                  <DeviceIcon kind={device.deviceKind} className="w-5 h-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="text-sm font-semibold text-[var(--tm-text-primary)] truncate">
                    {device.hostname || device.deviceId}
                  </h3>
                  <div className="flex items-center gap-2 mt-1 flex-nowrap min-w-0">
                    <span
                      data-selectable="true"
                      className="text-[11px] font-mono-tabular text-[var(--tm-text-muted)] truncate min-w-0 flex-1"
                    >
                      {device.deviceId}
                    </span>
                    <CopyButton
                      text={device.deviceId}
                      ariaLabel={`复制设备 ID ${device.deviceId}`}
                      className="min-h-[44px] px-2.5 shrink-0"
                    />
                  </div>
                </div>
              </div>

              <span
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium shrink-0 border whitespace-nowrap ${
                  device.stale
                    ? 'bg-[var(--tm-warning-soft-bg)] border-[var(--tm-warning-soft-border)] text-[var(--tm-warning-text)]'
                    : 'bg-[var(--tm-success-soft-bg)] border-[var(--tm-success-soft-border)] text-[var(--tm-success-text)]'
                }`}
              >
                <i
                  aria-hidden="true"
                  className={`w-1.5 h-1.5 rounded-full ${
                    device.stale ? 'bg-[var(--tm-warning)]' : 'bg-[var(--tm-success)]'
                  }`}
                />
                <span>{device.stale ? '上报过期' : '近期上报'}</span>
              </span>
            </div>

            {metaParts.length > 0 && (
              <p className="text-xs text-[var(--tm-text-secondary)] leading-snug break-words">
                {metaParts.join(' · ')}
              </p>
            )}

            <div className="glass-inset rounded-2xl p-3.5 space-y-2.5">
              <div className="grid grid-cols-2 gap-3">
                <div className="min-w-0">
                  <div className="text-lg font-bold text-[var(--tm-text-primary)] font-mono-tabular truncate">
                    {todayPeriod ? MonitorModel.compact(todayPeriod.totalTokens) : '—'}
                  </div>
                  <div className="text-[11px] text-[var(--tm-text-muted)] mt-0.5">今日 Tokens</div>
                </div>
                <div className="min-w-0">
                  <div className="text-lg font-bold text-[var(--tm-success-text)] font-mono-tabular truncate">
                    {todayPeriod ? MonitorModel.money(todayPeriod.costUsd) : '—'}
                  </div>
                  <div className="text-[11px] text-[var(--tm-text-muted)] mt-0.5">今日费用 · USD</div>
                </div>
              </div>

              {!todayPeriod ? (
                <div className="flex items-center justify-between pt-1.5 border-t border-[var(--tm-border-subtle)]">
                  <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-[var(--tm-bg-control)] border border-[var(--tm-border-subtle)] text-[11px] font-medium text-[var(--tm-text-secondary)]">
                    {todayExpired ? '周期已结束' : '暂无读数'}
                  </span>
                  <span className="text-[11px] text-[var(--tm-text-muted)]">未计入今日占比</span>
                </div>
              ) : sharePct !== null ? (
                <div className="space-y-1.5 pt-1.5 border-t border-[var(--tm-border-subtle)]">
                  <div className="flex items-center justify-between text-[11px] text-[var(--tm-text-muted)] tabular-nums">
                    <span>今日设备占比</span>
                    <span className="font-mono-tabular text-[var(--tm-text-secondary)] font-medium">
                      {sharePct >= 0.1 || sharePct === 0 ? `${sharePct.toFixed(1)}%` : '<0.1%'}
                    </span>
                  </div>
                  <ProgressMeter percent={sharePct} tone="sky" heightClass="h-1.5" />
                </div>
              ) : null}
            </div>

            <div className="flex items-center justify-between text-[11px] text-[var(--tm-text-muted)] tabular-nums flex-wrap gap-2">
              <span>
                采集 <span className="font-mono-tabular">{formatShortTime(device.updatedAt)}</span>
                <span className="mx-1.5">·</span>
                接收 <span className="font-mono-tabular">{formatShortTime(device.receivedAt)}</span>
              </span>
              {monthPeriod && (
                <span className="text-[var(--tm-text-secondary)]">
                  本月 <span className="font-mono-tabular font-medium">{MonitorModel.compact(monthPeriod.totalTokens)}</span>
                </span>
              )}
            </div>

            <button
              type="button"
              onClick={() => onSelectDevice(device.deviceId)}
              data-device={device.deviceId}
              className="w-full min-h-[44px] px-3.5 rounded-2xl bg-[var(--tm-accent-soft-bg)] hover:bg-[var(--tm-bg-control-hover)] border border-[var(--tm-accent-soft-border)] flex items-center justify-between text-xs font-semibold text-[var(--tm-accent-text)] active:scale-[0.985] transition-all"
            >
              <span>查看此设备用量明细</span>
              <ArrowRight className="w-4 h-4 text-[var(--tm-accent)] shrink-0" aria-hidden="true" />
            </button>
          </section>
        );
      })}
    </div>
  );
};
