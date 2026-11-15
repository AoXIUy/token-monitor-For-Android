package com.tokenmonitor.android;

/** Portable observation-time observer-merge rules adapted from upstream #1490. */
final class LimitsHistoryPolicy {
    static final double JITTER_PP = 1.0;

    static final class Decision {
        final boolean accept, refreshOwner, baseline, ambiguous;
        Decision(boolean accept, boolean refreshOwner, boolean baseline, boolean ambiguous) {
            this.accept = accept;
            this.refreshOwner = refreshOwner;
            this.baseline = baseline;
            this.ambiguous = ambiguous;
        }
    }

    static Decision evaluate(boolean hasTail, boolean switched, boolean current, boolean consistent,
                             boolean missingBasisOnly, boolean basisReturned, boolean lateDeadline,
                             boolean jitter, boolean laterDeadline, boolean basisChanged) {
        if (!hasTail) return new Decision(true, false, false, false);
        if (switched && current && missingBasisOnly) {
            return new Decision(false, false, false, false);
        }
        boolean baseline = false;
        if (!consistent && !missingBasisOnly && !basisReturned) {
            if (lateDeadline) return new Decision(false, false, false, false);
            if (jitter) return new Decision(false, !switched, false, false);
            if (switched && !laterDeadline) {
                if (current) return new Decision(false, false, false, false);
                baseline = true;
            }
        }
        return new Decision(true, false, baseline, basisChanged || baseline);
    }
}
