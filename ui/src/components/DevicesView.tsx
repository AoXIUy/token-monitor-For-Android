import React, { useEffect, useRef, useState } from 'react';
import { ArrowRight, Check, Copy, HardDrive } from 'lucide-react';
import { DeviceIcon } from './DeviceIcon';
import { MonitorModel } from '../model/monitorModel';
import { MonitorStats } from '../types/monitor';
import { copyTextToClipboard, formatShortTime } from '../utils/formatters';

interface DevicesViewProps {
  stats: MonitorStats;
  onSelectDevice: (deviceId: string) => void;
}

export const DevicesView: React.FC<DevicesViewProps> = ({ stats, onSelectDevice }) => {
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const copyTimer = useRef<number | null>(null);
  const devices = stats.devices || [];

  useEffect(() => {
    return () => {
      if (copyTimer.current !== null) window.clearTimeout(copyTimer.current);
    };
  }, []);

  const handleCopyId = async (deviceId: string) => {
    const ok = await copyTextToClipboard(deviceId);
    if (!ok) return;
    if (copyTimer.current !== null) window.clearTimeout(copyTimer.current);
    setCopiedId(deviceId);
    copyTimer.current = window.setTimeout(() => {
      setCopiedId((prev) => (prev === deviceId ? null : prev));
      copyTimer.current = null;
    }, 1500);
  };

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
        const monthPeriod = MonitorModel.select(stats, device.deviceId, 'month').period;
        const metaParts = [
          device.osName || device.platform,
          device.osVersion,
          device.agentVersion ? `Agent v${device.agentVersion}` : '',
        ].filter(Boolean);
        const isCopied = copiedId === device.deviceId;

        return (
          <section
            key={device.deviceId}
            className="glass-panel-interactive rounded-3xl p-5"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-2xl bg-sky-500/12 border border-sky-400/25 flex items-center justify-center text-sky-300 shrink-0 shadow-[0_0_16px_rgba(56,189,248,0.12)]">
                  <DeviceIcon kind={device.deviceKind} className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-sm font-semibold text-slate-100 truncate">
                    {device.hostname || device.deviceId}
                  </h3>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className="text-[11px] font-mono-tabular text-slate-400 truncate">
                      {device.deviceId}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleCopyId(device.deviceId)}
                      aria-label={`复制设备 ID ${device.deviceId}`}
                      className="inline-flex items-center gap-1 min-h-[26px] px-2 py-0.5 rounded-lg bg-white/[0.04] hover:bg-sky-500/15 border border-white/[0.08] text-[10px] text-slate-300 hover:text-sky-200 transition-colors shrink-0"
                    >
                      {isCopied ? (
                        <>
                          <Check className="w-3 h-3 text-emerald-400" />
                          <span className="text-emerald-300">已复制</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3 h-3" />
                          <span>复制</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>

              <span
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium shrink-0 border ${
                  device.stale
                    ? 'bg-amber-500/10 border-amber-400/25 text-amber-300'
                    : 'bg-emerald-500/10 border-emerald-400/25 text-emerald-300'
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
              <p className="text-xs text-slate-300/80 mt-2.5">{metaParts.join(' · ')}</p>
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

            <div className="flex items-center justify-between text-[11px] text-slate-400 font-mono-tabular py-1 flex-wrap gap-2">
              <span>
                采集 {formatShortTime(device.updatedAt)} · 接收 {formatShortTime(device.receivedAt)}
              </span>
              {monthPeriod && (
                <span className="text-slate-300">
                  本月 {MonitorModel.compact(monthPeriod.totalTokens)}
                </span>
              )}
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
