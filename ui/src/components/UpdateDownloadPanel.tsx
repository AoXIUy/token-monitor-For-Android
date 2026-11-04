import { Download, RefreshCw, ShieldCheck } from 'lucide-react';
import type { AppUpdateState } from '../types/monitor';

export function UpdateDownloadPanel({ state, idPrefix = '' }: { state: AppUpdateState; idPrefix?: string }) {
  const download = state.download;
  const busy = download.phase === 'downloading' || download.phase === 'verifying';
  const ready = ['ready', 'permission', 'installing'].includes(download.phase);
  const percent = download.total ? Math.min(100, Math.floor(download.downloaded / download.total * 100)) : 0;
  const size = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return (
    <div className="space-y-3" data-update-download-phase={download.phase}>
      {download.message && <p role="status" className="text-xs text-sky-200 leading-relaxed">{download.message}</p>}
      {busy && (
        <div className="space-y-1.5">
          <div role="progressbar" aria-label="更新下载进度" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}
            className="h-2 rounded-full bg-white/10 overflow-hidden">
            <div className="h-full bg-gradient-to-r from-sky-400 to-emerald-400 transition-all" style={{ width: `${percent}%` }} />
          </div>
          <p className="text-[11px] text-slate-400 font-mono-tabular">
            {download.version} · {size(download.downloaded)} / {size(download.total)} · {percent}%
          </p>
        </div>
      )}
      {download.error && <p role="alert" className="text-xs text-amber-300 leading-relaxed">{download.error}</p>}
      {busy ? (
        <button type="button" id={`${idPrefix}cancel-app-update`} onClick={() => window.HubNative?.cancelUpdateDownload?.()}
          className="w-full min-h-[44px] rounded-2xl border border-white/15 text-xs text-slate-200">取消下载</button>
      ) : ready ? (
        <button type="button" id={`${idPrefix}install-app-update`} disabled={!window.HubNative?.installUpdate || download.phase === 'installing'}
          onClick={() => window.HubNative?.installUpdate?.()}
          className="w-full min-h-[44px] rounded-2xl bg-emerald-400 text-slate-950 text-xs font-bold disabled:opacity-45 flex items-center justify-center gap-2">
          <ShieldCheck className="w-4 h-4" />
          {download.phase === 'permission' ? '授权并安装' : download.phase === 'installing' ? '等待系统确认安装' : `安装 ${download.version}`}
        </button>
      ) : (
        <button type="button" id={`${idPrefix}download-app-update`} disabled={!state.available || !window.HubNative?.downloadUpdate}
          onClick={() => window.HubNative?.downloadUpdate?.()}
          className="w-full min-h-[44px] px-4 py-2.5 rounded-2xl bg-gradient-to-r from-sky-400 to-emerald-400 text-slate-950 text-xs font-bold flex items-center justify-center gap-2 disabled:opacity-45">
          {download.phase === 'error' ? <RefreshCw className="w-4 h-4" /> : <Download className="w-4 h-4" />}
          {download.phase === 'error' || download.phase === 'cancelled' ? '重新下载并安装' : `下载并安装 ${state.latestVersion}`}
          {state.size > 0 && <span>· {size(state.size)}</span>}
        </button>
      )}
    </div>
  );
}
