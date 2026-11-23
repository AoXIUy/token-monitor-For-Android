import React, { useMemo, useState } from 'react';
import { RefreshCw, ShieldAlert, Smartphone } from 'lucide-react';
import {
  isAgAccountAbnormal,
  selectVisibleAgManagerAccounts,
} from '../agManagerState.js';
import type { AgManagerAccountSummary, AgManagerModelQuota, AgManagerState } from '../types/monitor';
import { formatRelativeCountdown, formatShortTime } from '../utils/formatters';
import {
  DetailsDisclosure,
  EmptyState,
  InlineAlert,
  ProgressMeter,
  SearchField,
  SegmentedControl,
  type MeterTone,
} from './ui/Primitives';

interface AntigravityManagerViewProps {
  state: AgManagerState;
  connected: boolean;
  onRefreshSnapshot: () => void;
  onFilterChange: (patch: {
    deviceId?: string;
    tierFilter?: 'all' | 'PRO' | 'ULTRA' | 'FREE';
    statusFilter?: 'all' | 'available' | 'abnormal';
    searchQuery?: string;
  }) => void;
}

const TIER_BADGES: Record<string, string> = {
  ULTRA: 'bg-amber-400/15 text-amber-200 border-amber-400/35',
  PRO: 'bg-sky-400/15 text-sky-200 border-sky-400/35',
  FREE: 'bg-white/[0.06] text-slate-300 border-white/15',
};

function meterToneForPercent(pct: number): MeterTone {
  if (pct <= 20) return 'danger';
  if (pct <= 50) return 'amber';
  return 'emerald';
}

function summarizeAccountGroups(models: AgManagerModelQuota[]): Array<{ label: string; model: AgManagerModelQuota }> {
  const pickMin = (list: AgManagerModelQuota[]) => list.reduce<AgManagerModelQuota | null>(
    (min, cur) => (!min || cur.percentage < min.percentage ? cur : min),
    null,
  );
  const claude = pickMin(models.filter(m => /claude|gpt/i.test(m.name)));
  const geminiPro = pickMin(models.filter(m => /gemini/i.test(m.name) && /pro|high|low/i.test(m.name) && !/flash|image/i.test(m.name)));
  const geminiFlash = pickMin(models.filter(m => /flash|image/i.test(m.name)));
  const groups: Array<{ label: string; model: AgManagerModelQuota }> = [];
  if (claude) groups.push({ label: 'Claude / GPT', model: claude });
  if (geminiPro) groups.push({ label: 'Gemini Pro', model: geminiPro });
  if (geminiFlash) groups.push({ label: 'Gemini Flash', model: geminiFlash });
  if (groups.length === 0 && models.length > 0) {
    for (const m of models.slice(0, 3)) groups.push({ label: m.displayName || m.name, model: m });
  }
  return groups;
}

function AccountCard({
  account,
  activeClients,
}: {
  account: AgManagerAccountSummary;
  activeClients: string[];
}) {
  const [expanded, setExpanded] = useState(false);
  const abnormal = isAgAccountAbnormal(account);
  const models = account.quota?.models || [];
  const groups = useMemo(() => summarizeAccountGroups(models), [models]);
  const tierClass = TIER_BADGES[account.subscriptionTier] || TIER_BADGES.FREE;

  return (
    <article
      data-agm-account={account.id}
      className={`glass-panel rounded-2xl p-3.5 space-y-2.5 ${abnormal ? 'border-rose-400/25' : ''}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-sm font-semibold text-slate-100 truncate">{account.email}</span>
            <span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded-md border ${tierClass}`}>
              {account.subscriptionTier || 'FREE'}
            </span>
          </div>
          {account.name && account.name !== account.email && (
            <p className="text-[11px] text-slate-400 truncate mt-0.5">{account.name}</p>
          )}
        </div>
        <div className="flex items-center gap-1 flex-wrap justify-end shrink-0">
          {activeClients.map(client => (
            <span
              key={client}
              className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-emerald-400/18 text-emerald-200 border border-emerald-400/35"
            >
              {client}
            </span>
          ))}
          {account.hasDeviceProfile && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-violet-400/15 text-violet-200 border border-violet-400/30">
              独立指纹
            </span>
          )}
        </div>
      </div>

      {abnormal && (
        <InlineAlert tone={account.banned || account.disabled ? 'rose' : 'amber'} className="py-2 px-2.5 text-[11px]">
          {account.banned
            ? '账号已被封禁'
            : account.validationBlocked
              ? (account.validationMessage || '需要 Google 验证')
              : account.disabled
                ? (account.disabledReason || '已在桌面端停用')
                : (account.quota?.forbiddenReason || '接口返回 403')}
        </InlineAlert>
      )}

      {groups.length > 0 ? (
        <div className="space-y-2 pt-0.5">
          {groups.map(group => {
            const pct = group.model.percentage;
            const reset = formatRelativeCountdown(group.model.resetTime);
            return (
              <div key={group.label} className="space-y-1">
                <div className="flex items-center justify-between gap-2 text-[11px]">
                  <span className="text-slate-300 font-medium truncate">{group.label}</span>
                  <span className="inline-flex items-center gap-2 shrink-0 tabular-nums">
                    {reset && <span className="text-slate-400">{reset}</span>}
                    <span className={`font-semibold ${pct <= 20 ? 'text-rose-300' : pct <= 50 ? 'text-amber-300' : 'text-emerald-300'}`}>
                      {pct}%
                    </span>
                  </span>
                </div>
                <ProgressMeter percent={pct} tone={meterToneForPercent(pct)} ariaLabel={`${group.label} 剩余额度`} />
              </div>
            );
          })}
        </div>
      ) : (
        <p className="text-xs text-slate-400 py-1">暂无模型额度快照</p>
      )}

      {models.length > 0 && (
        <DetailsDisclosure
          open={expanded}
          onToggle={(event) => setExpanded((event.currentTarget as HTMLDetailsElement).open)}
          summary={expanded ? '收起全部模型' : `查看全部模型 (${models.length})`}
          summaryClassName="min-h-[36px] py-1 text-[11px] text-slate-400"
          bodyClassName="pt-1 space-y-2 border-t border-white/8"
        >
          {models.map(model => (
            <div key={model.name} className="space-y-1">
              <div className="flex items-center justify-between gap-2 text-[11px]">
                <span className="text-slate-300 truncate">{model.displayName || model.name}</span>
                <span className="inline-flex items-center gap-2 shrink-0 tabular-nums text-slate-400">
                  {model.resetTime && <span>{formatRelativeCountdown(model.resetTime)}</span>}
                  <span className="font-semibold text-slate-200">{model.percentage}%</span>
                </span>
              </div>
              <ProgressMeter percent={model.percentage} tone={meterToneForPercent(model.percentage)} heightClass="h-1" />
            </div>
          ))}
        </DetailsDisclosure>
      )}
    </article>
  );
}

export const AntigravityManagerView: React.FC<AntigravityManagerViewProps> = ({
  state,
  connected,
  onRefreshSnapshot,
  onFilterChange,
}) => {
  const { activeDevice, visibleAccounts, counts, activeByAccountKey } = useMemo(
    () => selectVisibleAgManagerAccounts(state),
    [state],
  );

  if (!connected) {
    return (
      <EmptyState
        icon={<Smartphone className="w-6 h-6" />}
        title="未连接 Hub"
        description="连接电脑端 Hub 后，可在此只读查看桌面端 Antigravity 账号池与各客户端当前切换状态。"
        compact
      />
    );
  }

  return (
    <div id="ag-manager-view" className="space-y-3">
      <div className="glass-panel rounded-2xl p-3 space-y-2.5">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-sm font-semibold text-slate-100">Antigravity 账号池</h2>
              <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-white/[0.06] border border-white/10 text-slate-300">
                仅手机端只读查看
              </span>
            </div>
            <p className="text-[11px] text-slate-400 mt-0.5">
              {activeDevice ? (
                <>
                  共 {counts.total} 个（可用 {counts.available} · 异常 {counts.abnormal}）·{' '}
                  {activeDevice.settings.autoRefresh
                    ? `自动刷新 ${activeDevice.settings.refreshIntervalMinutes}m`
                    : '自动刷新已关闭'}
                  {activeDevice.updatedAt ? ` · 更新于 ${formatShortTime(Date.parse(activeDevice.updatedAt))}` : ''}
                </>
              ) : '尚未收到桌面端账号池快照'}
            </p>
          </div>
          <button
            type="button"
            id="ag-manager-refresh"
            onClick={onRefreshSnapshot}
            disabled={state.loading}
            className="min-h-[38px] px-3 rounded-xl glass-inset text-xs font-medium text-sky-200 hover:border-sky-400/40 active:scale-95 transition-all inline-flex items-center gap-1.5 disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${state.loading ? 'animate-spin' : ''}`} />
            <span>{state.loading ? '读取中…' : '刷新快照'}</span>
          </button>
        </div>

        {state.devices.length > 1 && (
          <SegmentedControl
            id="ag-manager-devices"
            size="sm"
            ariaLabel="选择主机"
            value={activeDevice?.deviceId || ''}
            onChange={(deviceId) => onFilterChange({ deviceId })}
            options={state.devices.map(dev => ({
              value: dev.deviceId,
              label: dev.hostname || dev.deviceId,
            }))}
          />
        )}

        <div className="flex items-center gap-2 flex-wrap">
          <SegmentedControl<'all' | 'available' | 'abnormal'>
            size="sm"
            ariaLabel="按状态筛选"
            value={state.statusFilter}
            onChange={(statusFilter) => onFilterChange({ statusFilter })}
            options={[
              { value: 'all', label: `全部 (${counts.total})` },
              { value: 'available', label: `可用 (${counts.available})` },
              { value: 'abnormal', label: `异常 (${counts.abnormal})` },
            ]}
          />
          <SegmentedControl<'all' | 'ULTRA' | 'PRO' | 'FREE'>
            size="sm"
            ariaLabel="按套餐筛选"
            value={state.tierFilter}
            onChange={(tierFilter) => onFilterChange({ tierFilter })}
            options={[
              { value: 'all', label: '全套餐' },
              { value: 'ULTRA', label: 'ULTRA' },
              { value: 'PRO', label: 'PRO' },
              { value: 'FREE', label: 'FREE' },
            ]}
          />
        </div>

        <SearchField
          id="ag-manager-search"
          ariaLabel="搜索 Antigravity 账号"
          placeholder="搜索邮箱、备注或模型…"
          value={state.searchQuery}
          onChange={(searchQuery) => onFilterChange({ searchQuery })}
        />
      </div>

      {state.error && (
        <InlineAlert
          tone={state.errorCode === 'unsupported_hub' ? 'sky' : 'amber'}
          icon={<ShieldAlert className="w-4 h-4" />}
        >
          {state.error}
        </InlineAlert>
      )}

      {visibleAccounts.length > 0 ? (
        <div className="space-y-2.5">
          {visibleAccounts.map(account => (
            <AccountCard
              key={account.id}
              account={account}
              activeClients={activeByAccountKey[account.id] || []}
            />
          ))}
        </div>
      ) : !state.loading && !state.error ? (
        <EmptyState
          compact
          icon={<Smartphone className="w-5 h-5" />}
          title={activeDevice && counts.total > 0 ? '无匹配账号' : '暂无账号池快照'}
          description={
            activeDevice && counts.total > 0
              ? '尝试清空搜索关键字或切换状态筛选。'
              : '请在桌面端 Token Monitor 的独立 Antigravity 账号管理窗口中添加账号并启用同步快照。'
          }
        />
      ) : null}
    </div>
  );
};
