package com.tokenmonitor.android;

import java.util.Locale;

/** Pure, bounded formatting and responsive breakpoint rules for home screen widgets. */
final class WidgetLayoutPolicy {
    enum Kind { TODAY, COMPACT, PERIODS, QUOTA }
    enum Size { COMPACT_BAR, SMALL, MEDIUM, LARGE }

    private WidgetLayoutPolicy() { }

    static Size selectSize(Kind kind, int widthDp, int heightDp) {
        if (kind == Kind.COMPACT) {
            if (widthDp >= 250 && heightDp >= 165) return Size.MEDIUM;
            if (widthDp >= 130 && heightDp >= 115) return Size.SMALL;
            return Size.COMPACT_BAR;
        }
        if (widthDp <= 0 || heightDp <= 0) return Size.MEDIUM;
        if (kind == Kind.TODAY) {
            if (widthDp < 220 || heightDp < 145) return Size.SMALL;
            if (widthDp >= 250 && heightDp >= 235) return Size.LARGE;
            return Size.MEDIUM;
        }
        if (kind == Kind.PERIODS) {
            if (widthDp < 215 || heightDp < 125) return Size.SMALL;
            if (widthDp >= 240 && heightDp >= 225) return Size.LARGE;
            return Size.MEDIUM;
        }
        if (widthDp < 220 || heightDp < 145) return Size.SMALL;
        if (widthDp >= 240 && heightDp >= 225) return Size.LARGE;
        return Size.MEDIUM;
    }

    // Match the shared formatter's western units and rounded-unit promotion.
    static String compact(double value) {
        if (!Double.isFinite(value) || value < 0) return "—";
        double[] divisors = {1e3, 1e6, 1e9};
        String[] suffixes = {"K", "M", "B"};
        if (value < 1000) return String.format(Locale.US, "%.0f", value);
        int index = value >= 1e9 ? 2 : value >= 1e6 ? 1 : 0;
        double scaled = Math.round(value / divisors[index] * 10) / 10.0;
        if (scaled >= 1000 && index < 2) scaled = Math.round(value / divisors[++index] * 10) / 10.0;
        return String.format(Locale.US, "%.1f", scaled).replaceAll("\\.0$", "") + suffixes[index];
    }

    static String moneyUsd(Double value) {
        if (value == null || !Double.isFinite(value) || value < 0) return "—";
        return String.format(Locale.US, "$%.2f", value);
    }

    /** Allowlist known provider IDs so custom or sensitive Hub strings never enter widget storage. */
    static String providerLabel(String provider, String source) {
        if (provider == null) return "其他";
        return switch (provider.trim().toLowerCase(Locale.ROOT)) {
            case "claude" -> "Claude";
            case "codex" -> "Codex";
            case "cursor" -> "Cursor";
            case "copilot" -> "Copilot";
            case "deepseek" -> "DeepSeek";
            case "opencode" -> "OpenCode";
            case "antigravity" -> "Antigravity";
            case "openrouter" -> "OpenRouter";
            case "muse" -> "web".equalsIgnoreCase(source) ? "Muse (Meta)" : "Muse Code";
            case "ollama" -> "Ollama";
            case "manus" -> "Manus";
            case "senpi" -> "Senpi";
            default -> "其他";
        };
    }

    static String windowLabel(String kind) {
        if (kind == null) return "配额";
        return switch (kind.trim()) {
            case "session" -> "会话";
            case "weekly" -> "周度";
            case "daily" -> "每日";
            case "monthly" -> "月度";
            case "billing" -> "账期";
            case "credits" -> "额度";
            default -> "配额";
        };
    }

    static Integer quotaUsedPercent(Double usedPercent, Double remainingPercent, String metric,
                                    Double used, Double remaining, Double limit, Boolean showMeter) {
        if (Boolean.FALSE.equals(showMeter)) return null;
        Double pct = null;
        if (usedPercent != null && Double.isFinite(usedPercent)) {
            pct = usedPercent;
        } else if (remainingPercent != null && Double.isFinite(remainingPercent)) {
            pct = 100.0 - remainingPercent;
        } else if ("credits".equals(metric) && limit != null && Double.isFinite(limit) && limit > 0) {
            if (remaining != null && Double.isFinite(remaining)) {
                pct = (1.0 - remaining / limit) * 100.0;
            } else if (used != null && Double.isFinite(used)) {
                pct = (used / limit) * 100.0;
            }
        }
        if (pct == null || !Double.isFinite(pct)) return null;
        int clamped = (int) Math.round(Math.max(0.0, Math.min(100.0, pct)));
        return clamped;
    }
}
