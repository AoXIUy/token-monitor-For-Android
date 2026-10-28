package com.tokenmonitor.android;

import android.app.job.JobInfo;
import android.app.job.JobParameters;
import android.app.job.JobScheduler;
import android.app.job.JobService;
import android.content.ComponentName;
import android.content.Context;
import android.os.Handler;
import android.os.Looper;
import org.json.JSONObject;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/** One bounded GET, with OS network/battery scheduling; no foreground service or polling loop. */
public final class UsageWidgetRefreshService extends JobService {
    private static final int JOB_ID = 17322;
    private final ExecutorService network = Executors.newSingleThreadExecutor();
    private final Handler main = new Handler(Looper.getMainLooper());
    private HubClient client;
    private int generation;

    static void schedule(Context context) {
        if (UsageWidgetProvider.ids(context).length == 0 || new ConnectionStore(context).binding().isEmpty()) return;
        JobScheduler scheduler = context.getSystemService(JobScheduler.class);
        // Coalesce taps/system updates rather than cancelling an in-flight read.
        if (scheduler.getPendingJob(JOB_ID) != null) return;
        scheduler.schedule(new JobInfo.Builder(JOB_ID, new ComponentName(context, UsageWidgetRefreshService.class))
                .setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY).setMinimumLatency(0).build());
    }

    static void cancel(Context context) { context.getSystemService(JobScheduler.class).cancel(JOB_ID); }

    @Override public boolean onStartJob(JobParameters params) {
        String binding = new ConnectionStore(this).binding();
        if (binding.isEmpty() || UsageWidgetProvider.ids(this).length == 0) return false;
        int epoch = ++generation;
        long startedAt = System.currentTimeMillis();
        HubClient request = new HubClient();
        client = request;
        network.execute(() -> {
            JSONObject stats = null;
            boolean authentication = false;
            try {
                ConnectionSpec spec;
                synchronized (UsageWidgetStore.LOCK) {
                    if (!binding.equals(new ConnectionStore(this).binding())) throw new IllegalStateException("Connection changed");
                    spec = new ConnectionStore(this).load();
                }
                if (spec != null) stats = request.get(spec, "/api/stats");
            } catch (Exception error) {
                authentication = error instanceof HubClient.HubError
                        && (((HubClient.HubError) error).status == 401 || ((HubClient.HubError) error).status == 403);
            }
            JSONObject result = stats;
            long fetchedAt = System.currentTimeMillis();
            boolean auth = authentication;
            main.post(() -> {
                if (epoch != generation) return;
                if (result == null || !UsageWidgetStore.publish(this, binding, result, fetchedAt, startedAt)) {
                    UsageWidgetStore.failed(this, binding, startedAt, auth);
                }
                jobFinished(params, false);
            });
        });
        return true;
    }

    @Override public boolean onStopJob(JobParameters params) {
        generation++;
        if (client != null) client.cancel();
        return true;
    }

    @Override public void onDestroy() {
        generation++;
        if (client != null) client.cancel();
        network.shutdownNow();
        super.onDestroy();
    }
}
