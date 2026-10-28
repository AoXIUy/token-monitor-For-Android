package com.tokenmonitor.android;

import java.util.ArrayList;
import java.util.Collection;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Set;

/** Completion is an explicit turn-end following observed activity, never a timeout. */
final class SessionCompletionTracker {
    static final long MAX_GAP_MS = 120_000;
    static final long MAX_END_AGE_MS = 600_000;
    static final int MAX_SESSIONS = 2048;

    static final class Observation {
        final String key, client, label;
        final long lastUsedAt, evidenceAt, completionFloor;
        final boolean active, ended;

        Observation(String key, String client, String label, long lastUsedAt, long evidenceAt,
                    long completionFloor, boolean active, boolean ended) {
            this.key = key; this.client = client; this.label = label;
            this.lastUsedAt = lastUsedAt; this.evidenceAt = evidenceAt;
            this.completionFloor = completionFloor; this.active = active; this.ended = ended;
        }

        String eventId() { return ConnectionSpec.digest(key + "\n" + lastUsedAt); }
    }

    private static final class State {
        long armedAt, floor, latestEvidence, latestAccount, endedAt;
    }

    private final LinkedHashMap<String, State> states = new LinkedHashMap<>(16, 0.75f, true);
    private long lastSuccess;
    private boolean initialized;

    List<Observation> accept(Collection<Observation> observations, long now) {
        boolean baseline = !initialized || now < lastSuccess || now - lastSuccess > MAX_GAP_MS;
        if (baseline) states.clear();
        initialized = true;
        lastSuccess = now;
        List<Observation> completions = new ArrayList<>();
        Set<String> present = new HashSet<>();
        for (Observation observation : observations) {
            if (observation.key == null || observation.key.isEmpty() || observation.lastUsedAt <= 0
                    || observation.lastUsedAt > now || observation.evidenceAt > now) continue;
            present.add(observation.key);
            State state = states.get(observation.key);
            if (state == null) { state = new State(); states.put(observation.key, state); }
            if (observation.lastUsedAt < state.latestAccount || (observation.evidenceAt < state.latestEvidence && !observation.ended)) continue;
            state.latestEvidence = Math.max(state.latestEvidence, observation.evidenceAt);
            state.latestAccount = Math.max(state.latestAccount, observation.lastUsedAt);
            if (observation.active) {
                state.armedAt = now;
                state.floor = Math.max(state.floor, Math.max(observation.completionFloor, state.endedAt + 1));
            } else if (observation.ended) {
                // A native busy observation can be newer than an old transcript
                // end marker. That old marker must not disarm the current turn.
                if (state.armedAt > 0 && observation.lastUsedAt < state.floor) continue;
                if (!baseline && state.armedAt > 0 && now - state.armedAt <= MAX_GAP_MS
                        && observation.lastUsedAt >= state.floor && observation.lastUsedAt > state.endedAt
                        && now - observation.lastUsedAt <= MAX_END_AGE_MS) completions.add(observation);
                state.armedAt = 0;
                state.endedAt = Math.max(state.endedAt, observation.lastUsedAt);
            } else if (now - state.armedAt > MAX_GAP_MS) state.armedAt = 0;
        }
        states.keySet().retainAll(present);
        while (states.size() > MAX_SESSIONS) states.remove(states.keySet().iterator().next());
        return completions;
    }
}
