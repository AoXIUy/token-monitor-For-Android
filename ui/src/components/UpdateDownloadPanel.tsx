import { Download, RefreshCw, ShieldCheck } from 'lucide-react';
import type { AppUpdateState } from '../types/monitor';
import { InlineAlert, ProgressMeter } from './ui/Primitives';

export function UpdateDownloadPanel({
  state,
  idPrefix = '',
}: {
  state: AppUpdateState;
  idPrefix?: string;
}) {
  const download = state.download;
  const verifying = download.phase === 'verifying';
  const downloading = download.phase === 'downloading';
  const busy = downloading || verifying;
  const ready = ['ready', 'permission', 'installing'].includes(download.phase);
  const hasTotal = download.total > 0;
  const percent = verifying
    ? 100
    : hasTotal
      ? Math.min(100, Math.floor((download.downloaded / download.total) * 100))
      : 0;
  const size = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;

  return (
    <div className="space-y-3" data-update-download-phase={download.phase}>
      {download.message && (
        <p role="status" className="text-xs text-[var(--tm-accent-text)] leading-relaxed">
          {download.message}
        </p>
      )}

      {busy && (
        <div className="space-y-2">
          <ProgressMeter
            percent={percent}
            tone={verifying ? 'emerald' : 'sky'}
            heightClass="h-2"
            ariaLabel="更新下载进度"
          />
          {verifying ? (
            <p className="text-[11.5px] text-[var(--tm-success-text)] inline-flex items-center gap-1.5">
              <RefreshCw className="w-3.5 h-3.5 animate-spin text-[var(--tm-success)] shrink-0" />
              <span>正在校验安装包完整性与官方签名…</span>
            </p>
          ) : !hasTotal ? (
            <p className="text-[11.5px] text-[var(--tm-text-muted)] tabular-nums">
              {download.version ? `${download.version} · ` : ''}
              {download.downloaded > 0
                ? `${size(download.downloaded)} · 正在获取文件大小...`
                : '正在获取文件大小...'}
            </p>
          ) : (
            <p className="text-[11.5px] text-[var(--tm-text-muted)] font-mono-tabular">
              {download.version} · {size(download.downloaded)} / {size(download.total)} · {percent}%
            </p>
          )}
        </div>
      )}

      {download.error && (
        <InlineAlert tone="rose" role="alert">
          {download.error}
        </InlineAlert>
      )}

      {busy ? (
        <button
          type="button"
          id={`${idPrefix}cancel-app-update`}
          onClick={() => window.HubNative?.cancelUpdateDownload?.()}
          className="w-full min-h-[44px] rounded-2xl bg-[var(--tm-bg-control)] hover:bg-[var(--tm-bg-control-hover)] active:scale-[0.98] border border-[var(--tm-border-default)] text-xs font-medium text-[var(--tm-text-primary)] transition-all"
        >
          取消下载
        </button>
      ) : ready ? (
        <button
          type="button"
          id={`${idPrefix}install-app-update`}
          disabled={!window.HubNative?.installUpdate || download.phase === 'installing'}
          onClick={() => window.HubNative?.installUpdate?.()}
          className="w-full min-h-[44px] px-4 py-2.5 rounded-2xl bg-[var(--tm-success)] hover:brightness-105 active:scale-[0.98] text-[var(--tm-text-inverse)] text-xs font-bold disabled:opacity-45 flex items-center justify-center gap-2 transition-all"
        >
          <ShieldCheck className="w-4 h-4 shrink-0" />
          <span>
            {download.phase === 'permission'
              ? '授权并安装'
              : download.phase === 'installing'
                ? '等待系统确认安装'
                : `安装 ${download.version}`}
          </span>
        </button>
      ) : (
        <button
          type="button"
          id={`${idPrefix}download-app-update`}
          disabled={!state.available || !window.HubNative?.downloadUpdate}
          onClick={() => window.HubNative?.downloadUpdate?.()}
          className="w-full min-h-[44px] px-4 py-2.5 rounded-2xl [background-image:var(--tm-accent-gradient)] hover:brightness-105 active:scale-[0.98] text-[var(--tm-text-inverse)] text-xs font-bold flex items-center justify-center gap-2 disabled:opacity-45 transition-all"
        >
          {download.phase === 'error' ? (
            <RefreshCw className="w-4 h-4 shrink-0" />
          ) : (
            <Download className="w-4 h-4 shrink-0" />
          )}
          <span>
            {download.phase === 'error' || download.phase === 'cancelled'
              ? '重新下载并安装'
              : `下载并安装 ${state.latestVersion}`}
          </span>
          {state.size > 0 && <span className="tabular-nums">· {size(state.size)}</span>}
        </button>
      )}
    </div>
  );
}
