import { RefreshCw, ShieldCheck } from 'lucide-react';
import { UpdateDownloadPanel } from './UpdateDownloadPanel';
import type { AppUpdateState } from '../types/monitor';

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
    <section id="app-update" className="glass-panel rounded-3xl p-5 space-y-3.5 scroll-mt-20">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-9 h-9 rounded-xl bg-sky-500/12 border border-sky-400/25 flex items-center justify-center text-sky-300 shrink-0">
            <ShieldCheck className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-slate-100">软件更新</h3>
            <p className="text-xs text-slate-400 mt-0.5 font-mono-tabular">
              当前版本 {state.currentVersion || '—'}
            </p>
          </div>
        </div>
        <button
          id="check-app-update"
          type="button"
          disabled={!supported || state.checking}
          onClick={handleCheck}
          className="shrink-0 min-h-[44px] rounded-xl bg-sky-500/10 hover:bg-sky-500/18 border border-sky-400/25 px-3.5 text-xs font-medium text-sky-300 flex items-center gap-1.5 transition-colors disabled:opacity-45 whitespace-nowrap"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${state.checking ? 'animate-spin' : ''}`} />
          <span>{state.checking ? '检查中' : '检查更新'}</span>
        </button>
      </div>

      <label className="flex items-center justify-between gap-3 text-xs text-slate-200 min-h-[44px] py-1 cursor-pointer border-t border-white/8 pt-3">
        <span>
          <span className="font-medium text-slate-100">自动检查更新</span>
          <span className="block text-[11px] text-slate-400 mt-0.5">
            打开应用时检查，前台每 12 小时检查
          </span>
        </span>
        <span className="inline-flex items-center shrink-0">
          <input
            id="automatic-app-updates"
            type="checkbox"
            checked={state.automatic}
            disabled={!supported}
            onChange={(event) => handleAutoToggle(event.target.checked)}
            className="sr-only peer"
          />
          <span
            aria-hidden="true"
            className={`w-11 h-6 rounded-full transition-colors duration-200 relative inline-block peer-focus-visible:ring-2 peer-focus-visible:ring-sky-400 peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-[#090C10] ${
              state.automatic
                ? 'bg-gradient-to-r from-sky-400 to-emerald-400'
                : 'bg-white/15'
            } ${!supported ? 'opacity-45' : ''}`}
          >
            <span
              className={`w-5 h-5 rounded-full bg-white shadow-md absolute top-0.5 left-0.5 transition-transform duration-200 ${
                state.automatic ? 'translate-x-5' : 'translate-x-0'
              }`}
            />
          </span>
        </span>
      </label>

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
          <p className="text-[11px] text-slate-400 font-mono-tabular">
            上次检查 {new Date(state.checkedAt).toLocaleString('zh-CN')}
          </p>
        )}
      </div>

      {state.error && (
        <p
          id="app-update-error"
          role="alert"
          className="text-xs text-amber-300 bg-amber-500/10 border border-amber-400/25 rounded-xl p-3 leading-relaxed"
        >
          {state.error}
        </p>
      )}

      {state.available && (
        <div className="space-y-3 pt-1">
          <details className="text-xs text-slate-300 glass-inset rounded-2xl p-3">
            <summary className="cursor-pointer min-h-[36px] flex items-center font-medium text-sky-300">
              更新说明 · {state.name || state.latestVersion}
            </summary>
            <p className="whitespace-pre-wrap break-words max-h-64 overflow-y-auto mt-2 pt-2 border-t border-white/8 leading-relaxed text-slate-300 font-mono-tabular text-[11px]">
              {state.notes || '此版本未提供更新说明。'}
            </p>
          </details>
        </div>
      )}
      {(state.available || state.download.phase !== 'idle') && <UpdateDownloadPanel state={state} />}

      <p className="text-[11px] text-slate-400 leading-relaxed pt-1 border-t border-white/6">
        更新来源：AoXIUy/token-monitor-For-Android · GitHub Releases。应用内下载并校验，安装时由系统确认。
      </p>
    </section>
  );
}
