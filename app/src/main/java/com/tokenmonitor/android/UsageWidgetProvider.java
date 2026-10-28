package com.tokenmonitor.android;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.graphics.Color;
import android.os.Bundle;
import android.widget.RemoteViews;
import org.json.JSONObject;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;

/** Native launcher card; all network work is delegated to a system-managed job. */
public final class UsageWidgetProvider extends AppWidgetProvider {
    private static final String REFRESH = "com.tokenmonitor.android.REFRESH_USAGE_WIDGET";

    static int[] ids(Context context) {
        return AppWidgetManager.getInstance(context).getAppWidgetIds(new ComponentName(context, UsageWidgetProvider.class));
    }

    static void renderAll(Context context) {
        synchronized (UsageWidgetStore.LOCK) {
            int[] ids = ids(context);
            // A launcher/system IPC failure must not interrupt saving a Hub connection.
            try {
                if (ids.length > 0) AppWidgetManager.getInstance(context).updateAppWidget(ids, views(context));
            } catch (RuntimeException ignored) { }
        }
    }

    static RemoteViews views(Context context) {
        JSONObject snapshot = UsageWidgetStore.read(context);
        boolean connected = !new ConnectionStore(context).binding().isEmpty();
        long fetchedAt = snapshot.optLong("fetchedAt");
        boolean hasData = fetchedAt > 0;
        boolean failed = snapshot.optBoolean("failed");
        String timestamp = hasData ? new SimpleDateFormat("MM-dd HH:mm", Locale.getDefault()).format(new Date(fetchedAt)) : "";
        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.usage_widget);
        views.setTextViewText(R.id.widget_tokens, hasData ? snapshot.optString("tokens", "—") : "—");
        views.setTextViewText(R.id.widget_cost, hasData ? snapshot.optString("cost", "—") : "—");
        views.setTextViewText(R.id.widget_cache, hasData ? snapshot.optString("cache", "—") : "—");
        views.setTextViewText(R.id.widget_devices, hasData ? snapshot.optString("devices", "—") : "—");
        views.setTextViewText(R.id.widget_cost_label, context.getString(snapshot.optBoolean("partialCost") ? R.string.widget_cost_partial : R.string.widget_cost));
        // Always date the snapshot: a delayed job must not present yesterday's reading as live usage.
        views.setTextViewText(R.id.widget_period, hasData
                ? new SimpleDateFormat("MM-dd", Locale.getDefault()).format(new Date(fetchedAt)) + " · " + context.getString(R.string.widget_today)
                : context.getString(R.string.widget_today));
        String status = !connected ? context.getString(R.string.widget_connect)
                : snapshot.optBoolean("authentication") ? context.getString(R.string.widget_authentication)
                : failed ? context.getString(hasData ? R.string.widget_offline_snapshot : R.string.widget_offline)
                : hasData ? context.getString(R.string.widget_snapshot) : context.getString(R.string.widget_waiting);
        views.setTextViewText(R.id.widget_updated, hasData ? status + " · " + timestamp : status);
        views.setTextColor(R.id.widget_updated, failed ? Color.rgb(251, 191, 36) : Color.rgb(148, 163, 184));
        PendingIntent open = PendingIntent.getActivity(context, 80, new Intent(context, MainActivity.class)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP), PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        views.setOnClickPendingIntent(R.id.widget_card, open);
        Intent refresh = new Intent(context, UsageWidgetProvider.class).setAction(REFRESH);
        views.setOnClickPendingIntent(R.id.widget_refresh, connected
                ? PendingIntent.getBroadcast(context, 81, refresh, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE) : open);
        return views;
    }

    @Override public void onUpdate(Context context, AppWidgetManager manager, int[] appWidgetIds) {
        renderAll(context);
        UsageWidgetRefreshService.schedule(context);
    }

    @Override public void onAppWidgetOptionsChanged(Context context, AppWidgetManager manager, int id, Bundle options) {
        renderAll(context);
    }

    @Override public void onDisabled(Context context) { UsageWidgetStore.clear(context); }

    @Override public void onReceive(Context context, Intent intent) {
        super.onReceive(context, intent);
        if (REFRESH.equals(intent.getAction())) UsageWidgetRefreshService.schedule(context);
    }
}
