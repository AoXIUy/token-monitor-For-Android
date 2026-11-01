import { Download, RefreshCw } from 'lucide-react';
import type { AppUpdateState } from '../types/monitor';

export function AppUpdateCard({ state }: { state: AppUpdateState }) {
  const supported = Boolean(window.HubNative?.checkForUpdates);
  const summary = state.checking ? '正在检查 GitHub 最新正式版…'
    : state.available ? `发现新版本 ${state.latestVersion}`
      : state.checkedAt && state.latestVersion ? '当前已是最新版本' : '尚未检查更新';
  return (
    <section id="app-update" className="glass-panel rounded-3xl p-4.5 space-y-3 scroll-mt-20">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-slate-100">软件更新</h3>
          <p className="text-xs text-slate-400 mt-1">当前版本 {state.currentVersion || '—'}</p>
        </div>
        <button id="check-app-update" type="button" disabled={!supported || state.checking}
          onClick={() => window.HubNative?.checkForUpdates?.()}
          className="shrink-0 min-h-[44px] rounded-xl border border-sky-400/25 px-3 text-xs text-sky-300 flex items-center gap-1.5 disabled:opacity-45">
          <RefreshCw className={`w-3.5 h-3.5 ${state.checking ? 'animate-spin' : ''}`} />
          {state.checking ? '检查中' : '检查更新'}
        </button>
      </div>
      <label className="flex items-center justify-between gap-3 text-xs text-slate-200 min-h-[44px]">
        <span>自动检查更新<span className="block text-[11px] text-slate-400 mt-1">在前台检查，间隔至少 12 小时</span></span>
        <input id="automatic-app-updates" type="checkbox" checked={state.automatic} disabled={!supported}
          onChange={event => window.HubNative?.automaticUpdates?.(event.target.checked)}
          className="w-5 h-5 shrink-0 accent-sky-400" />
      </label>
      <p id="app-update-status" role="status" aria-live="polite" className={`text-xs ${state.available ? 'text-emerald-300' : 'text-slate-300'}`}>
        {supported ? summary : '请在 Android App 中检查更新'}
      </p>
      {state.checkedAt > 0 && <p className="text-[11px] text-slate-400">上次检查 {new Date(state.checkedAt).toLocaleString('zh-CN')}</p>}
      {state.error && <p id="app-update-error" role="alert" className="text-xs text-amber-300">{state.error}</p>}
      {state.available && <>
        <details className="text-xs text-slate-300">
          <summary className="cursor-pointer min-h-[32px]">更新说明 · {state.name || state.latestVersion}</summary>
          <p className="whitespace-pre-wrap break-words max-h-64 overflow-y-auto mt-2 leading-relaxed">{state.notes || '此版本未提供更新说明。'}</p>
        </details>
        <button id="download-app-update" type="button" disabled={!supported}
          onClick={() => window.HubNative?.downloadUpdate?.()}
          className="w-full min-h-[44px] px-3 py-2 rounded-xl bg-sky-400 text-slate-950 text-xs font-semibold flex items-center justify-center gap-2 disabled:opacity-45">
          <Download className="w-4 h-4" />下载 {state.latestVersion}
          {state.size > 0 ? ` · ${(state.size / 1024 / 1024).toFixed(1)} MB` : ''}
        </button>
      </>}
      <p className="text-[11px] text-slate-400 leading-relaxed">更新来源：AoXIUy/token-monitor-For-Android · GitHub Releases。下载由系统浏览器处理，安装时需要确认。</p>
    </section>
  );
}
