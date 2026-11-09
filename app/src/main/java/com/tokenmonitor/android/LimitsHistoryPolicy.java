package com.tokenmonitor.android;

/** Portable source-handoff rules adapted from upstream historyDatabase.
 * Stored 1 is a real conflict, including legacy ambiguous histories. Stored 2
 * prefers a replacement observer without turning compatible later handoffs
 * into conflicts. No schema migration or history rewriting is needed. */
final class LimitsHistoryPolicy {
    static final int GUARD_CONFLICT = 1;
    static final int GUARD_PREFERRED = 2;

    static final class Decision {
        final boolean accept, conflict, ambiguous, breakBefore;
        final int guard;
        Decision(boolean accept, boolean conflict, boolean ambiguous, boolean breakBefore, int guard) {
            this.accept = accept; this.conflict = conflict; this.ambiguous = ambiguous;
            this.breakBefore = breakBefore; this.guard = guard;
        }
    }

    static Decision handoff(int guard, boolean switched, boolean healthy, boolean consistent,
                            boolean basisChanged, boolean missingBasisOnly) {
        if (switched && healthy && (guard != 0 || !consistent)) {
            boolean conflict = !consistent && !missingBasisOnly;
            return new Decision(false, conflict, false, false, conflict ? GUARD_CONFLICT : guard);
        }
        boolean ambiguous = basisChanged || switched && (guard == GUARD_CONFLICT || !consistent || !healthy);
        int next = guard == GUARD_CONFLICT || basisChanged || switched && !consistent ? GUARD_CONFLICT
                : guard != 0 ? guard : ambiguous ? GUARD_PREFERRED : 0;
        return new Decision(true, false, ambiguous, switched && guard == GUARD_CONFLICT, next);
    }
}
