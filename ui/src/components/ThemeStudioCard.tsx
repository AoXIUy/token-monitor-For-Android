import React from 'react';
import { Check, Palette, Sparkles } from 'lucide-react';
import type { ThemeId, ThemePreference } from '../types/monitor';
import { getThemeMeta, resolveThemeId, THEME_CATALOG } from '../utils/themes';
import { SectionHeader, ToggleSwitch } from './ui/Primitives';

interface ThemeStudioCardProps {
  themePreference: ThemePreference;
  systemDark: boolean;
  onSelectTheme: (next: ThemePreference) => void;
}

export const ThemeStudioCard: React.FC<ThemeStudioCardProps> = ({
  themePreference,
  systemDark,
  onSelectTheme,
}) => {
  const isAuto = themePreference === 'auto';
  const resolvedId: ThemeId = resolveThemeId(themePreference, systemDark);
  const resolvedMeta = getThemeMeta(resolvedId);

  return (
    <section id="theme-studio" className="glass-panel rounded-3xl p-4 sm:p-5 space-y-4">
      <SectionHeader
        headingLevel="h2"
        icon={
          <span className="w-9 h-9 rounded-xl bg-[var(--tm-accent-soft-bg)] border border-[var(--tm-accent-soft-border)] flex items-center justify-center text-[var(--tm-accent-text)]">
            <Palette className="w-4 h-4" />
          </span>
        }
        title="外观主题"
        subtitle={
          isAuto
            ? `跟随系统 · 当前解析：${resolvedMeta.name}（${resolvedMeta.polarityLabel}）`
            : `当前主题：${resolvedMeta.name}（${resolvedMeta.polarityLabel}）`
        }
        badge={
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[var(--tm-accent-soft-bg)] border border-[var(--tm-accent-soft-border)] text-[11px] font-medium text-[var(--tm-accent-text)]">
            <Sparkles className="w-3 h-3" aria-hidden="true" />
            <span>6 套配色</span>
          </span>
        }
      />

      <div className="glass-inset rounded-2xl px-3.5 py-2.5 flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="text-xs font-semibold text-[var(--tm-text-primary)]">跟随系统外观</h3>
          <p className="text-[11.5px] text-[var(--tm-text-muted)] mt-0.5 leading-snug">
            {isAuto
              ? `当前解析：${resolvedMeta.name}（系统${systemDark ? '深色' : '浅色'}）`
              : '开启后自动随系统切换深空遥测与晴空纸韵'}
          </p>
        </div>
        <ToggleSwitch
          id="theme-auto"
          checked={isAuto}
          onChange={(checked) => onSelectTheme(checked ? 'auto' : resolvedId)}
          ariaLabel="跟随系统外观"
        />
      </div>

      <div
        role="group"
        aria-label="选择外观主题"
        className="grid grid-cols-2 sm:grid-cols-3 gap-2.5"
      >
        {THEME_CATALOG.map((meta) => {
          const isExplicitSelected = !isAuto && themePreference === meta.id;
          const isAutoResolved = isAuto && resolvedId === meta.id;
          const isActive = isExplicitSelected || isAutoResolved;
          const { swatches } = meta;

          return (
            <button
              key={meta.id}
              type="button"
              data-theme-option={meta.id}
              aria-pressed={isActive}
              onClick={() => onSelectTheme(meta.id)}
              className={`group relative rounded-2xl p-2.5 text-left border transition-all active:scale-[0.98] flex flex-col gap-2 min-h-[112px] ${
                isActive
                  ? 'bg-[var(--tm-accent-soft-bg)] border-[var(--tm-accent)] ring-1 ring-[var(--tm-accent)] shadow-sm'
                  : 'bg-[var(--tm-bg-row)] hover:bg-[var(--tm-bg-row-hover)] border-[var(--tm-border-default)] hover:border-[var(--tm-border-strong)]'
              }`}
            >
              {/* Miniature Live UI Wireframe Thumbnail (uses each theme's literal palette) */}
              <div
                aria-hidden="true"
                style={{
                  backgroundColor: swatches.canvas,
                  borderColor: swatches.border,
                }}
                className="w-full rounded-xl border p-2 space-y-1.5 overflow-hidden"
              >
                {/* Mini top chrome bar */}
                <div className="flex items-center justify-between gap-1.5">
                  <div className="flex items-center gap-1">
                    <span
                      style={{ backgroundColor: swatches.accent }}
                      className="w-2 h-2 rounded-full shrink-0"
                    />
                    <span
                      style={{ backgroundColor: swatches.textPrimary, opacity: 0.72 }}
                      className="w-8 h-1.5 rounded-full"
                    />
                  </div>
                  <span
                    style={{
                      backgroundColor: swatches.surface,
                      borderColor: swatches.border,
                    }}
                    className="w-5 h-2 rounded-full border"
                  />
                </div>

                {/* Mini hero telemetry card */}
                <div
                  style={{
                    backgroundColor: swatches.hero,
                    borderColor: swatches.border,
                  }}
                  className="rounded-lg border p-1.5 space-y-1"
                >
                  <div className="flex items-center justify-between gap-1">
                    <span
                      style={{ backgroundColor: swatches.textPrimary, opacity: 0.85 }}
                      className="w-9 h-2 rounded-full"
                    />
                    <span
                      style={{ backgroundColor: swatches.accentSecondary }}
                      className="w-4 h-1.5 rounded-full"
                    />
                  </div>
                  <div
                    style={{
                      backgroundImage: `linear-gradient(90deg, ${swatches.accent}, ${swatches.accentSecondary})`,
                    }}
                    className="w-full h-1 rounded-full"
                  />
                </div>

                {/* Two mini KPI tiles */}
                <div className="grid grid-cols-2 gap-1">
                  <div
                    style={{
                      backgroundColor: swatches.surface,
                      borderColor: swatches.border,
                    }}
                    className="h-3.5 rounded-md border px-1 flex items-center"
                  >
                    <span
                      style={{ backgroundColor: swatches.textMuted, opacity: 0.6 }}
                      className="w-6 h-1 rounded-full"
                    />
                  </div>
                  <div
                    style={{
                      backgroundColor: swatches.surface,
                      borderColor: swatches.border,
                    }}
                    className="h-3.5 rounded-md border px-1 flex items-center"
                  >
                    <span
                      style={{ backgroundColor: swatches.accent, opacity: 0.75 }}
                      className="w-5 h-1 rounded-full"
                    />
                  </div>
                </div>
              </div>

              {/* Theme Name & Polarity */}
              <div className="flex items-center justify-between gap-1.5 px-0.5">
                <div className="min-w-0">
                  <div className="text-xs font-semibold text-[var(--tm-text-primary)] truncate">
                    {meta.name}
                  </div>
                  <div className="text-[11px] text-[var(--tm-text-muted)] truncate">
                    {meta.polarityLabel}
                    {isAutoResolved ? ' · 系统' : ''}
                  </div>
                </div>

                {isActive && (
                  <span
                    aria-hidden="true"
                    className="w-5 h-5 rounded-full bg-[var(--tm-accent)] text-[var(--tm-text-inverse)] flex items-center justify-center shrink-0"
                  >
                    <Check className="w-3 h-3 stroke-[2.75]" />
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
};
