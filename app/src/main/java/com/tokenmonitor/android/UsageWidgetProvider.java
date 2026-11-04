package com.tokenmonitor.android;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.graphics.Color;
import android.os.Build;
import android.os.Bundle;
import android.util.SizeF;
import android.view.View;
import android.widget.RemoteViews;
import org.json.JSONArray;
import org.json.JSONObject;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.LinkedHashMap;
import java.util.Locale;
import java.util.Map;

/** Native launcher card; all network work is delegated to a system-managed job. */
public final class UsageWidgetProvider extends AppWidgetProvider {
    static final String REFRESH = "com.tokenmonitor.android.REFRESH_USAGE_WIDGET";

    static int[] ids(Context context) {
        return idsFor(context, UsageWidgetProvider.class);
    }

    static int[] idsFor(Context context, Class<? extends AppWidgetProvider> providerClass) {
        return AppWidgetManager.getInstance(context).getAppWidgetIds(new ComponentName(context, providerClass));
    }

    static boolean hasAnyWidgets(Context context) {
        try {
            return idsFor(context, UsageWidgetProvider.class).length > 0
                    || idsFor(context, CompactUsageWidgetProvider.class).length > 0
                    || idsFor(context, PeriodOverviewWidgetProvider.class).length > 0
                    || idsFor(context, QuotaWidgetProvider.class).length > 0;
        } catch (RuntimeException ignored) {
            return false;
        }
    }

    static void renderAll(Context context) {
        synchronized (UsageWidgetStore.LOCK) {
            // A launcher/system IPC failure must not interrupt saving a Hub connection.
            try {
                AppWidgetManager manager = AppWidgetManager.getInstance(context);
                renderKind(context, manager, UsageWidgetProvider.class, WidgetLayoutPolicy.Kind.TODAY);
                renderKind(context, manager, CompactUsageWidgetProvider.class, WidgetLayoutPolicy.Kind.COMPACT);
                renderKind(context, manager, PeriodOverviewWidgetProvider.class, WidgetLayoutPolicy.Kind.PERIODS);
                renderKind(context, manager, QuotaWidgetProvider.class, WidgetLayoutPolicy.Kind.QUOTA);
            } catch (RuntimeException ignored) { }
        }
    }

    private static void renderKind(Context context, AppWidgetManager manager,
                                   Class<? extends AppWidgetProvider> providerClass,
                                   WidgetLayoutPolicy.Kind kind) {
        int[] widgetIds = manager.getAppWidgetIds(new ComponentName(context, providerClass));
        if (widgetIds.length == 0) return;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            RemoteViews responsive = responsiveViews(context, kind);
            manager.updateAppWidget(widgetIds, responsive);
            return;
        }
        for (int id : widgetIds) {
            Bundle options = manager.getAppWidgetOptions(id);
            int minW = options == null ? 0 : options.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH, 0);
            int minH = options == null ? 0 : options.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT, 0);
            WidgetLayoutPolicy.Size size = WidgetLayoutPolicy.selectSize(kind, minW, minH);
            manager.updateAppWidget(id, viewsFor(context, kind, size));
        }
    }

    private static RemoteViews responsiveViews(Context context, WidgetLayoutPolicy.Kind kind) {
        Map<SizeF, RemoteViews> mapping = new LinkedHashMap<>();
        if (kind == WidgetLayoutPolicy.Kind.COMPACT) {
            mapping.put(new SizeF(110f, 56f), viewsFor(context, kind, WidgetLayoutPolicy.Size.COMPACT_BAR));
            mapping.put(new SizeF(140f, 118f), viewsFor(context, kind, WidgetLayoutPolicy.Size.SMALL));
            mapping.put(new SizeF(250f, 170f), viewsFor(context, kind, WidgetLayoutPolicy.Size.MEDIUM));
        } else if (kind == WidgetLayoutPolicy.Kind.TODAY) {
            mapping.put(new SizeF(140f, 115f), viewsFor(context, kind, WidgetLayoutPolicy.Size.SMALL));
            mapping.put(new SizeF(250f, 160f), viewsFor(context, kind, WidgetLayoutPolicy.Size.MEDIUM));
            mapping.put(new SizeF(250f, 240f), viewsFor(context, kind, WidgetLayoutPolicy.Size.LARGE));
        } else if (kind == WidgetLayoutPolicy.Kind.PERIODS) {
            mapping.put(new SizeF(140f, 115f), viewsFor(context, kind, WidgetLayoutPolicy.Size.SMALL));
            mapping.put(new SizeF(240f, 135f), viewsFor(context, kind, WidgetLayoutPolicy.Size.MEDIUM));
            mapping.put(new SizeF(250f, 230f), viewsFor(context, kind, WidgetLayoutPolicy.Size.LARGE));
        } else {
            mapping.put(new SizeF(140f, 115f), viewsFor(context, kind, WidgetLayoutPolicy.Size.SMALL));
            mapping.put(new SizeF(240f, 155f), viewsFor(context, kind, WidgetLayoutPolicy.Size.MEDIUM));
            mapping.put(new SizeF(250f, 230f), viewsFor(context, kind, WidgetLayoutPolicy.Size.LARGE));
        }
        return Build.VERSION.SDK_INT >= Build.VERSION_CODES.S
                ? new RemoteViews(mapping)
                : viewsFor(context, kind, WidgetLayoutPolicy.Size.MEDIUM);
    }

    static RemoteViews views(Context context) {
        return viewsFor(context, WidgetLayoutPolicy.Kind.TODAY, WidgetLayoutPolicy.Size.MEDIUM);
    }

    static RemoteViews views(Context context, WidgetLayoutPolicy.Kind kind, int widthDp, int heightDp) {
        return viewsFor(context, kind, WidgetLayoutPolicy.selectSize(kind, widthDp, heightDp));
    }

    static RemoteViews viewsFor(Context context, WidgetLayoutPolicy.Kind kind, WidgetLayoutPolicy.Size size) {
        JSONObject snapshot = UsageWidgetStore.read(context);
        boolean connected = !new ConnectionStore(context).binding().isEmpty();
        long fetchedAt = snapshot.optLong("fetchedAt");
        boolean hasData = fetchedAt > 0;
        boolean failed = snapshot.optBoolean("failed");
        String datePart = hasData ? new SimpleDateFormat("MM-dd", Locale.getDefault()).format(new Date(fetchedAt)) : "";
        String timestamp = hasData ? new SimpleDateFormat("MM-dd HH:mm", Locale.getDefault()).format(new Date(fetchedAt)) : "";
        String status = !connected ? context.getString(R.string.widget_connect)
                : snapshot.optBoolean("authentication") ? context.getString(R.string.widget_authentication)
                : failed ? context.getString(hasData ? R.string.widget_offline_snapshot : R.string.widget_offline)
                : hasData ? context.getString(R.string.widget_snapshot) : context.getString(R.string.widget_waiting);
        String updatedText = hasData ? status + " · " + timestamp : status;
        int updatedColor = failed ? Color.rgb(251, 191, 36) : Color.rgb(148, 163, 184);

        RemoteViews views;
        if (kind == WidgetLayoutPolicy.Kind.COMPACT && size == WidgetLayoutPolicy.Size.COMPACT_BAR) {
            views = new RemoteViews(context.getPackageName(), R.layout.widget_compact_2x1);
            views.setTextViewText(R.id.widget_period, hasData
                    ? datePart + " · " + context.getString(R.string.widget_today_short)
                    : context.getString(R.string.widget_today));
            views.setTextViewText(R.id.widget_tokens, hasData ? snapshot.optString("tokens", "—") : "—");
            String barSub = !connected ? context.getString(R.string.widget_connect)
                    : failed && !hasData ? context.getString(R.string.widget_offline)
                    : hasData ? snapshot.optString("cost", "—")
                    : context.getString(R.string.widget_waiting);
            views.setTextViewText(R.id.widget_cost, barSub);
            views.setTextColor(R.id.widget_cost, failed ? Color.rgb(251, 191, 36) : Color.rgb(110, 231, 183));
            bindIntents(context, views, connected);
            return views;
        }

        if (kind == WidgetLayoutPolicy.Kind.QUOTA) {
            views = renderQuotaViews(context, snapshot, hasData, size, updatedText, updatedColor);
            bindIntents(context, views, connected);
            return views;
        }

        if (size == WidgetLayoutPolicy.Size.SMALL) {
            views = new RemoteViews(context.getPackageName(), R.layout.widget_compact_2x2);
            views.setTextViewText(R.id.widget_period, hasData
                    ? datePart + " · " + context.getString(R.string.widget_today_short)
                    : context.getString(R.string.widget_today));
            views.setTextViewText(R.id.widget_tokens, hasData ? snapshot.optString("tokens", "—") : "—");
            views.setTextViewText(R.id.widget_cost_label, context.getString(
                    snapshot.optBoolean("partialCost") ? R.string.widget_cost_partial : R.string.widget_cost_short));
            views.setTextViewText(R.id.widget_cost, hasData ? snapshot.optString("cost", "—") : "—");
            views.setTextViewText(R.id.widget_month_tokens, hasData ? snapshot.optString("monthTokens", "—") : "—");
            views.setTextViewText(R.id.widget_updated, updatedText);
            views.setTextColor(R.id.widget_updated, updatedColor);
            bindIntents(context, views, connected);
            return views;
        }

        if (kind == WidgetLayoutPolicy.Kind.PERIODS) {
            int layoutId = size == WidgetLayoutPolicy.Size.LARGE
                    ? R.layout.widget_periods_large
                    : R.layout.widget_periods_medium;
            views = new RemoteViews(context.getPackageName(), layoutId);
            views.setTextViewText(R.id.widget_period, hasData
                    ? context.getString(R.string.widget_today_short) + " · " + datePart
                    : context.getString(R.string.widget_today_short));
            views.setTextViewText(R.id.widget_tokens, hasData ? snapshot.optString("tokens", "—") : "—");
            views.setTextViewText(R.id.widget_cost, hasData ? snapshot.optString("cost", "—") : "—");
            views.setTextViewText(R.id.widget_month_tokens, hasData ? snapshot.optString("monthTokens", "—") : "—");
            views.setTextViewText(R.id.widget_month_cost, hasData ? snapshot.optString("monthCost", "—") : "—");
            views.setTextViewText(R.id.widget_all_tokens, hasData ? snapshot.optString("allTimeTokens", "—") : "—");
            views.setTextViewText(R.id.widget_all_cost, hasData ? snapshot.optString("allTimeCost", "—") : "—");
            if (size == WidgetLayoutPolicy.Size.LARGE) {
                // Older summaries used recorded rows rather than calendar days.
                // Keep their other readings, but wait for a new history projection.
                boolean hasHistory = hasData && snapshot.has("sevenDayDays");
                String sevenDay = hasHistory ? snapshot.optString("sevenDayTokens", "—") : "—";
                views.setTextViewText(R.id.widget_seven_day_tokens, sevenDay);
                int days = snapshot.optInt("sevenDayDays", 0);
                views.setTextViewText(R.id.widget_seven_day_label, context.getString(days > 0 && days < 7
                        ? R.string.widget_seven_day_partial : R.string.widget_seven_day));
                views.setContentDescription(R.id.widget_seven_day_tokens, context.getString(R.string.widget_seven_day_description,
                        days, sevenDay));
                views.setTextViewText(R.id.widget_peak_tokens, hasHistory ? snapshot.optString("peakDayTokens", "—") : "—");
                views.setTextViewText(R.id.widget_cache, hasData ? snapshot.optString("cache", "—") : "—");
                views.setTextViewText(R.id.widget_devices, hasData ? snapshot.optString("devices", "—") : "—");
                views.setTextViewText(R.id.widget_tools_summary, hasData ? formatTopClients(snapshot.optJSONArray("topClients")) : "—");
            }
            views.setTextViewText(R.id.widget_updated, updatedText);
            views.setTextColor(R.id.widget_updated, updatedColor);
            bindIntents(context, views, connected);
            return views;
        }

        int layoutId = size == WidgetLayoutPolicy.Size.LARGE ? R.layout.usage_widget_large : R.layout.usage_widget;
        views = new RemoteViews(context.getPackageName(), layoutId);
        views.setTextViewText(R.id.widget_tokens, hasData ? snapshot.optString("tokens", "—") : "—");
        views.setTextViewText(R.id.widget_cost, hasData ? snapshot.optString("cost", "—") : "—");
        views.setTextViewText(R.id.widget_cache, hasData ? snapshot.optString("cache", "—") : "—");
        views.setTextViewText(R.id.widget_devices, hasData ? snapshot.optString("devices", "—") : "—");
        views.setTextViewText(R.id.widget_cost_label, context.getString(
                snapshot.optBoolean("partialCost") ? R.string.widget_cost_partial : R.string.widget_cost));
        // Always date the snapshot: a delayed job must not present yesterday's reading as live usage.
        views.setTextViewText(R.id.widget_period, hasData
                ? datePart + " · " + context.getString(R.string.widget_today)
                : context.getString(R.string.widget_today));
        if (size == WidgetLayoutPolicy.Size.LARGE) {
            String inTok = snapshot.optString("inputTokens", "—");
            String outTok = snapshot.optString("outputTokens", "—");
            views.setTextViewText(R.id.widget_io_summary, hasData && !"—".equals(inTok)
                    ? "输入 " + inTok + " · 输出 " + outTok : "");
            int cachePct = snapshot.optInt("cachePercentInt", -1);
            if (hasData && cachePct >= 0) {
                views.setViewVisibility(R.id.widget_cache_bar, View.VISIBLE);
                views.setProgressBar(R.id.widget_cache_bar, 100, cachePct, false);
            } else {
                views.setViewVisibility(R.id.widget_cache_bar, View.GONE);
            }
            views.setTextViewText(R.id.widget_tools_summary, hasData ? formatTopClients(snapshot.optJSONArray("topClients")) : "—");
        }
        views.setTextViewText(R.id.widget_updated, updatedText);
        views.setTextColor(R.id.widget_updated, updatedColor);
        bindIntents(context, views, connected);
        return views;
    }

    private static RemoteViews renderQuotaViews(Context context, JSONObject snapshot, boolean hasData,
                                                WidgetLayoutPolicy.Size size, String updatedText, int updatedColor) {
        JSONArray quotas = snapshot.optJSONArray("quotas");
        int count = quotas == null ? 0 : quotas.length();
        int totalAccounts = snapshot.optInt("quotaAccounts", 0);
        int healthyAccounts = snapshot.optInt("quotaHealthy", 0);
        int alertAccounts = snapshot.optInt("quotaAlerts", 0);

        if (size == WidgetLayoutPolicy.Size.SMALL) {
            RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_quota_small);
            String headline = !hasData ? "—"
                    : totalAccounts == 0 ? "未配置账户"
                    : alertAccounts > 0 ? alertAccounts + " 项需关注"
                    : healthyAccounts + " 账户正常";
            views.setTextViewText(R.id.widget_quota_headline, headline);
            views.setTextColor(R.id.widget_quota_headline,
                    hasData && alertAccounts > 0 ? Color.rgb(251, 191, 36) : Color.rgb(248, 250, 252));
            bindQuotaRow(views, quotas, 0, R.id.widget_quota_row_1, R.id.widget_quota_1_label,
                    R.id.widget_quota_1_value, R.id.widget_quota_1_bar, R.id.widget_quota_1_bar_warn, hasData);
            views.setTextViewText(R.id.widget_updated, updatedText);
            views.setTextColor(R.id.widget_updated, updatedColor);
            return views;
        }

        int layoutId = size == WidgetLayoutPolicy.Size.LARGE ? R.layout.widget_quota_large : R.layout.widget_quota_medium;
        RemoteViews views = new RemoteViews(context.getPackageName(), layoutId);
        String headline = !hasData || totalAccounts == 0 ? ""
                : "正常 " + healthyAccounts + "/" + totalAccounts + (alertAccounts > 0 ? " · 关注 " + alertAccounts : "");
        views.setTextViewText(R.id.widget_quota_headline, headline);
        views.setTextColor(R.id.widget_quota_headline,
                alertAccounts > 0 ? Color.rgb(251, 191, 36) : Color.rgb(110, 231, 183));

        boolean showEmpty = !hasData || count == 0;
        views.setViewVisibility(R.id.widget_quota_empty, showEmpty ? View.VISIBLE : View.GONE);
        bindQuotaRow(views, quotas, 0, R.id.widget_quota_row_1, R.id.widget_quota_1_label,
                R.id.widget_quota_1_value, R.id.widget_quota_1_bar, R.id.widget_quota_1_bar_warn, hasData);
        bindQuotaRow(views, quotas, 1, R.id.widget_quota_row_2, R.id.widget_quota_2_label,
                R.id.widget_quota_2_value, R.id.widget_quota_2_bar, R.id.widget_quota_2_bar_warn, hasData);
        if (size == WidgetLayoutPolicy.Size.LARGE) {
            bindQuotaRow(views, quotas, 2, R.id.widget_quota_row_3, R.id.widget_quota_3_label,
                    R.id.widget_quota_3_value, R.id.widget_quota_3_bar, R.id.widget_quota_3_bar_warn, hasData);
            views.setTextViewText(R.id.widget_devices, hasData ? "设备 " + snapshot.optString("devices", "—") : "—");
        }
        views.setTextViewText(R.id.widget_updated, updatedText);
        views.setTextColor(R.id.widget_updated, updatedColor);
        return views;
    }

    private static void bindQuotaRow(RemoteViews views, JSONArray quotas, int index, int rowId,
                                     int labelId, int valueId, int barOkId, int barWarnId, boolean hasData) {
        if (!hasData || quotas == null || index >= quotas.length()) {
            views.setViewVisibility(rowId, View.GONE);
            return;
        }
        JSONObject item = quotas.optJSONObject(index);
        if (item == null) {
            views.setViewVisibility(rowId, View.GONE);
            return;
        }
        views.setViewVisibility(rowId, View.VISIBLE);
        views.setTextViewText(labelId, item.optString("label", "配额"));
        int pct = Math.max(0, Math.min(100, item.optInt("percent", 0)));
        boolean warn = item.optBoolean("warn", false);
        views.setTextViewText(valueId, item.optString("value", pct + "%") + " 已用");
        views.setTextColor(valueId, warn ? Color.rgb(251, 191, 36) : Color.rgb(125, 211, 252));
        views.setViewVisibility(barOkId, warn ? View.GONE : View.VISIBLE);
        views.setViewVisibility(barWarnId, warn ? View.VISIBLE : View.GONE);
        views.setProgressBar(warn ? barWarnId : barOkId, 100, Math.max(2, pct), false);
    }

    private static String formatTopClients(JSONArray topClients) {
        if (topClients == null || topClients.length() == 0) return "—";
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < topClients.length(); i++) {
            JSONObject item = topClients.optJSONObject(i);
            if (item == null) continue;
            if (sb.length() > 0) sb.append(" · ");
            sb.append(item.optString("label", "其他")).append(' ').append(item.optString("tokens", "0"));
        }
        return sb.length() == 0 ? "—" : sb.toString();
    }

    private static void bindIntents(Context context, RemoteViews views, boolean connected) {
        PendingIntent open = PendingIntent.getActivity(context, 80, new Intent(context, MainActivity.class)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP),
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        views.setOnClickPendingIntent(R.id.widget_card, open);
        Intent refresh = new Intent(context, UsageWidgetProvider.class).setAction(REFRESH);
        views.setOnClickPendingIntent(R.id.widget_refresh, connected
                ? PendingIntent.getBroadcast(context, 81, refresh, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE)
                : open);
    }

    static void handleUpdate(Context context) {
        renderAll(context);
        UsageWidgetRefreshService.schedule(context);
    }

    static void handleDisabled(Context context) {
        if (!hasAnyWidgets(context)) UsageWidgetStore.clear(context);
    }

    @Override public void onUpdate(Context context, AppWidgetManager manager, int[] appWidgetIds) {
        handleUpdate(context);
    }

    @Override public void onAppWidgetOptionsChanged(Context context, AppWidgetManager manager, int id, Bundle options) {
        renderAll(context);
    }

    @Override public void onDisabled(Context context) {
        handleDisabled(context);
    }

    @Override public void onReceive(Context context, Intent intent) {
        super.onReceive(context, intent);
        if (REFRESH.equals(intent.getAction())) UsageWidgetRefreshService.schedule(context);
    }
}
