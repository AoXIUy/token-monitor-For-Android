package com.tokenmonitor.android;

import org.json.JSONArray;
import org.json.JSONObject;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.Iterator;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/** Bounded, display-only projection: never persist Hub sessions, names or credentials. */
final class UsageWidgetSnapshot {
    private UsageWidgetSnapshot() { }

    static JSONObject project(JSONObject stats, long fetchedAt, long startedAt) throws Exception {
        JSONObject periods = stats.optJSONObject("periods");
        JSONObject today = periods == null ? null : periods.optJSONObject("today");
        JSONArray devices = stats.optJSONArray("devices");
        if (today == null || devices == null || number(today, "totalTokens") == null) {
            throw new IllegalArgumentException("Missing today usage");
        }
        double total = count(today, "totalTokens");
        JSONObject capabilities = today.optJSONObject("capabilities");
        boolean hasComponents = capabilities != null && Boolean.TRUE.equals(capabilities.opt("tokenComponents"));
        Double cost = number(today, "costUsd");
        int reporting = 0;
        for (int i = 0; i < devices.length(); i++) {
            JSONObject device = devices.optJSONObject(i);
            if (device != null && device.has("stale") && !device.optBoolean("stale", true)) reporting++;
        }
        JSONObject result = new JSONObject()
                .put("fetchedAt", fetchedAt)
                .put("startedAt", startedAt)
                .put("tokens", compact(total))
                .put("cost", WidgetLayoutPolicy.moneyUsd(cost))
                .put("partialCost", count(today, "unpricedTokens") > 0)
                .put("devices", reporting + " / " + devices.length())
                .put("cache", "—")
                .put("cachePercentInt", -1)
                .put("inputTokens", "—")
                .put("outputTokens", "—")
                .put("cacheReadTokens", "—");
        if (hasComponents) {
            double percent = total > 0 ? Math.min(100, count(today, "cacheReadTokens") / total * 100) : 0;
            result.put("cache", String.format(Locale.US, "%.1f%%", percent))
                    .put("cachePercentInt", (int) Math.round(percent))
                    .put("inputTokens", compact(count(today, "inputTokens")))
                    .put("outputTokens", compact(count(today, "outputTokens")))
                    .put("cacheReadTokens", compact(count(today, "cacheReadTokens")));
        }

        projectOtherPeriods(periods, result);
        projectTopClients(today, total, result);
        projectHistory(stats.optJSONObject("historyPreview"), result);
        projectQuotas(stats.optJSONObject("limits"), result);
        return result;
    }

    private static void projectOtherPeriods(JSONObject periods, JSONObject out) throws Exception {
        JSONObject month = periods == null ? null : periods.optJSONObject("month");
        Double monthTotal = month == null ? null : number(month, "totalTokens");
        Double monthCost = month == null ? null : number(month, "costUsd");
        String monthCache = "—";
        if (month != null && monthTotal != null) {
            JSONObject cap = month.optJSONObject("capabilities");
            if (cap != null && Boolean.TRUE.equals(cap.opt("tokenComponents"))) {
                double pct = monthTotal > 0 ? Math.min(100, count(month, "cacheReadTokens") / monthTotal * 100) : 0;
                monthCache = String.format(Locale.US, "%.1f%%", pct);
            }
        }
        out.put("monthTokens", monthTotal == null ? "—" : compact(monthTotal))
                .put("monthCost", WidgetLayoutPolicy.moneyUsd(monthCost))
                .put("monthPartialCost", month != null && count(month, "unpricedTokens") > 0)
                .put("monthCache", monthCache);

        JSONObject allTime = periods == null ? null : periods.optJSONObject("allTime");
        Double allTotal = allTime == null ? null : number(allTime, "totalTokens");
        Double allCost = allTime == null ? null : number(allTime, "costUsd");
        out.put("allTimeTokens", allTotal == null ? "—" : compact(allTotal))
                .put("allTimeCost", WidgetLayoutPolicy.moneyUsd(allCost));
    }

    private static void projectTopClients(JSONObject today, double todayTotal, JSONObject out) throws Exception {
        JSONObject clients = today.optJSONObject("clients");
        JSONArray top = new JSONArray();
        if (clients != null) {
            Map<String, Double> bucketed = new HashMap<>();
            Iterator<String> keys = clients.keys();
            while (keys.hasNext()) {
                String rawKey = keys.next();
                Double tok = number(clients, rawKey);
                if (tok == null || tok <= 0) continue;
                String label = WidgetLayoutPolicy.providerLabel(rawKey, null);
                bucketed.put(label, bucketed.getOrDefault(label, 0.0) + tok);
            }
            List<Map.Entry<String, Double>> sorted = new ArrayList<>(bucketed.entrySet());
            sorted.sort((a, b) -> {
                int cmp = Double.compare(b.getValue(), a.getValue());
                return cmp != 0 ? cmp : a.getKey().compareTo(b.getKey());
            });
            int limit = Math.min(3, sorted.size());
            for (int i = 0; i < limit; i++) {
                Map.Entry<String, Double> entry = sorted.get(i);
                int pct = todayTotal > 0 ? (int) Math.min(100, Math.round(entry.getValue() / todayTotal * 100.0)) : 0;
                top.put(new JSONObject()
                        .put("label", entry.getKey())
                        .put("tokens", compact(entry.getValue()))
                        .put("percent", pct));
            }
        }
        out.put("topClients", top);
    }

    private static void projectHistory(JSONObject historyPreview, JSONObject out) throws Exception {
        JSONArray daily = historyPreview == null ? null : historyPreview.optJSONArray("daily");
        List<String[]> validRows = new ArrayList<>();
        if (daily != null) {
            for (int i = 0; i < daily.length(); i++) {
                JSONObject row = daily.optJSONObject(i);
                if (row == null) continue;
                String date = row.optString("date", "");
                Double tok = number(row, "tokens");
                if (date.matches("^\\d{4}-\\d{2}-\\d{2}$") && tok != null) {
                    validRows.add(new String[] {date, Double.toString(tok)});
                }
            }
        }
        validRows.sort(Comparator.comparing(a -> a[0]));
        int recentStart = Math.max(0, validRows.size() - 14);
        List<String[]> recent14 = validRows.subList(recentStart, validRows.size());
        if (recent14.isEmpty()) {
            out.put("recentDays", 0).put("sevenDayTokens", "—").put("peakDayTokens", "—");
            return;
        }
        double peak = 0;
        for (String[] row : recent14) peak = Math.max(peak, Double.parseDouble(row[1]));
        int sevenStart = Math.max(0, recent14.size() - 7);
        double sevenSum = 0;
        for (int i = sevenStart; i < recent14.size(); i++) {
            sevenSum += Double.parseDouble(recent14.get(i)[1]);
        }
        out.put("recentDays", recent14.size())
                .put("sevenDayTokens", compact(sevenSum))
                .put("peakDayTokens", compact(peak));
    }

    private static void projectQuotas(JSONObject limits, JSONObject out) throws Exception {
        JSONArray providers = limits == null ? null : limits.optJSONArray("providers");
        int totalAccounts = 0;
        int healthyAccounts = 0;
        int alertAccounts = 0;
        List<JSONObject> windowsOut = new ArrayList<>();
        if (providers != null) {
            for (int i = 0; i < providers.length(); i++) {
                JSONObject prov = providers.optJSONObject(i);
                if (prov == null) continue;
                totalAccounts++;
                String status = prov.optString("status", "");
                boolean stale = prov.optBoolean("stale", false);
                boolean ok = "ok".equals(status) && !stale;
                if (ok) healthyAccounts++;
                boolean hasHighUsage = false;
                String providerTitle = WidgetLayoutPolicy.providerLabel(prov.optString("provider", ""), prov.optString("source", ""));
                JSONArray windows = prov.optJSONArray("windows");
                if (windows != null) {
                    for (int w = 0; w < windows.length(); w++) {
                        JSONObject win = windows.optJSONObject(w);
                        if (win == null) continue;
                        Boolean showMeter = win.has("showMeter") && !win.isNull("showMeter") ? win.optBoolean("showMeter", true) : null;
                        Integer pct = WidgetLayoutPolicy.quotaUsedPercent(
                                number(win, "usedPercent"),
                                number(win, "remainingPercent"),
                                win.optString("metric", ""),
                                number(win, "used"),
                                number(win, "remaining"),
                                number(win, "limit"),
                                showMeter);
                        if (pct == null) continue;
                        if (pct >= 85) hasHighUsage = true;
                        String winTitle = WidgetLayoutPolicy.windowLabel(win.optString("kind", ""));
                        boolean warn = pct >= 85 || !ok;
                        windowsOut.add(new JSONObject()
                                .put("label", providerTitle + " · " + winTitle)
                                .put("percent", pct)
                                .put("value", pct + "%")
                                .put("warn", warn));
                    }
                }
                if (!ok || hasHighUsage) alertAccounts++;
            }
        }
        windowsOut.sort((a, b) -> Integer.compare(b.optInt("percent"), a.optInt("percent")));
        JSONArray topQuotas = new JSONArray();
        for (int i = 0; i < Math.min(3, windowsOut.size()); i++) {
            topQuotas.put(windowsOut.get(i));
        }
        out.put("quotaAccounts", totalAccounts)
                .put("quotaHealthy", healthyAccounts)
                .put("quotaAlerts", alertAccounts)
                .put("quotas", topQuotas);
    }

    private static Double number(JSONObject value, String key) {
        Object raw = value.opt(key);
        if (!(raw instanceof Number)) return null;
        double number = ((Number) raw).doubleValue();
        return Double.isFinite(number) && number >= 0 ? number : null;
    }

    private static double count(JSONObject value, String key) {
        Double number = number(value, key);
        return number == null ? 0 : number;
    }

    static String compact(double value) {
        return WidgetLayoutPolicy.compact(value);
    }
}
