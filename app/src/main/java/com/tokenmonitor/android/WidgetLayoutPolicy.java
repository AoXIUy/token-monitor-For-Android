package com.tokenmonitor.android;

import java.util.Locale;
import java.util.Map;
import java.time.LocalDate;

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
            case "minimax" -> "oauth".equals(source) ? "MiniMax Code" : "api".equals(source) ? "MiniMax API" : "MiniMax";
            case "mcode" -> "MiniMax Code";
            case "mistral" -> "Mistral";
            case "mimo" -> "MiMo";
            case "gemini" -> "Gemini";
            case "prime-agent" -> "Prime Agent";
            case "jcode" -> "Jcode";
            case "opendesign" -> "OpenDesign";
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

    static String clientLabel(String client) {
        if ("gemini".equals(client)) return "Gemini CLI";
        if ("mistral".equals(client)) return "Mistral Vibe";
        return providerLabel(client, "");
    }

    static String windowLabel(String provider, String kind, String label) {
        return "minimax".equals(provider) && "Video".equals(label) ? "视频" : windowLabel(kind);
    }

    static final class HistorySummary {
        final int recentDays, sevenDayDays;
        final Double sevenDayTokens, peakDayTokens;
        HistorySummary(int recentDays, int sevenDayDays, Double sevenDayTokens, Double peakDayTokens) {
            this.recentDays = recentDays;
            this.sevenDayDays = sevenDayDays;
            this.sevenDayTokens = sevenDayTokens;
            this.peakDayTokens = peakDayTokens;
        }
    }

    static HistorySummary history(Map<String, Double> daily, LocalDate today) {
        LocalDate start = today.minusDays(13), weekStart = today.minusDays(6);
        int recentDays = 0, sevenDayDays = 0;
        double week = 0, peak = 0;
        for (Map.Entry<String, Double> row : daily.entrySet()) {
            if (row.getKey() == null || !row.getKey().matches("\\d{4}-\\d{2}-\\d{2}")) continue;
            LocalDate date;
            try { date = LocalDate.parse(row.getKey()); }
            catch (java.time.format.DateTimeParseException ignored) { continue; }
            Double tokens = row.getValue();
            if (date.isBefore(start) || date.isAfter(today) || tokens == null || !Double.isFinite(tokens) || tokens < 0) continue;
            recentDays++;
            peak = Math.max(peak, tokens);
            if (!date.isBefore(weekStart)) { sevenDayDays++; week += tokens; }
        }
        return new HistorySummary(recentDays, sevenDayDays, sevenDayDays > 0 ? week : null, recentDays > 0 ? peak : null);
    }

    // Match the shared balance display: explicit percentages win, otherwise a
    // wallet is measured against its remaining funds plus observed month spend.
    static Integer quotaUsedPercent(Double usedPercent, Double remainingPercent, String metric,
                                    Double remaining, Double balanceAmount, Double monthSpend, Boolean showMeter) {
        if (Boolean.FALSE.equals(showMeter)) return null;
        Double pct = null;
        if (usedPercent != null && Double.isFinite(usedPercent)) {
            pct = usedPercent;
        } else if (remainingPercent != null && Double.isFinite(remainingPercent)) {
            pct = 100.0 - remainingPercent;
        } else if ("credits".equals(metric)) {
            Double amount = remaining != null && Double.isFinite(remaining) ? remaining : balanceAmount;
            if (amount == null || !Double.isFinite(amount)) return null;
            double funds = Math.max(0, amount);
            double spend = monthSpend != null && Double.isFinite(monthSpend) ? Math.max(0, monthSpend) : 0;
            pct = funds == 0 ? 100.0 : 100.0 - funds / (funds + spend) * 100.0;
        }
        if (pct == null || !Double.isFinite(pct)) return null;
        int clamped = (int) Math.round(Math.max(0.0, Math.min(100.0, pct)));
        return clamped;
    }
}
