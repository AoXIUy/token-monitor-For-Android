import React from 'react';
import { ArrowRight, Cpu, HardDrive, Laptop } from 'lucide-react';
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
      <div className="glass-panel rounded-3xl p-8 text-center my-4">
        <HardDrive className="w-8 h-8 text-sky-400/70 mx-auto mb-3" />
        <p className="text-base font-semibold text-slate-100 mb-1.5">还没有采集设备</p>
        <p className="text-xs text-slate-400 leading-relaxed">
          在电脑上启动 Token Monitor 并连接到同一个 Hub。
        </p>
      </div>
    );
  }

  const activeCount = devices.filter((device) => !device.stale).length;

  return (
    <div className="space-y-3.5">
      <div className="flex items-center justify-between px-1 text-xs text-slate-400">
        <span>
          共 <strong className="text-slate-200 font-mono-tabular">{devices.length}</strong> 台设备
          <span className="mx-1.5">·</span>
          <strong className="text-emerald-400 font-mono-tabular">{activeCount}</strong> 台近期上报
        </span>
        <span className="text-[11px] text-slate-400">轻触设备下钻统计</span>
      </div>

      {devices.map((device) => {
        const p = MonitorModel.select(stats, device.deviceId, 'today').period;
        const metaParts = [
          device.osName || device.platform,
          device.osVersion,
          device.agentVersion ? `Agent v${device.agentVersion}` : '',
        ].filter(Boolean);

        return (
          <section
            key={device.deviceId}
            className="glass-panel rounded-3xl p-4.5 transition-all duration-150 hover:border-white/15"
          >

            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-2xl bg-sky-500/12 border border-sky-400/25 flex items-center justify-center text-sky-300 shrink-0">
                  {device.osName?.toLowerCase().includes('linux') ? (
                    <Cpu className="w-5 h-5" />
                  ) : (
                    <Laptop className="w-5 h-5" />
                  )}
                </div>
                <div className="min-w-0">
                  <h3 className="text-sm font-semibold text-slate-100 truncate">
                    {device.hostname || device.deviceId}
                  </h3>
                  <p className="text-[11px] font-mono-tabular text-slate-400 truncate mt-0.5">
                    {device.deviceId}
                  </p>
                </div>
              </div>

              <span
                className={`text-[11px] font-medium shrink-0 ${
                  device.stale ? 'text-amber-300' : 'text-emerald-300'
                }`}
              >
                {device.stale ? '上报过期' : '近期上报'}
              </span>
            </div>

            {metaParts.length > 0 && (
              <p className="text-xs text-slate-300/80 mt-2.5">
                {metaParts.join(' · ')}
              </p>
            )}

            <div className="glass-inset rounded-2xl p-3.5 my-3 grid grid-cols-2 gap-3">
              <div>
                <div className="text-lg font-bold text-slate-50 font-mono-tabular">
                  {p ? MonitorModel.compact(p.totalTokens) : '—'}
                </div>
                <div className="text-[11px] text-slate-400 mt-0.5">今日 Tokens</div>
              </div>
              <div>
                <div className="text-lg font-bold text-emerald-300 font-mono-tabular">
                  {p ? MonitorModel.money(p.costUsd) : '—'}
                </div>
                <div className="text-[11px] text-slate-400 mt-0.5">今日费用 · USD</div>
              </div>
            </div>

            <div className="flex items-center justify-between text-[11px] text-slate-400 font-mono-tabular py-1">
              <span>采集 {formatShortTime(device.updatedAt)}</span>
              <span>·</span>
              <span>接收 {formatShortTime(device.receivedAt)}</span>
            </div>

            <button
              type="button"
              onClick={() => onSelectDevice(device.deviceId)}
              data-device={device.deviceId}
              className="w-full min-h-[44px] mt-2 pt-2.5 border-t border-white/8 flex items-center justify-between text-xs font-semibold text-sky-300 hover:text-sky-200 transition-colors"
            >
              <span>查看此设备用量明细</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </section>
        );
      })}
    </div>
  );
};
