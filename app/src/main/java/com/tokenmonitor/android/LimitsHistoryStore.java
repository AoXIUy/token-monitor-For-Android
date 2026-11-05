package com.tokenmonitor.android;

import android.content.Context;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import android.database.sqlite.SQLiteOpenHelper;
import org.json.JSONArray;
import org.json.JSONObject;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

/** Android adaptation of upstream limits/historyStore and historyDatabase.
 * Worker-thread only. The database contains hashes and numeric observations,
 * never Hub credentials, account labels, email addresses or workspace names. */
final class LimitsHistoryStore extends SQLiteOpenHelper {
    static final String DATABASE = "limits-history.sqlite";
    private static final String UNIDENTIFIED_CLAUDE = "sha256:09367c2f144ddb36c5b877f5fb5bb1267ce8676be252618cd642aa9dc8d1d78f";
    private final String scope;

    LimitsHistoryStore(Context context, String scope) {
        super(context, DATABASE, null, 1);
        this.scope = scope;
        setWriteAheadLoggingEnabled(true);
    }

    @Override public void onConfigure(SQLiteDatabase db) { db.setForeignKeyConstraintsEnabled(true); }
    @Override public void onCreate(SQLiteDatabase db) {
        db.execSQL("CREATE TABLE streams(id TEXT PRIMARY KEY, account TEXT NOT NULL, source TEXT NOT NULL, guarded INTEGER NOT NULL DEFAULT 0, failed INTEGER NOT NULL DEFAULT 0)");
        db.execSQL("CREATE INDEX streams_account ON streams(account)");
        db.execSQL("CREATE TABLE runs(id INTEGER PRIMARY KEY, stream TEXT NOT NULL REFERENCES streams(id) ON DELETE CASCADE, start_at INTEGER NOT NULL, end_at INTEGER NOT NULL, value REAL NOT NULL, unit TEXT NOT NULL, balance INTEGER NOT NULL, reset_at INTEGER, basis TEXT NOT NULL, interval_ms INTEGER NOT NULL, break_after INTEGER NOT NULL DEFAULT 0, uncertain_before INTEGER NOT NULL DEFAULT 0, uncertain_until INTEGER)");
        db.execSQL("CREATE INDEX runs_stream_end ON runs(stream,end_at)");
        db.execSQL("CREATE TABLE origins(stream TEXT NOT NULL REFERENCES streams(id) ON DELETE CASCADE, source TEXT NOT NULL, at INTEGER NOT NULL, PRIMARY KEY(stream,source))");
        db.execSQL("CREATE TABLE daily(stream TEXT NOT NULL REFERENCES streams(id) ON DELETE CASCADE, day TEXT NOT NULL, value REAL, observations INTEGER NOT NULL DEFAULT 0, uncertain INTEGER NOT NULL DEFAULT 0, unallocated REAL NOT NULL DEFAULT 0, resets INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(stream,day))");
        db.execSQL("CREATE TABLE maintenance(day TEXT PRIMARY KEY)");
    }
    @Override public void onUpgrade(SQLiteDatabase db, int oldVersion, int newVersion) {
        throw new IllegalStateException("Unsupported quota history database");
    }

    static String day(long at) { return Instant.ofEpochMilli(at).atZone(ZoneId.systemDefault()).toLocalDate().toString(); }
    private static long since(long now, int days) {
        return LocalDate.parse(day(now)).minusDays(days - 1L).atStartOfDay(ZoneId.systemDefault()).toInstant().toEpochMilli();
    }
    private static long hourStart(long at) {
        java.time.ZonedDateTime local = Instant.ofEpochMilli(at).atZone(ZoneId.systemDefault());
        return at - local.getMinute() * 60000L - local.getSecond() * 1000L - local.getNano() / 1000000;
    }
    private static long timestamp(JSONObject object, String key) {
        try { return Instant.parse(object.optString(key)).toEpochMilli(); } catch (Exception ignored) { return 0; }
    }
    private static Double number(JSONObject object, String key) {
        Object raw = object == null ? null : object.opt(key);
        if (!(raw instanceof Number)) return null;
        double value = ((Number) raw).doubleValue();
        return Double.isFinite(value) ? value : null;
    }
    private static String hash(JSONArray parts) { return ConnectionSpec.digest(parts.toString()); }

    // Mirrors upstream historyIdentity.historyAccountKey. A reporting device is
    // provenance for a verified account, and ownership for an anonymous account.
    static String accountIdentity(JSONObject provider, String device) {
        String id = provider.optString("provider"), key = provider.optString("accountKey");
        String source = provider.optString("source");
        boolean anonymous = key.isEmpty()
                || "antigravity".equals(id) && provider.optString("accountEmail").isEmpty()
                || "kiro".equals(id) && "cli".equals(source) && provider.optString("accountEmail").isEmpty()
                || "claude".equals(id) && "cli".equals(source) && UNIDENTIFIED_CLAUDE.equals(key);
        JSONArray parts = new JSONArray().put(id).put(provider.optString("adapterId"))
                .put(key.isEmpty() ? new JSONArray().put(provider.optString("accountEmail")).put(provider.optString("accountName")) : key)
                .put(provider.optString("region")).put(provider.optString("workspaceKind"));
        if ("muse".equals(id)) parts.put(source);
        if (anonymous) parts.put("unverified").put(device).put(provider.optString("sourceDetail"));
        return parts.toString();
    }
    private String account(JSONObject provider, String device) {
        return hash(new JSONArray().put(scope).put(accountIdentity(provider, device)));
    }
    private static String windowKey(JSONObject window) {
        JSONArray parts = new JSONArray();
        String id = window.optString("limitId").trim();
        if (!id.isEmpty()) parts.put("id").put(id);
        parts.put(window.optString("kind"));
        if (id.isEmpty()) parts.put(window.optString("label"));
        parts.put(window.optString("metric")).put(window.optBoolean("additional"));
        if (!id.isEmpty()) {
            Double minutes = number(window, "windowMinutes");
            parts.put(minutes != null && minutes > 0 ? minutes : JSONObject.NULL);
        }
        return parts.toString();
    }
    private static String currency(JSONObject window) {
        String unit = window.optString("currency", "credits");
        return unit.matches("[A-Za-z]{3,8}") ? unit : "credits";
    }
    private static String stream(String account, JSONObject window, String unit) {
        String metric = window.optString("metric");
        JSONArray parts = new JSONArray().put(account).put(windowKey(window)).put(unit);
        if (("credits".equals(metric) || "spend".equals(metric)) && "pp".equals(unit)) parts.put(currency(window));
        return hash(parts);
    }

    static final class Point {
        long id, at, start, reset, interval, uncertainUntil;
        double value;
        String unit = "", basis = "";
        boolean balance, uncertainBefore;
        int broken;
    }

    // Only measured percentages/allowances become percentages. A wallet estimate
    // based on balance + spend remains a raw monetary observation in history.
    static List<Point> readings(JSONObject window) {
        List<Point> result = new ArrayList<>();
        String metric = window.optString("metric");
        boolean credits = "credits".equals(metric), spend = "spend".equals(metric);
        Double limit = number(window, "limit");
        String basis = limit != null && limit > 0 ? Double.toString(limit) : "";
        Double value = number(window, credits ? "remaining" : "used");
        Point raw = null;
        if ((credits || spend) && value != null) {
            raw = new Point(); raw.value = value; raw.unit = currency(window); raw.balance = credits; raw.basis = basis;
        }
        Double used = number(window, "usedPercent"), remaining = number(window, "remainingPercent");
        if (used == null && remaining != null) used = 100 - remaining;
        if (used == null && raw != null && !basis.isEmpty()) used = (credits ? 1 - raw.value / limit : raw.value / limit) * 100;
        if (used != null && (!(credits || spend) || window.optBoolean("showMeter", true))) {
            Point percent = new Point(); percent.value = Math.max(0, Math.min(100, used)); percent.unit = "pp"; percent.basis = basis;
            result.add(percent);
        }
        if (raw != null) result.add(raw);
        return result;
    }

    static boolean sameCycle(Point a, Point b) {
        if (!a.unit.equals(b.unit) || a.balance != b.balance || !a.basis.equals(b.basis)) return false;
        if (a.reset != b.reset && (a.reset == 0 || b.reset == 0 || Math.abs(a.reset - b.reset) > 1000)) return false;
        if (a.reset > a.at && a.reset <= b.at || b.reset > a.at && b.reset <= b.at) return false;
        return b.balance ? b.value <= a.value : b.value >= a.value;
    }
    private static Point point(Cursor cursor) {
        Point p = new Point();
        p.id = cursor.getLong(cursor.getColumnIndexOrThrow("id"));
        p.at = cursor.getLong(cursor.getColumnIndexOrThrow("end_at"));
        p.start = cursor.getLong(cursor.getColumnIndexOrThrow("start_at"));
        p.value = cursor.getDouble(cursor.getColumnIndexOrThrow("value"));
        p.unit = cursor.getString(cursor.getColumnIndexOrThrow("unit"));
        p.basis = cursor.getString(cursor.getColumnIndexOrThrow("basis"));
        p.balance = cursor.getInt(cursor.getColumnIndexOrThrow("balance")) != 0;
        p.reset = cursor.getLong(cursor.getColumnIndexOrThrow("reset_at"));
        p.interval = cursor.getLong(cursor.getColumnIndexOrThrow("interval_ms"));
        p.broken = cursor.getInt(cursor.getColumnIndexOrThrow("break_after"));
        p.uncertainBefore = cursor.getInt(cursor.getColumnIndexOrThrow("uncertain_before")) != 0;
        p.uncertainUntil = cursor.getLong(cursor.getColumnIndexOrThrow("uncertain_until"));
        return p;
    }
    private static Point latest(SQLiteDatabase db, String stream) {
        try (Cursor c = db.rawQuery("SELECT * FROM runs WHERE stream=? ORDER BY end_at DESC,id DESC LIMIT 1", new String[]{stream})) {
            return c.moveToFirst() ? point(c) : null;
        }
    }
    private static void uncertain(SQLiteDatabase db, String stream, long from, long to, long now) {
        LocalDate end = LocalDate.parse(day(to));
        for (LocalDate date = LocalDate.parse(day(Math.max(from, since(now, 730)))); !date.isAfter(end); date = date.plusDays(1)) {
            db.execSQL("INSERT OR IGNORE INTO daily(stream,day) VALUES(?,?)", new Object[]{stream, date.toString()});
            db.execSQL("UPDATE daily SET uncertain=1 WHERE stream=? AND day=?", new Object[]{stream, date.toString()});
        }
    }
    private static void interrupt(SQLiteDatabase db, String stream, Point tail, long at, long now, int reason) {
        db.execSQL("UPDATE runs SET break_after=break_after|?,uncertain_until=? WHERE id=?", new Object[]{reason, at, tail.id});
        uncertain(db, stream, tail.at, at, now);
    }

    void record(JSONObject stats, long now) throws Exception {
        prepare(stats.optJSONObject("limits"), "");
        JSONArray allDevices = stats.optJSONArray("devices");
        for (int i = 0; allDevices != null && i < allDevices.length(); i++) {
            JSONObject device = allDevices.optJSONObject(i);
            if (device != null) prepare(device.optJSONObject("limits"), device.optString("deviceId"));
        }
        SQLiteDatabase db = getWritableDatabase();
        db.beginTransaction();
        try {
            recordLimits(db, stats.optJSONObject("limits"), "", false, now);
            JSONArray devices = stats.optJSONArray("devices");
            for (int i = 0; devices != null && i < devices.length(); i++) {
                JSONObject device = devices.optJSONObject(i);
                if (device != null) recordLimits(db, device.optJSONObject("limits"), device.optString("deviceId"), device.optBoolean("stale"), now);
            }
            // Prune once per local day, rather than scanning months of history
            // on every five-second foreground poll. This marker commits with
            // the observations and survives reopening the helper.
            boolean maintained;
            try (Cursor c = db.rawQuery("SELECT day FROM maintenance WHERE day=?", new String[]{day(now)})) { maintained = c.moveToFirst(); }
            if (!maintained) {
                db.execSQL("DELETE FROM daily WHERE day<?", new Object[]{day(since(now, 730))});
                db.execSQL("DELETE FROM runs WHERE end_at<? AND id NOT IN (SELECT MAX(id) FROM runs GROUP BY stream)", new Object[]{since(now, 180)});
                db.execSQL("DELETE FROM streams WHERE id NOT IN (SELECT stream FROM runs WHERE end_at>=?) AND id NOT IN (SELECT stream FROM daily)", new Object[]{since(now, 730)});
                db.execSQL("DELETE FROM origins WHERE at<?", new Object[]{since(now, 730)});
                db.execSQL("DELETE FROM maintenance");
                db.execSQL("INSERT INTO maintenance(day) VALUES(?)", new Object[]{day(now)});
            }
            db.setTransactionSuccessful();
        } finally { db.endTransaction(); }
    }

    private void prepare(JSONObject limits, String device) throws Exception {
        JSONArray providers = limits == null ? null : limits.optJSONArray("providers");
        for (int i = 0; providers != null && i < providers.length(); i++) {
            JSONObject provider = providers.optJSONObject(i);
            if (provider == null) continue;
            String account = account(provider, provider.optString("sourceDeviceId", device));
            provider.put("androidHistoryAccount", account).put("androidHistoryKey", hash(new JSONArray().put(account).put(device)));
        }
    }

    private void recordLimits(SQLiteDatabase db, JSONObject limits, String device, boolean stale, long now) throws Exception {
        JSONArray providers = limits == null ? null : limits.optJSONArray("providers");
        for (int i = 0; providers != null && i < providers.length(); i++) {
            JSONObject provider = providers.optJSONObject(i);
            if (provider == null) continue;
            String observer = provider.optString("sourceDeviceId", device);
            String account = provider.getString("androidHistoryAccount");
            String source = hash(new JSONArray().put(observer).put(provider.optString("source")).put(provider.optString("sourceDetail")));
            if (stale || provider.optBoolean("stale") || !"ok".equals(provider.optString("status"))) {
                db.execSQL("UPDATE runs SET break_after=break_after|1 WHERE id IN (SELECT MAX(r.id) FROM runs r JOIN streams s ON r.stream=s.id WHERE s.account=? AND s.source=? GROUP BY r.stream)", new Object[]{account, source});
                db.execSQL("UPDATE streams SET failed=1 WHERE account=? AND source=?", new Object[]{account, source});
                continue;
            }
            long at = timestamp(provider, "updatedAt");
            if (at < since(now, 730) || at > now + 60_000) continue;
            long interval = Math.max(60_000, limits.optLong("refreshMs", 300_000));
            Set<String> present = new HashSet<>();
            JSONArray windows = provider.optJSONArray("windows");
            for (int j = 0; windows != null && j < windows.length(); j++) {
                JSONObject window = windows.optJSONObject(j);
                if (window == null || window.optString("kind").isEmpty()) continue;
                List<Point> readings = readings(window);
                for (Point p : readings) {
                    String id = stream(account, window, p.unit);
                    present.add(id);
                    p.at = at; p.reset = timestamp(window, "resetsAt"); p.interval = interval;
                    accept(db, account, source, id, p, now);
                }
                if (!readings.isEmpty() && !"pp".equals(readings.get(0).unit)) {
                    String percentage = stream(account, window, "pp");
                    present.add(percentage);
                    missing(db, percentage, source, at, now, 2);
                }
            }
            try (Cursor c = db.rawQuery("SELECT id FROM streams WHERE account=? AND source=?", new String[]{account, source})) {
                while (c.moveToNext()) if (!present.contains(c.getString(0))) missing(db, c.getString(0), source, at, now, 1);
            }
        }
    }

    private static void origin(SQLiteDatabase db, String id, String source, long at) {
        db.execSQL("INSERT OR REPLACE INTO origins(stream,source,at) VALUES(?,?,?)", new Object[]{id, source, at});
    }
    private static long observed(SQLiteDatabase db, String id, String source) {
        try (Cursor c = db.rawQuery("SELECT at FROM origins WHERE stream=? AND source=?", new String[]{id, source})) {
            return c.moveToFirst() ? c.getLong(0) : 0;
        }
    }
    private static void missing(SQLiteDatabase db, String id, String source, long at, long now, int reason) {
        Point tail = latest(db, id);
        if (tail == null || at <= tail.at || at <= observed(db, id, source)) return;
        try (Cursor head = db.rawQuery("SELECT source,failed FROM streams WHERE id=?", new String[]{id})) {
            if (!head.moveToFirst()) return;
            boolean healthy = head.getInt(1) == 0 && at - tail.at <= tail.interval * 2.5;
            if (!source.equals(head.getString(0)) && healthy) return;
        }
        origin(db, id, source, at);
        interrupt(db, id, tail, at, now, reason);
        db.execSQL("UPDATE streams SET source=?,failed=1 WHERE id=?", new Object[]{source, id});
    }

    private static void accept(SQLiteDatabase db, String account, String source, String id, Point p, long now) {
        if (p.at <= observed(db, id, source)) return;
        db.execSQL("INSERT OR IGNORE INTO streams(id,account,source) VALUES(?,?,?)", new Object[]{id, account, source});
        origin(db, id, source, p.at);
        Point tail = latest(db, id);
        String observer;
        boolean guarded, failed;
        try (Cursor c = db.rawQuery("SELECT source,guarded,failed FROM streams WHERE id=?", new String[]{id})) {
            c.moveToFirst(); observer = c.getString(0); guarded = c.getInt(1) != 0; failed = c.getInt(2) != 0;
        }
        boolean consistent = tail == null || sameCycle(tail, p);
        boolean missingBasis = tail != null && !tail.basis.isEmpty() && p.basis.isEmpty();
        if (missingBasis) {
            Point withBasis = new Point(); withBasis.value = p.value; withBasis.at = p.at; withBasis.reset = p.reset;
            withBasis.unit = p.unit; withBasis.balance = p.balance; withBasis.basis = tail.basis;
            missingBasis = sameCycle(tail, withBasis);
        }
        if (tail != null && p.at <= tail.at) {
            if (p.at == tail.at && (p.value != tail.value || !consistent) && !(missingBasis && p.value == tail.value && !source.equals(observer))) {
                interrupt(db, id, tail, p.at, now, 1);
                db.execSQL("UPDATE streams SET guarded=1 WHERE id=?", new Object[]{id});
            }
            return;
        }
        boolean switched = tail != null && !source.equals(observer);
        boolean healthy = tail != null && !failed && p.at - tail.at <= Math.max(tail.interval, p.interval) * 2.5;
        if (switched && healthy && (guarded || !consistent)) {
            if (!consistent && !missingBasis) {
                interrupt(db, id, tail, p.at, now, 1);
                db.execSQL("UPDATE streams SET guarded=1 WHERE id=?", new Object[]{id});
            }
            return;
        }
        boolean ambiguous = tail != null && !tail.basis.equals(p.basis) || switched && (guarded || !consistent || !healthy);
        if (ambiguous) {
            interrupt(db, id, tail, p.at, now, 1);
            tail.broken |= 1; tail.uncertainUntil = p.at;
        }
        String date = day(p.at);
        db.execSQL("INSERT OR IGNORE INTO daily(stream,day) VALUES(?,?)", new Object[]{id, date});
        db.execSQL("UPDATE daily SET observations=observations+1 WHERE stream=? AND day=?", new Object[]{id, date});
        if (tail != null) {
            boolean recovered = tail.broken == 2 && consistent;
            boolean comparable = consistent && !ambiguous && (tail.uncertainUntil == 0 || recovered);
            boolean reset = !ambiguous && !consistent;
            boolean gap = ambiguous || tail.broken != 0 || p.at - tail.at > Math.max(tail.interval, p.interval) * 2.5;
            boolean crossDay = !day(tail.at).equals(date);
            double delta = reset || ambiguous && !consistent ? 0 : Math.max(0, p.balance ? tail.value - p.value : p.value - tail.value);
            if (!reset && (!gap || comparable) && !crossDay) {
                db.execSQL("UPDATE daily SET value=COALESCE(value,0)+? WHERE stream=? AND day=?", new Object[]{delta, id, date});
            }
            if (reset || gap || crossDay && delta > 0) uncertain(db, id, tail.at, p.at, now);
            db.execSQL("UPDATE daily SET unallocated=unallocated+?,resets=resets+? WHERE stream=? AND day=?",
                    new Object[]{!reset && (crossDay || gap && !comparable) ? delta : 0, reset ? 1 : 0, id, date});
        }
        boolean extend = tail != null && !ambiguous && tail.broken == 0 && tail.value == p.value
                && tail.reset == p.reset && tail.interval == p.interval && consistent && p.at - tail.at <= p.interval * 2.5
                && hourStart(tail.at) == hourStart(p.at);
        if (extend) db.execSQL("UPDATE runs SET end_at=? WHERE id=?", new Object[]{p.at, tail.id});
        else db.execSQL("INSERT INTO runs(stream,start_at,end_at,value,unit,balance,reset_at,basis,interval_ms,uncertain_before) VALUES(?,?,?,?,?,?,?,?,?,?)",
                new Object[]{id, p.at, p.at, p.value, p.unit, p.balance ? 1 : 0, p.reset == 0 ? null : p.reset, p.basis, p.interval, ambiguous ? 1 : 0});
        db.execSQL("UPDATE streams SET source=?,guarded=?,failed=0 WHERE id=?", new Object[]{source, guarded || ambiguous ? 1 : 0, id});
    }

    private static JSONObject json(Point p, long at) throws Exception {
        JSONObject result = new JSONObject().put("at", at).put("value", p.value).put("unit", p.unit).put("balance", p.balance)
                .put("basis", p.basis).put("reset", p.reset == 0 ? JSONObject.NULL : p.reset).put("interval", p.interval);
        if (at == p.start && p.uncertainBefore) result.put("uncertainBefore", true);
        if (at == p.at && p.uncertainUntil != 0) result.put("uncertainUntil", p.uncertainUntil);
        return result;
    }

    JSONObject query(JSONObject provider, long now) throws Exception {
        SQLiteDatabase db = getReadableDatabase();
        String account = provider.getString("androidHistoryAccount");
        JSONArray result = new JSONArray(), windows = provider.optJSONArray("windows");
        for (int i = 0; windows != null && i < windows.length(); i++) {
            JSONObject window = windows.optJSONObject(i);
            if (window == null) continue;
            List<Point> readings = readings(window);
            if (readings.isEmpty()) continue;
            Point reading = readings.get(0);
            String id = stream(account, window, reading.unit);
            JSONArray points = new JSONArray(), buckets = new JSONArray();
            // Query only the current cycle / recent range. Daily accounting is
            // persisted independently and never reduced by chart sampling.
            long start = trendStart(provider.optString("provider"), window, now);
            try (Cursor c = db.rawQuery("SELECT * FROM runs WHERE stream=? AND end_at>=? AND start_at<=? ORDER BY start_at,id",
                    new String[]{id, Long.toString(Math.max(since(now, 180), start)), Long.toString(now)})) {
                Point previous = null;
                Point last = null, beforeLast = null;
                int stride = Math.max(1, (c.getCount() + 718) / 719), index = 0;
                while (c.moveToNext()) {
                    Point p = point(c);
                    if (index++ % stride == 0) appendPoints(points, p, previous, stride > 1);
                    beforeLast = previous;
                    last = p;
                    previous = p;
                }
                if (last != null && (index - 1) % stride != 0) appendPoints(points, last, beforeLast, true);
            }
            double unallocated = 0; int resets = 0;
            LocalDate today = LocalDate.parse(day(now));
            for (int d = 13; d >= 0; d--) {
                String date = today.minusDays(d).toString();
                JSONObject bucket = new JSONObject().put("key", date).put("value", JSONObject.NULL).put("observations", 0).put("uncertain", false);
                try (Cursor c = db.rawQuery("SELECT value,observations,uncertain,unallocated,resets FROM daily WHERE stream=? AND day=?", new String[]{id, date})) {
                    if (c.moveToFirst()) {
                        bucket.put("value", c.isNull(0) ? JSONObject.NULL : c.getDouble(0)).put("observations", c.getInt(1)).put("uncertain", c.getInt(2) != 0);
                        unallocated += c.getDouble(3); resets += c.getInt(4);
                    }
                }
                buckets.put(bucket);
            }
            String queryKey = windowKey(window);
            if ("credits".equals(window.optString("metric")) || "spend".equals(window.optString("metric"))) {
                queryKey = new JSONArray().put(queryKey).put(currency(window)).toString();
            }
            result.put(new JSONObject().put("key", queryKey).put("window", window).put("unit", reading.unit).put("balance", reading.balance)
                    .put("points", points).put("distribution", new JSONObject().put("buckets", buckets).put("unallocated", unallocated).put("resets", resets)));
        }
        return new JSONObject().put("key", provider.getString("androidHistoryKey")).put("windows", result).put("persistent", true).put("now", now);
    }

    private static void appendPoints(JSONArray points, Point p, Point previous, boolean sampled) throws Exception {
        JSONObject first = json(p, p.start);
        if (sampled || previous != null && previous.broken != 0) first.put("breakBefore", true);
        if (previous != null && previous.broken == 2) first.put("allowanceMissingBefore", true);
        points.put(first);
        JSONObject last = p.at > p.start ? json(p, p.at) : first;
        if (last != first) points.put(last);
        // Preserve the discontinuity across omitted runs rather than drawing
        // over unreported resets/conflicts. At most 1440 points reach WebView.
        if (sampled) last.put("uncertainUntil", p.at);
    }

    static long trendStart(String provider, JSONObject window, long now) {
        long reset = timestamp(window, "resetsAt");
        Double minutes = number(window, "windowMinutes");
        String kind = window.optString("kind");
        if (minutes == null || minutes <= 0) {
            boolean fiveHour = java.util.Arrays.asList("claude", "alibaba", "antigravity", "cline", "commandcode", "kimi", "volcengine", "zai", "zaiteam").contains(provider);
            minutes = "weekly".equals(kind) ? 10080d : "daily".equals(kind) ? 1440d : fiveHour && "session".equals(kind) ? 300d : 0d;
        }
        return reset > 0 && minutes > 0 ? reset - (long) (minutes * 60_000) : now - 14 * 86400_000L;
    }
}
