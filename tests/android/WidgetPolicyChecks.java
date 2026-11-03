package com.tokenmonitor.android;

public final class WidgetPolicyChecks {
    private static int checks;

    private static void check(boolean condition) {
        if (!condition) throw new AssertionError("Widget policy check " + (checks + 1) + " failed");
        checks++;
    }

    public static void main(String[] args) {
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
        check(Integer.valueOf(75).equals(WidgetLayoutPolicy.quotaUsedPercent(null, null, "credits", null, 250.0, 1000.0, true)));
        check(Integer.valueOf(90).equals(WidgetLayoutPolicy.quotaUsedPercent(null, null, "credits", 900.0, null, 1000.0, true)));
        check(WidgetLayoutPolicy.quotaUsedPercent(null, null, "credits", 50.0, null, 0.0, true) == null);
        check(Integer.valueOf(100).equals(WidgetLayoutPolicy.quotaUsedPercent(135.0, null, null, null, null, null, true)));
        check(Integer.valueOf(0).equals(WidgetLayoutPolicy.quotaUsedPercent(-5.0, null, null, null, null, null, true)));

        System.out.println(checks + " widget policy checks passed");
    }
}
