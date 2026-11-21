import React from 'react';
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
  const fleetTodayTokens = devices.reduce((sum, device) => {
    const p = MonitorModel.select(stats, device.deviceId, 'today').period;
    return sum + (p ? MonitorModel.count(p.totalTokens) : 0);
  }, 0);

  return (
    <div className="space-y-3.5">
      <div className="flex items-center justify-between gap-2 px-1 text-xs text-slate-400 tabular-nums">
        <span>
          共 <strong className="text-slate-100 font-semibold">{devices.length}</strong> 台设备
          <span className="mx-1.5">·</span>
          <strong className="text-emerald-400 font-semibold">{activeCount}</strong> 台近期上报
        </span>
        <span className="text-[11px] text-slate-400">按设备下钻明细</span>
      </div>

      {devices.map((device) => {
        const p = MonitorModel.select(stats, device.deviceId, 'today').period;
        const monthPeriod = MonitorModel.select(stats, device.deviceId, 'month').period;
        const todayTokens = p ? MonitorModel.count(p.totalTokens) : 0;
        const sharePct =
          devices.length > 1 && fleetTodayTokens > 0
            ? Math.min(100, (todayTokens / fleetTodayTokens) * 100)
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
                <div className="w-10 h-10 rounded-2xl bg-sky-500/12 border border-sky-400/25 flex items-center justify-center text-sky-300 shrink-0 shadow-[0_0_16px_rgba(56,189,248,0.12)]">
                  <DeviceIcon kind={device.deviceKind} className="w-5 h-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="text-sm font-semibold text-slate-100 truncate">
                    {device.hostname || device.deviceId}
                  </h3>
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    <span
                      data-selectable="true"
                      className="text-[11px] font-mono-tabular text-slate-400 truncate max-w-full"
                    >
                      {device.deviceId}
                    </span>
                    <CopyButton
                      text={device.deviceId}
                      ariaLabel={`复制设备 ID ${device.deviceId}`}
                    />
                  </div>
                </div>
              </div>

              <span
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium shrink-0 border whitespace-nowrap ${
                  device.stale
                    ? 'bg-amber-500/12 border-amber-400/25 text-amber-300'
                    : 'bg-emerald-500/12 border-emerald-400/25 text-emerald-300'
                }`}
              >
                <i
                  aria-hidden="true"
                  className={`w-1.5 h-1.5 rounded-full ${
                    device.stale ? 'bg-amber-400' : 'bg-emerald-400'
                  }`}
                />
                <span>{device.stale ? '上报过期' : '近期上报'}</span>
              </span>
            </div>

            {metaParts.length > 0 && (
              <p className="text-xs text-slate-300/90 leading-snug break-words">
                {metaParts.join(' · ')}
              </p>
            )}

            <div className="glass-inset rounded-2xl p-3.5 space-y-2.5">
              <div className="grid grid-cols-2 gap-3">
                <div className="min-w-0">
                  <div className="text-lg font-bold text-slate-50 font-mono-tabular truncate">
                    {p ? MonitorModel.compact(p.totalTokens) : '—'}
                  </div>
                  <div className="text-[11px] text-slate-400 mt-0.5">今日 Tokens</div>
                </div>
                <div className="min-w-0">
                  <div className="text-lg font-bold text-emerald-300 font-mono-tabular truncate">
                    {p ? MonitorModel.money(p.costUsd) : '—'}
                  </div>
                  <div className="text-[11px] text-slate-400 mt-0.5">今日费用 · USD</div>
                </div>
              </div>

              {sharePct !== null && (
                <div className="space-y-1 pt-1 border-t border-white/[0.06]">
                  <div className="flex items-center justify-between text-[11px] text-slate-400 tabular-nums">
                    <span>今日设备占比</span>
                    <span className="font-mono-tabular text-slate-200">
                      {sharePct >= 0.1 || sharePct === 0 ? `${sharePct.toFixed(1)}%` : '<0.1%'}
                    </span>
                  </div>
                  <ProgressMeter percent={sharePct} tone="sky" heightClass="h-1" />
                </div>
              )}
            </div>

            <div className="flex items-center justify-between text-[11px] text-slate-400 tabular-nums flex-wrap gap-2">
              <span>
                采集 <span className="font-mono-tabular">{formatShortTime(device.updatedAt)}</span>
                <span className="mx-1.5">·</span>
                接收 <span className="font-mono-tabular">{formatShortTime(device.receivedAt)}</span>
              </span>
              {monthPeriod && (
                <span className="text-slate-300">
                  本月 <span className="font-mono-tabular">{MonitorModel.compact(monthPeriod.totalTokens)}</span>
                </span>
              )}
            </div>

            <button
              type="button"
              onClick={() => onSelectDevice(device.deviceId)}
              data-device={device.deviceId}
              className="w-full min-h-[44px] px-3.5 rounded-2xl bg-sky-400/10 hover:bg-sky-400/18 border border-sky-400/20 flex items-center justify-between text-xs font-semibold text-sky-200 hover:text-white active:scale-[0.985] transition-all"
            >
              <span>查看此设备用量明细</span>
              <ArrowRight className="w-4 h-4 text-sky-300 shrink-0" aria-hidden="true" />
            </button>
          </section>
        );
      })}
    </div>
  );
};
