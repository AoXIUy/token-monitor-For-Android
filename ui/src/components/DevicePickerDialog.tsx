import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, Check, Laptop, Server, X } from 'lucide-react';
import { DeviceIcon } from './DeviceIcon';
import { InlineAlert, SearchField } from './ui/Primitives';
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
  const sheetRef = useRef<HTMLDivElement>(null);
  const [search, setSearch] = useState('');

  useEffect(() => {
    const el = dialogRef.current;
    if (!el) return;
    if (open && !el.open && el.isConnected) {
      el.showModal();
      // Move initial focus to sheet container so mobile showModal() does not highlight the X button.
      sheetRef.current?.focus({ preventScroll: true });
    }
    if (!open && el.open) el.close();
    if (!open) setSearch('');
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const handleBack = () => onClose();
    window.addEventListener('tm-close-device-picker', handleBack);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('tm-close-device-picker', handleBack);
    };
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
        return [device.hostname, device.deviceId, device.osName, device.platform].some((field) =>
          String(field || '').toLocaleLowerCase().includes(kw),
        );
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
      className="tm-dialog device-picker-sheet mt-auto mb-0 mx-auto w-full max-w-[460px] sm:my-auto sm:w-[calc(100%_-_2rem)] sm:max-w-[420px] max-h-[82dvh] rounded-t-3xl sm:rounded-3xl p-0 overflow-hidden overscroll-contain"
    >
      <div ref={sheetRef} tabIndex={-1} className="flex flex-col max-h-[82dvh] focus:outline-none">
        {/* Mobile bottom-sheet grabber */}
        <div
          aria-hidden="true"
          className="w-9 h-1 rounded-full bg-[var(--tm-border-strong)] mx-auto mt-2.5 sm:hidden shrink-0"
        />

        {/* Header */}
        <div className="px-5 pt-3.5 pb-3 border-b border-[var(--tm-border-default)] flex items-start justify-between gap-3 shrink-0">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Laptop className="w-4 h-4 text-[var(--tm-accent-text)] shrink-0" aria-hidden="true" />
              <h2 id="device-picker-title" className="text-base font-bold text-[var(--tm-text-primary)]">
                选择统计设备
              </h2>
            </div>
            <p className="text-xs text-[var(--tm-text-muted)] mt-0.5 tabular-nums">
              共 {devices.length} 台设备 · {activeCount} 台近期上报
            </p>
          </div>
          <button
            type="button"
            aria-label="关闭设备选择"
            onClick={onClose}
            className="min-h-[44px] min-w-[44px] -mr-2 -mt-1.5 rounded-full flex items-center justify-center text-[var(--tm-text-muted)] hover:text-[var(--tm-text-primary)] hover:bg-[var(--tm-bg-control-hover)] active:scale-95 transition-all shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Search when many devices */}
        {(devices.length > 4 || search !== '') && (
          <div className="px-4 pt-3 shrink-0">
            <SearchField
              value={search}
              onChange={setSearch}
              placeholder="搜索设备名称、ID 或系统…"
              ariaLabel="搜索设备名称、ID 或系统"
              clearAriaLabel="清除设备搜索"
              inputProps={{ 'data-device-search': 'true' }}
            />
          </div>
        )}

        {/* Body */}
        <div className="flex-1 overflow-y-auto overscroll-contain px-4 py-3.5 space-y-2.5">
          {isSelectedDeviceRemoved && (
            <InlineAlert
              tone="amber"
              action={
                <button
                  type="button"
                  onClick={() => choose('')}
                  className="min-h-[40px] px-3 rounded-xl bg-[var(--tm-warning-soft-bg)] border border-[var(--tm-warning-soft-border)] text-xs font-semibold text-[var(--tm-warning-text)] active:scale-[0.97] transition-all shrink-0 whitespace-nowrap"
                >
                  切回全部
                </button>
              }
            >
              <span className="break-words">
                当前所选设备 <span className="font-mono-tabular">{selectedDeviceId}</span> 已从 Hub 移除
              </span>
            </InlineAlert>
          )}

          {/* All Devices summary option */}
          {!search.trim() && (
            <button
              type="button"
              data-device-option=""
              aria-pressed={selectedDeviceId === ''}
              onClick={() => choose('')}
              className={`w-full text-left rounded-2xl p-3.5 border transition-all active:scale-[0.99] ${
                selectedDeviceId === ''
                  ? 'bg-[var(--tm-accent-soft-bg)] border-[var(--tm-accent-soft-border)]'
                  : 'bg-[var(--tm-bg-row)] hover:bg-[var(--tm-bg-row-hover)] border-[var(--tm-border-subtle)]'
              }`}
            >
              <div className="flex items-center justify-between gap-2.5">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-xl bg-[var(--tm-accent-soft-bg)] border border-[var(--tm-accent-soft-border)] flex items-center justify-center text-[var(--tm-accent-text)] shrink-0">
                    <Server className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-[var(--tm-text-primary)] flex items-center gap-2 flex-wrap">
                      <span>全部设备</span>
                      <span className="px-2 py-0.5 rounded-full bg-[var(--tm-bg-control)] text-[11px] tabular-nums text-[var(--tm-text-secondary)]">
                        {devices.length} 台汇总
                      </span>
                    </div>
                    <p className="text-[11.5px] text-[var(--tm-text-muted)] mt-0.5 tabular-nums">
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
                  <span className="w-6 h-6 rounded-full bg-[var(--tm-accent-soft-bg)] border border-[var(--tm-accent-soft-border)] flex items-center justify-center text-[var(--tm-accent-text)] shrink-0">
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
                      className={`w-full text-left rounded-2xl p-3.5 border transition-all active:scale-[0.99] ${
                        isSelected
                          ? 'bg-[var(--tm-accent-soft-bg)] border-[var(--tm-accent-soft-border)]'
                          : 'bg-[var(--tm-bg-row)] hover:bg-[var(--tm-bg-row-hover)] border-[var(--tm-border-subtle)]'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2.5">
                        <div className="flex items-start gap-3 min-w-0 flex-1">
                          <div className="w-9 h-9 rounded-xl bg-[var(--tm-bg-control)] border border-[var(--tm-border-subtle)] flex items-center justify-center text-[var(--tm-accent-text)] shrink-0 mt-0.5">
                            <DeviceIcon kind={dev.deviceKind} className="w-4 h-4" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5 min-w-0">
                              <span className="text-sm font-semibold text-[var(--tm-text-primary)] truncate">
                                {dev.hostname || dev.deviceId}
                              </span>
                            </div>
                            <p className="text-[11.5px] text-[var(--tm-text-muted)] truncate mt-0.5">
                              <span className="font-mono-tabular">{dev.deviceId}</span>
                              {meta ? ` · ${meta}` : ''}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          <span
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium border whitespace-nowrap ${
                              dev.stale
                                ? 'bg-[var(--tm-warning-soft-bg)] border-[var(--tm-warning-soft-border)] text-[var(--tm-warning-text)]'
                                : 'bg-[var(--tm-success-soft-bg)] border-[var(--tm-success-soft-border)] text-[var(--tm-success-text)]'
                            }`}
                          >
                            <i
                              aria-hidden="true"
                              className={`w-1.5 h-1.5 rounded-full ${
                                dev.stale ? 'bg-[var(--tm-warning)]' : 'bg-[var(--tm-success)]'
                              }`}
                            />
                            <span>{dev.stale ? '过期' : '在线'}</span>
                          </span>
                          {isSelected && (
                            <span className="w-5 h-5 rounded-full bg-[var(--tm-accent-soft-bg)] border border-[var(--tm-accent-soft-border)] flex items-center justify-center text-[var(--tm-accent-text)]">
                              <Check className="w-3 h-3" />
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="mt-2.5 pt-2 border-t border-[var(--tm-border-subtle)] flex items-center justify-between gap-2 text-[11.5px] tabular-nums">
                        <span className="text-[var(--tm-text-secondary)]">
                          {page === 'limits' ? (
                            providersCount > 0 ? (
                              <>
                                额度账户 {providersCount}
                                <span className="text-[var(--tm-text-muted)]"> · 已采集 {collectedLimits}</span>
                              </>
                            ) : (
                              <span className="text-[var(--tm-text-muted)]">暂无额度上报</span>
                            )
                          ) : tokens !== null ? (
                            <>
                              {PERIOD_LABELS[period]}{' '}
                              <strong className="font-mono-tabular text-[var(--tm-text-primary)]">
                                {MonitorModel.compact(tokens)}
                              </strong>
                              {cost !== null && (
                                <span className="font-mono-tabular text-[var(--tm-success-text)] ml-2">
                                  {MonitorModel.money(cost)}
                                </span>
                              )}
                            </>
                          ) : (
                            <span className="text-[var(--tm-text-muted)]">
                              {expired ? '周期已结束' : '暂无读数'}
                            </span>
                          )}
                        </span>
                        <span className="text-[11px] font-mono-tabular text-[var(--tm-text-muted)] shrink-0">
                          {formatShortTime(dev.updatedAt)}
                        </span>
                      </div>
                    </button>
                  );
                },
              )}
            </div>
          ) : (
            <p className="text-center text-xs text-[var(--tm-text-muted)] py-5">
              {search.trim() ? '没有匹配的设备' : '暂无已上报的采集设备'}
            </p>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-[var(--tm-border-default)] bg-[var(--tm-bg-inset)] shrink-0">
          <button
            type="button"
            onClick={() => {
              onClose();
              onOpenDevicesPage();
            }}
            className="w-full min-h-[44px] rounded-2xl bg-[var(--tm-bg-control)] hover:bg-[var(--tm-bg-control-hover)] border border-[var(--tm-border-default)] text-xs font-semibold text-[var(--tm-accent-text)] flex items-center justify-center gap-1.5 active:scale-[0.985] transition-all"
          >
            <span>查看全部设备详细状态</span>
            <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
          </button>
        </div>
      </div>
    </dialog>
  );
};
