import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, Check, Laptop, Search, Server, X } from 'lucide-react';
import { DeviceIcon } from './DeviceIcon';
import { MonitorModel } from '../model/monitorModel';
import type { MonitorStats, PageId, PeriodId } from '../types/monitor';
import { formatShortTime, PERIOD_LABELS } from '../utils/formatters';

interface DevicePickerDialogProps {
  open: boolean;
  stats: MonitorStats | null;
  selectedDeviceId: string;
  period: PeriodId;
  page: PageId;
  now: number;
  isSelectedDeviceRemoved: boolean;
  onSelectDevice: (deviceId: string) => void;
  onOpenDevicesPage: () => void;
  onClose: () => void;
}

export const DevicePickerDialog: React.FC<DevicePickerDialogProps> = ({
  open,
  stats,
  selectedDeviceId,
  period,
  page,
  now,
  isSelectedDeviceRemoved,
  onSelectDevice,
  onOpenDevicesPage,
  onClose,
}) => {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [search, setSearch] = useState('');

  useEffect(() => {
    const el = dialogRef.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
    if (!open) setSearch('');
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handleBack = () => onClose();
    window.addEventListener('tm-close-device-picker', handleBack);
    return () => window.removeEventListener('tm-close-device-picker', handleBack);
  }, [open, onClose]);

  const devices = stats?.devices || [];
  const activeCount = devices.filter((d) => !d.stale).length;

  const fleetSummary = useMemo(() => {
    if (!stats) return null;
    const sel = MonitorModel.select(stats, '', period, now);
    const providers = sel.providers || [];
    const collectedLimits = providers.filter((p) => MonitorModel.limitHasHistory(p)).length;
    return {
      periodData: sel.period,
      providersCount: providers.length,
      collectedLimits,
    };
  }, [stats, period, now]);

  const sortedDevices = useMemo(() => {
    if (!stats) return [];
    const kw = search.trim().toLocaleLowerCase();
    return devices
      .map((dev, index) => {
        const sel = MonitorModel.select(stats, dev.deviceId, period, now);
        const tokens = sel.period ? MonitorModel.count(sel.period.totalTokens) : null;
        const cost = sel.period ? MonitorModel.numeric(sel.period.costUsd) : null;
        const providers = sel.providers || [];
        const collectedLimits = providers.filter((p) => MonitorModel.limitHasHistory(p)).length;
        return {
          device: dev,
          tokens,
          cost,
          expired: sel.expired,
          providersCount: providers.length,
          collectedLimits,
          index,
        };
      })
      .filter(({ device }) => {
        if (!kw) return true;
        return [device.hostname, device.deviceId, device.osName, device.platform]
          .some((field) => String(field || '').toLocaleLowerCase().includes(kw));
      })
      .sort((a, b) => {
        if (Boolean(a.device.stale) !== Boolean(b.device.stale)) {
          return Number(Boolean(a.device.stale)) - Number(Boolean(b.device.stale));
        }
        const tokDiff = (b.tokens ?? -1) - (a.tokens ?? -1);
        if (tokDiff !== 0) return tokDiff;
        return a.index - b.index;
      });
  }, [stats, devices, period, now, search]);

  const choose = (deviceId: string) => {
    onSelectDevice(deviceId);
    onClose();
  };

  return (
    <dialog
      ref={dialogRef}
      id="device-picker-dialog"
      aria-labelledby="device-picker-title"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === dialogRef.current) onClose();
      }}
      className="device-picker-sheet mt-auto mb-0 mx-auto w-full max-w-[440px] sm:my-auto sm:w-[calc(100%_-_2rem)] sm:max-w-[420px] max-h-[82dvh] rounded-t-3xl sm:rounded-3xl border border-white/15 bg-[#0E1520] text-slate-100 shadow-2xl p-0 overflow-hidden backdrop:bg-black/75 backdrop:backdrop-blur-sm"
    >
      <div className="flex flex-col max-h-[82dvh]">
        {/* Header */}
        <div className="px-5 pt-4 pb-3 border-b border-white/10 flex items-start justify-between gap-3 shrink-0">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Laptop className="w-4 h-4 text-sky-400 shrink-0" />
              <h2 id="device-picker-title" className="text-base font-bold text-white">
                选择统计设备
              </h2>
            </div>
            <p className="text-xs text-slate-400 mt-0.5 font-mono-tabular">
              共 {devices.length} 台设备 · {activeCount} 台近期上报
            </p>
          </div>
          <button
            type="button"
            aria-label="关闭设备选择"
            onClick={onClose}
            className="min-h-[40px] min-w-[40px] -mr-1.5 -mt-1 rounded-full flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/[0.06] transition-colors shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Search when many devices */}
        {(devices.length > 4 || search !== '') && (
          <div className="px-4 pt-3 shrink-0">
            <div className="relative flex items-center">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3.5 pointer-events-none" />
              <input
                type="search"
                data-device-search="true"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="搜索设备名称、ID 或系统…"
                autoComplete="off"
                className="w-full min-h-[38px] pl-9 pr-9 py-1.5 rounded-2xl glass-inset text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-sky-400/60 transition-colors"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch('')}
                  aria-label="清除设备搜索"
                  className="w-8 h-8 flex items-center justify-center absolute right-1 text-slate-400 hover:text-slate-200 rounded-lg"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
        )}

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-4 py-3.5 space-y-2.5">
          {isSelectedDeviceRemoved && (
            <div className="rounded-2xl bg-amber-500/12 border border-amber-400/30 p-3 flex items-center justify-between gap-2 text-xs text-amber-200">
              <span className="min-w-0 truncate">
                当前所选设备 <span className="font-mono-tabular">{selectedDeviceId}</span> 已从 Hub 移除
              </span>
              <button
                type="button"
                onClick={() => choose('')}
                className="px-2.5 py-1 rounded-xl bg-amber-400/20 border border-amber-300/30 text-[11px] font-semibold text-amber-100 shrink-0"
              >
                切回全部
              </button>
            </div>
          )}

          {/* All Devices summary option */}
          {!search.trim() && (
            <button
              type="button"
              data-device-option=""
              aria-pressed={selectedDeviceId === ''}
              onClick={() => choose('')}
              className={`w-full text-left rounded-2xl p-3.5 border transition-colors ${
                selectedDeviceId === ''
                  ? 'bg-sky-500/12 border-sky-400/45 shadow-[0_0_20px_rgba(56,189,248,0.12)]'
                  : 'bg-white/[0.025] hover:bg-white/[0.055] border-white/[0.08]'
              }`}
            >
              <div className="flex items-center justify-between gap-2.5">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-xl bg-sky-500/15 border border-sky-400/30 flex items-center justify-center text-sky-300 shrink-0">
                    <Server className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-white flex items-center gap-2">
                      <span>全部设备</span>
                      <span className="px-1.5 py-0.5 rounded-full bg-white/[0.06] text-[10px] font-mono-tabular text-slate-300">
                        {devices.length} 台汇总
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400 mt-0.5 font-mono-tabular">
                      {page === 'limits'
                        ? fleetSummary
                          ? `共 ${fleetSummary.providersCount} 个账户 · ${fleetSummary.collectedLimits} 项有采集`
                          : '汇总所有来源设备额度'
                        : fleetSummary?.periodData
                        ? `${PERIOD_LABELS[period]} ${MonitorModel.compact(fleetSummary.periodData.totalTokens)} · ${MonitorModel.money(fleetSummary.periodData.costUsd)}`
                        : `${PERIOD_LABELS[period]}暂无汇总数据`}
                    </p>
                  </div>
                </div>
                {selectedDeviceId === '' && (
                  <span className="w-6 h-6 rounded-full bg-sky-400/20 border border-sky-400/40 flex items-center justify-center text-sky-300 shrink-0">
                    <Check className="w-3.5 h-3.5" />
                  </span>
                )}
              </div>
            </button>
          )}

          {/* Individual devices */}
          {sortedDevices.length > 0 ? (
            <div className="space-y-2">
              {sortedDevices.map(
                ({
                  device: dev,
                  tokens,
                  cost,
                  expired,
                  providersCount,
                  collectedLimits,
                }) => {
                  const isSelected = selectedDeviceId === dev.deviceId;
                  const meta = [
                    dev.osName || dev.platform,
                    dev.agentVersion ? `v${dev.agentVersion}` : '',
                  ]
                    .filter(Boolean)
                    .join(' · ');

                  return (
                    <button
                      key={dev.deviceId}
                      type="button"
                      data-device-option={dev.deviceId}
                      aria-pressed={isSelected}
                      onClick={() => choose(dev.deviceId)}
                      className={`w-full text-left rounded-2xl p-3.5 border transition-colors ${
                        isSelected
                          ? 'bg-sky-500/12 border-sky-400/45 shadow-[0_0_20px_rgba(56,189,248,0.12)]'
                          : 'bg-white/[0.025] hover:bg-white/[0.055] border-white/[0.08]'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2.5">
                        <div className="flex items-start gap-3 min-w-0 flex-1">
                          <div className="w-9 h-9 rounded-xl bg-white/[0.04] border border-white/[0.08] flex items-center justify-center text-sky-300 shrink-0 mt-0.5">
                            <DeviceIcon kind={dev.deviceKind} className="w-4 h-4" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5 min-w-0">
                              <span className="text-sm font-semibold text-slate-100 truncate">
                                {dev.hostname || dev.deviceId}
                              </span>
                            </div>
                            <p className="text-[11px] font-mono-tabular text-slate-400 truncate mt-0.5">
                              {dev.deviceId}
                              {meta ? ` · ${meta}` : ''}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          <span
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium border ${
                              dev.stale
                                ? 'bg-amber-500/10 border-amber-400/25 text-amber-300'
                                : 'bg-emerald-500/10 border-emerald-400/25 text-emerald-300'
                            }`}
                          >
                            <i
                              aria-hidden="true"
                              className={`w-1.5 h-1.5 rounded-full ${
                                dev.stale ? 'bg-amber-400' : 'bg-emerald-400'
                              }`}
                            />
                            <span>{dev.stale ? '过期' : '在线'}</span>
                          </span>
                          {isSelected && (
                            <span className="w-5 h-5 rounded-full bg-sky-400/20 border border-sky-400/40 flex items-center justify-center text-sky-300">
                              <Check className="w-3 h-3" />
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="mt-2.5 pt-2 border-t border-white/[0.06] flex items-center justify-between gap-2 text-[11px] font-mono-tabular">
                        <span className="text-slate-300">
                          {page === 'limits' ? (
                            providersCount > 0 ? (
                              <>
                                额度账户 {providersCount}
                                <span className="text-slate-400"> · 已采集 {collectedLimits}</span>
                              </>
                            ) : (
                              <span className="text-slate-400">暂无额度上报</span>
                            )
                          ) : tokens !== null ? (
                            <>
                              {PERIOD_LABELS[period]}{' '}
                              <strong className="text-white">{MonitorModel.compact(tokens)}</strong>
                              {cost !== null && (
                                <span className="text-emerald-300 ml-2">
                                  {MonitorModel.money(cost)}
                                </span>
                              )}
                            </>
                          ) : (
                            <span className="text-slate-400">
                              {expired ? '周期已结束' : '暂无读数'}
                            </span>
                          )}
                        </span>
                        <span className="text-[10px] text-slate-400 shrink-0">
                          {formatShortTime(dev.updatedAt)}
                        </span>
                      </div>
                    </button>
                  );
                }
              )}
            </div>
          ) : (
            <p className="text-center text-xs text-slate-400 py-5">
              {search.trim() ? '没有匹配的设备' : '暂无已上报的采集设备'}
            </p>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-white/10 bg-black/20 shrink-0">
          <button
            type="button"
            onClick={() => {
              onClose();
              onOpenDevicesPage();
            }}
            className="w-full min-h-[38px] rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] text-xs font-medium text-sky-300 flex items-center justify-center gap-1.5 transition-colors"
          >
            <span>查看全部设备详细状态</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </dialog>
  );
};
