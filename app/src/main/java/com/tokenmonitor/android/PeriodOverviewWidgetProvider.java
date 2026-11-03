package com.tokenmonitor.android;

import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.os.Bundle;

/** Multi-period (Today / Month / All-Time) launcher widget card. */
public final class PeriodOverviewWidgetProvider extends AppWidgetProvider {
    @Override public void onUpdate(Context context, AppWidgetManager manager, int[] appWidgetIds) {
        UsageWidgetProvider.handleUpdate(context);
    }

    @Override public void onAppWidgetOptionsChanged(Context context, AppWidgetManager manager, int id, Bundle options) {
        UsageWidgetProvider.renderAll(context);
    }

    @Override public void onDisabled(Context context) {
        UsageWidgetProvider.handleDisabled(context);
    }
}
