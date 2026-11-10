package com.tokenmonitor.android;

public final class WidgetPolicyChecks {
    private static int checks;

    private static void check(boolean condition) {
        if (!condition) throw new AssertionError("Widget policy check " + (checks + 1) + " failed");
        checks++;
    }

    public static void main(String[] args) {
        check("Gemini CLI".equals(WidgetLayoutPolicy.clientLabel("gemini")));
        check("Gemini".equals(WidgetLayoutPolicy.providerLabel("gemini", "")));
        check("Mistral Vibe".equals(WidgetLayoutPolicy.clientLabel("mistral")));
        check("Mistral".equals(WidgetLayoutPolicy.providerLabel("mistral", "web")));
        check("Prime Agent".equals(WidgetLayoutPolicy.clientLabel("prime-agent")));
        check("Jcode".equals(WidgetLayoutPolicy.clientLabel("jcode")));
        check("其他".equals(WidgetLayoutPolicy.clientLabel("arbitrary-user-string")));
        check("MiniMax Code".equals(WidgetLayoutPolicy.providerLabel("minimax", "oauth")));
        check("MiniMax API".equals(WidgetLayoutPolicy.providerLabel("minimax", "api")));
        check("MiniMax".equals(WidgetLayoutPolicy.providerLabel("minimax", "")));
        check("MiniMax Code".equals(WidgetLayoutPolicy.providerLabel("mcode", "")));
        check("视频".equals(WidgetLayoutPolicy.windowLabel("minimax", "weekly", "Video")));
        check("周度".equals(WidgetLayoutPolicy.windowLabel("other", "weekly", "Video")));
        check("OpenDesign".equals(WidgetLayoutPolicy.providerLabel("opendesign", "web")));
        check(WidgetLayoutPolicy.selectSize(WidgetLayoutPolicy.Kind.COMPACT, 0, 0) == WidgetLayoutPolicy.Size.COMPACT_BAR);
        check(WidgetLayoutPolicy.selectSize(WidgetLayoutPolicy.Kind.COMPACT, 110, 56) == WidgetLayoutPolicy.Size.COMPACT_BAR);
        check(WidgetLayoutPolicy.selectSize(WidgetLayoutPolicy.Kind.COMPACT, 140, 120) == WidgetLayoutPolicy.Size.SMALL);
        check(WidgetLayoutPolicy.selectSize(WidgetLayoutPolicy.Kind.COMPACT, 260, 180) == WidgetLayoutPolicy.Size.MEDIUM);

        check(WidgetLayoutPolicy.selectSize(WidgetLayoutPolicy.Kind.TODAY, 0, 0) == WidgetLayoutPolicy.Size.MEDIUM);
        check(WidgetLayoutPolicy.selectSize(WidgetLayoutPolicy.Kind.TODAY, 140, 120) == WidgetLayoutPolicy.Size.SMALL);
        check(WidgetLayoutPolicy.selectSize(WidgetLayoutPolicy.Kind.TODAY, 250, 180) == WidgetLayoutPolicy.Size.MEDIUM);
        check(WidgetLayoutPolicy.selectSize(WidgetLayoutPolicy.Kind.TODAY, 280, 250) == WidgetLayoutPolicy.Size.LARGE);

        check(WidgetLayoutPolicy.selectSize(WidgetLayoutPolicy.Kind.PERIODS, 0, 0) == WidgetLayoutPolicy.Size.MEDIUM);
        check(WidgetLayoutPolicy.selectSize(WidgetLayoutPolicy.Kind.PERIODS, 140, 115) == WidgetLayoutPolicy.Size.SMALL);
        check(WidgetLayoutPolicy.selectSize(WidgetLayoutPolicy.Kind.PERIODS, 250, 140) == WidgetLayoutPolicy.Size.MEDIUM);
        check(WidgetLayoutPolicy.selectSize(WidgetLayoutPolicy.Kind.PERIODS, 260, 240) == WidgetLayoutPolicy.Size.LARGE);

        check(WidgetLayoutPolicy.selectSize(WidgetLayoutPolicy.Kind.QUOTA, 0, 0) == WidgetLayoutPolicy.Size.MEDIUM);
        check(WidgetLayoutPolicy.selectSize(WidgetLayoutPolicy.Kind.QUOTA, 140, 120) == WidgetLayoutPolicy.Size.SMALL);
        check(WidgetLayoutPolicy.selectSize(WidgetLayoutPolicy.Kind.QUOTA, 250, 160) == WidgetLayoutPolicy.Size.MEDIUM);
        check(WidgetLayoutPolicy.selectSize(WidgetLayoutPolicy.Kind.QUOTA, 260, 240) == WidgetLayoutPolicy.Size.LARGE);

        check("0".equals(WidgetLayoutPolicy.compact(0)));
        check("999".equals(WidgetLayoutPolicy.compact(999)));
        check("1.3K".equals(WidgetLayoutPolicy.compact(1250)));
        check("1M".equals(WidgetLayoutPolicy.compact(999_999)));
        check("2.8M".equals(WidgetLayoutPolicy.compact(2_840_000)));
        check("1B".equals(WidgetLayoutPolicy.compact(999_999_999)));
        check("—".equals(WidgetLayoutPolicy.compact(-1)));
        check("—".equals(WidgetLayoutPolicy.compact(Double.NaN)));
        check("—".equals(WidgetLayoutPolicy.compact(Double.POSITIVE_INFINITY)));

        check("—".equals(WidgetLayoutPolicy.moneyUsd(null)));
        check("—".equals(WidgetLayoutPolicy.moneyUsd(-0.01)));
        check("—".equals(WidgetLayoutPolicy.moneyUsd(Double.NaN)));
        check("$0.00".equals(WidgetLayoutPolicy.moneyUsd(0.0)));
        check("$12.46".equals(WidgetLayoutPolicy.moneyUsd(12.456)));

        check("Claude".equals(WidgetLayoutPolicy.providerLabel("claude", null)));
        check("Codex".equals(WidgetLayoutPolicy.providerLabel(" CODEX ", null)));
        check("Hark".equals(WidgetLayoutPolicy.providerLabel("hark", "web")));
        check("Qoder".equals(WidgetLayoutPolicy.providerLabel("qoder", "web")));
        check("Muse (Meta)".equals(WidgetLayoutPolicy.providerLabel("muse", "web")));
        check("Muse Code".equals(WidgetLayoutPolicy.providerLabel("muse", "cli")));
        check("其他".equals(WidgetLayoutPolicy.providerLabel("user@example.com", null)));
        check("其他".equals(WidgetLayoutPolicy.providerLabel("private-workspace", null)));
        check("其他".equals(WidgetLayoutPolicy.providerLabel(null, null)));

        check("会话".equals(WidgetLayoutPolicy.windowLabel("session")));
        check("周度".equals(WidgetLayoutPolicy.windowLabel("weekly")));
        check("每日".equals(WidgetLayoutPolicy.windowLabel("daily")));
        check("月度".equals(WidgetLayoutPolicy.windowLabel("monthly")));
        check("账期".equals(WidgetLayoutPolicy.windowLabel("billing")));
        check("额度".equals(WidgetLayoutPolicy.windowLabel("credits")));
        check("配额".equals(WidgetLayoutPolicy.windowLabel("custom-tier-name")));
        check("配额".equals(WidgetLayoutPolicy.windowLabel(null)));

        check(WidgetLayoutPolicy.quotaUsedPercent(50.0, null, null, null, null, null, false) == null);
        check(Integer.valueOf(72).equals(WidgetLayoutPolicy.quotaUsedPercent(72.4, null, null, null, null, null, true)));
        check(Integer.valueOf(85).equals(WidgetLayoutPolicy.quotaUsedPercent(null, 14.6, null, null, null, null, null)));
        check(Integer.valueOf(75).equals(WidgetLayoutPolicy.quotaUsedPercent(null, null, "credits", 250.0, null, 750.0, true)));
        check(Integer.valueOf(90).equals(WidgetLayoutPolicy.quotaUsedPercent(null, null, "credits", null, 100.0, 900.0, true)));
        check(WidgetLayoutPolicy.quotaUsedPercent(null, null, "credits", null, null, 50.0, true) == null);
        check(Integer.valueOf(100).equals(WidgetLayoutPolicy.quotaUsedPercent(135.0, null, null, null, null, null, true)));
        check(Integer.valueOf(0).equals(WidgetLayoutPolicy.quotaUsedPercent(-5.0, null, null, null, null, null, true)));
        check(Integer.valueOf(100).equals(WidgetLayoutPolicy.quotaUsedPercent(null, null, "credits", 0.0, null, null, true)));
        check(Integer.valueOf(100).equals(WidgetLayoutPolicy.quotaUsedPercent(null, null, "credits", null, 0.0, null, null)));
        check(Integer.valueOf(100).equals(WidgetLayoutPolicy.quotaUsedPercent(null, null, "credits", -5.0, 50.0, null, true)));
        check(Integer.valueOf(0).equals(WidgetLayoutPolicy.quotaUsedPercent(null, null, "credits", 30.0, null, null, true)));
        check(Integer.valueOf(25).equals(WidgetLayoutPolicy.quotaUsedPercent(null, null, "credits", 30.0, 50.0, 10.0, true)));
        check(Integer.valueOf(25).equals(WidgetLayoutPolicy.quotaUsedPercent(null, null, "credits", null, 30.0, 10.0, true)));
        check(WidgetLayoutPolicy.quotaUsedPercent(null, null, "credits", 0.0, 0.0, 0.0, false) == null);
        check(WidgetLayoutPolicy.quotaUsedPercent(null, null, "credits", Double.NaN, null, 10.0, true) == null);
        check(Integer.valueOf(25).equals(WidgetLayoutPolicy.quotaUsedPercent(25.0, null, "credits", 0.0, null, null, true)));
        check(Integer.valueOf(60).equals(WidgetLayoutPolicy.quotaUsedPercent(null, 40.0, "credits", 0.0, null, null, true)));

        java.time.LocalDate today = java.time.LocalDate.parse("2026-11-04");
        java.util.Map<String, Double> sparse = new java.util.HashMap<>();
        sparse.put("2026-10-01", 100.0);
        sparse.put("2026-10-15", 200.0);
        sparse.put("2026-11-02", 10.0);
        sparse.put("2026-11-04", 5.0);
        WidgetLayoutPolicy.HistorySummary history = WidgetLayoutPolicy.history(sparse, today);
        check(history.recentDays == 2 && history.sevenDayDays == 2);
        check(Double.valueOf(15).equals(history.sevenDayTokens));
        check(Double.valueOf(10).equals(history.peakDayTokens));
        sparse.put("2026-10-22", 50.0);
        sparse.put("2026-10-28", 20.0);
        sparse.put("2026-10-29", 3.0);
        sparse.put("2026-11-05", 1000.0);
        sparse.put("2026-11-31", 1000.0);
        sparse.put("2026-11-03", -1.0);
        sparse.put("invalid", 1000.0);
        history = WidgetLayoutPolicy.history(sparse, today);
        check(history.recentDays == 5 && history.sevenDayDays == 3);
        check(Double.valueOf(18).equals(history.sevenDayTokens));
        check(Double.valueOf(50).equals(history.peakDayTokens));
        history = WidgetLayoutPolicy.history(java.util.Map.of("2026-10-28", 20.0), today);
        check(history.sevenDayTokens == null && history.sevenDayDays == 0);
        check(Double.valueOf(20).equals(history.peakDayTokens));
        history = WidgetLayoutPolicy.history(java.util.Map.of("2026-10-21", 20.0), today);
        check(history.sevenDayTokens == null && history.peakDayTokens == null && history.recentDays == 0);
        history = WidgetLayoutPolicy.history(java.util.Map.of("2026-11-04", 0.0), today);
        check(Double.valueOf(0).equals(history.sevenDayTokens) && history.sevenDayDays == 1);
        history = WidgetLayoutPolicy.history(java.util.Map.of("2024-02-29", 5.0), java.time.LocalDate.parse("2024-03-01"));
        check(Double.valueOf(5).equals(history.sevenDayTokens));

        System.out.println(checks + " widget policy checks passed");
    }
}
