import { RefreshCw, ShieldCheck } from 'lucide-react';
import { UpdateDownloadPanel } from './UpdateDownloadPanel';
import type { AppUpdateState } from '../types/monitor';
import { formatFullTime } from '../utils/formatters';
import { DetailsDisclosure, InlineAlert, SectionHeader, ToggleSwitch } from './ui/Primitives';

interface AppUpdateCardProps {
  state: AppUpdateState;
  onSimulateCheck?: () => void;
  onSimulateAutoToggle?: (enabled: boolean) => void;
}

export function AppUpdateCard({ state, onSimulateCheck, onSimulateAutoToggle }: AppUpdateCardProps) {
  const nativeSupported = Boolean(window.HubNative?.checkForUpdates);
  const supported = nativeSupported || Boolean(onSimulateCheck);
  const summary = state.checking
    ? '正在检查 GitHub 最新正式版…'
    : state.available
      ? `发现新版本 ${state.latestVersion}`
      : state.checkedAt && state.latestVersion
        ? '当前已是最新版本'
        : '尚未检查更新';

  const handleCheck = () => {
    if (window.HubNative?.checkForUpdates) {
      window.HubNative.checkForUpdates();
    } else {
      onSimulateCheck?.();
    }
  };

  const handleAutoToggle = (checked: boolean) => {
    if (window.HubNative?.automaticUpdates) {
      window.HubNative.automaticUpdates(checked);
    } else {
      onSimulateAutoToggle?.(checked);
    }
  };

  return (
    <section
      id="app-update"
      className="glass-panel rounded-3xl p-4 sm:p-5 space-y-3.5 scroll-mt-20"
    >
      <SectionHeader
        icon={
          <span className="w-9 h-9 rounded-xl bg-sky-500/12 border border-sky-400/25 flex items-center justify-center text-sky-300">
            <ShieldCheck className="w-4 h-4" />
          </span>
        }
        title="软件更新"
        subtitle={
          <span className="tabular-nums">当前版本 {state.currentVersion || '—'}</span>
        }
        action={
          <button
            id="check-app-update"
            type="button"
            disabled={!supported || state.checking}
            onClick={handleCheck}
            className="shrink-0 min-h-[44px] rounded-xl bg-sky-500/12 hover:bg-sky-500/20 active:scale-[0.98] border border-sky-400/25 px-3.5 text-xs font-semibold text-sky-200 flex items-center gap-1.5 transition-all disabled:opacity-45 whitespace-nowrap"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${state.checking ? 'animate-spin' : ''}`} />
            <span>{state.checking ? '检查中' : '检查更新'}</span>
          </button>
        }
      />

      <div className="flex items-center justify-between gap-3 border-t border-white/8 pt-3">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold text-slate-100">自动检查更新</p>
          <p className="text-[11px] text-slate-400 mt-0.5 leading-snug">
            打开应用时检查，前台每 12 小时检查
          </p>
        </div>
        <ToggleSwitch
          id="automatic-app-updates"
          checked={state.automatic}
          disabled={!supported}
          onChange={handleAutoToggle}
          ariaLabel="自动检查更新"
        />
      </div>

      <div className="glass-inset rounded-2xl px-3.5 py-2.5 space-y-1">
        <p
          id="app-update-status"
          role="status"
          aria-live="polite"
          className={`text-xs font-medium ${
            state.available ? 'text-emerald-300' : 'text-slate-200'
          }`}
        >
          {supported ? summary : '请在 Android App 中检查更新'}
        </p>
        {state.checkedAt > 0 && (
          <p className="text-[11px] text-slate-400 tabular-nums">
            上次检查 {formatFullTime(state.checkedAt)}
          </p>
        )}
      </div>

      {state.error && (
        <InlineAlert id="app-update-error" tone="amber" role="alert">
          {state.error}
        </InlineAlert>
      )}

      {state.available && (
        <DetailsDisclosure
          className="glass-inset rounded-2xl px-3.5"
          summary={
            <span className="font-semibold text-sky-200 truncate">
              更新说明 · {state.name || state.latestVersion}
            </span>
          }
          bodyClassName="pt-2.5 pb-3 border-t border-white/8"
        >
          <p className="whitespace-pre-wrap break-words max-h-64 overflow-y-auto text-xs leading-relaxed text-slate-200 select-text">
            {state.notes || '此版本未提供更新说明。'}
          </p>
        </DetailsDisclosure>
      )}

      {(state.available || state.download.phase !== 'idle') && <UpdateDownloadPanel state={state} />}

      <p className="text-[11px] text-slate-400 leading-relaxed pt-1 border-t border-white/6">
        更新来源：AoXIUy/token-monitor-For-Android · GitHub Releases。应用内下载并校验，安装时由系统确认。
      </p>
    </section>
  );
}
