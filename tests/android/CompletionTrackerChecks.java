package com.tokenmonitor.android;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

/** Pure JDK regression checks; Android JSON admission has separate instrumented checks. */
public final class CompletionTrackerChecks {
    private static final long T = 1_800_000_000_000L;
    private static int checks;
    private static SessionCompletionTracker.Observation row(String key, long last, long evidence, long floor, boolean active, boolean ended) {
        return new SessionCompletionTracker.Observation(key, "codex", "test", T + last, T + evidence, T + floor, active, ended);
    }
    private static SessionCompletionTracker.Observation active(long at) { return row("codex:a", at, at, at, true, false); }
    private static SessionCompletionTracker.Observation ended(long at) { return row("codex:a", at, at, at, false, true); }
    private static void size(int expected, List<?> value, String message) {
        if (value.size() != expected) throw new AssertionError(message + ": expected " + expected + ", got " + value.size());
        checks++;
    }
    private static List<SessionCompletionTracker.Observation> tick(SessionCompletionTracker tracker, long now, SessionCompletionTracker.Observation... rows) {
        return tracker.accept(java.util.Arrays.asList(rows), T + now);
    }
    public static void main(String[] args) {
        SessionCompletionTracker tracker = new SessionCompletionTracker();
        size(0, tick(tracker, 0, ended(0)), "Initial completed history is silent");
        size(0, tick(tracker, 1000, active(1000)), "New activity only arms");
        size(1, tick(tracker, 2000, ended(2000)), "Active to explicit completion alerts");
        size(0, tick(tracker, 3000, ended(2000)), "Repeated snapshot is silent");
        size(0, tick(tracker, 4000, ended(4000)), "Accounting correction cannot become a new turn");
        size(0, tick(tracker, 5000, active(5000)), "Next turn arms again");
        size(1, tick(tracker, 6000, ended(6000)), "A second completed turn can notify");
        size(0, tick(tracker, 7000, active(5000)), "Outdated activity cannot re-arm");
        size(0, tick(tracker, 8000, ended(6000)), "Old end stays silent");

        tracker = new SessionCompletionTracker();
        tick(tracker, 0, active(0));
        size(0, tick(tracker, 1000, row("codex:a", 0, 1000, 0, false, false)), "Idle is not completion");
        size(1, tick(tracker, 3000, ended(2000)), "Later transcript end survives an intervening idle observation");

        tracker = new SessionCompletionTracker();
        tick(tracker, 0, active(0));
        size(0, tick(tracker, SessionCompletionTracker.MAX_GAP_MS + 1, ended(1000)), "Long outage re-baselines");
        tick(tracker, SessionCompletionTracker.MAX_GAP_MS + 2000, active(SessionCompletionTracker.MAX_GAP_MS + 2000));
        size(1, tick(tracker, SessionCompletionTracker.MAX_GAP_MS + 3000, ended(SessionCompletionTracker.MAX_GAP_MS + 3000)), "Monitoring resumes after re-baseline");

        tracker = new SessionCompletionTracker();
        tick(tracker, 0, active(0));
        tick(tracker, 1000);
        size(0, tick(tracker, 2000, ended(2000)), "Missing session is not remembered as active indefinitely");
        size(0, tick(tracker, 3000, row("codex:unknown", 3000, 3000, 3000, false, true)), "First appearance of a completed session is silent");

        tracker = new SessionCompletionTracker();
        tick(tracker, 10000, row("codex:a", 0, 10000, 10000, true, false));
        size(0, tick(tracker, 20000, ended(0)), "Old end before native activity is not a completion");
        size(1, tick(tracker, 21000, ended(20000)), "Old end cannot disarm a genuinely newer end");

        tracker = new SessionCompletionTracker();
        tick(tracker, 0, active(0));
        size(0, tick(tracker, 1000, ended(2000)), "Future peer clock is rejected");
        size(0, tick(tracker, -1000, ended(-1000)), "Clock rollback resets baseline");
        tracker = new SessionCompletionTracker();
        tick(tracker, 0, active(-1200000));
        size(0, tick(tracker, 1000, ended(-900000)), "Historical end outside the activity window is silent");

        tracker = new SessionCompletionTracker();
        tick(tracker, 0, active(0), row("claude:b", 0, 0, 0, true, false));
        size(2, tick(tracker, 1000, ended(1000), row("claude:b", 1000, 1000, 1000, false, true)), "Independent sessions each complete");
        String first = ended(1000).eventId();
        if (!first.equals(ended(1000).eventId()) || first.equals(ended(2000).eventId())) throw new AssertionError("Event identity is not stable");
        checks++;
        ConnectionSpec a = new ConnectionSpec("https://hub.example.com", "one", false);
        ConnectionSpec b = new ConnectionSpec("https://hub.example.com", "two", false);
        if (a.fingerprint().equals(b.fingerprint()) || !a.fingerprint().matches("[a-f0-9]{64}")) throw new AssertionError("Destination binding ignores credentials");
        checks++;

        tracker = new SessionCompletionTracker();
        List<SessionCompletionTracker.Observation> many = new ArrayList<>();
        for (int i = 0; i < SessionCompletionTracker.MAX_SESSIONS + 1; i++) many.add(row("codex:" + i, 0, 0, 0, true, false));
        tracker.accept(many, T);
        size(0, tracker.accept(Collections.singletonList(row("codex:0", 1000, 1000, 1000, false, true)), T + 1000), "Tracking is bounded and evicted rows do not alert");
        System.out.println(checks + " completion tracker checks passed");
    }
}
