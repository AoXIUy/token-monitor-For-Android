package com.tokenmonitor.android;

/** Exercises the observation-time observer-merge rules from upstream #1490. */
public final class LimitsHistoryPolicyChecks {
    private static int checks;
    private static void check(boolean condition) {
        if (!condition) throw new AssertionError("History merge check " + (checks + 1) + " failed");
        checks++;
    }
    public static void main(String[] args) {
        // First observation always opens a timeline cleanly.
        LimitsHistoryPolicy.Decision first = LimitsHistoryPolicy.evaluate(
                false, false, false, true, false, false, false, false, false, false);
        check(first.accept && !first.baseline && !first.ambiguous);

        // Compatible switch A -> B continues seamlessly even when A was current or absent.
        LimitsHistoryPolicy.Decision compat = LimitsHistoryPolicy.evaluate(
                true, true, true, true, false, false, false, false, false, false);
        check(compat.accept && !compat.baseline && !compat.ambiguous);

        // Stale contradiction from another observer while owner is current is ignored cleanly.
        LimitsHistoryPolicy.Decision ignored = LimitsHistoryPolicy.evaluate(
                true, true, true, false, false, false, false, false, false, false);
        check(!ignored.accept && !ignored.refreshOwner);

        // Contradiction after the owner fell silent starts an uncertain baseline.
        LimitsHistoryPolicy.Decision baseline = LimitsHistoryPolicy.evaluate(
                true, true, false, false, false, false, false, false, false, false);
        check(baseline.accept && baseline.baseline && baseline.ambiguous);

        // A later deadline from another observer is a new cycle (not stale even while owner is current).
        LimitsHistoryPolicy.Decision newDeadline = LimitsHistoryPolicy.evaluate(
                true, true, true, false, false, false, false, false, true, false);
        check(newDeadline.accept && !newDeadline.baseline && !newDeadline.ambiguous);

        // A lagging report of a deadline that already passed is ignored without disrupting the timeline.
        LimitsHistoryPolicy.Decision late = LimitsHistoryPolicy.evaluate(
                true, true, true, false, false, false, true, false, false, false);
        check(!late.accept && !late.refreshOwner);

        // Sub-point rounding jitter within the same deadline is rejected; owner's own jitter refreshes liveness.
        LimitsHistoryPolicy.Decision ownerJitter = LimitsHistoryPolicy.evaluate(
                true, false, false, false, false, false, false, true, false, false);
        check(!ownerJitter.accept && ownerJitter.refreshOwner);
        LimitsHistoryPolicy.Decision peerJitter = LimitsHistoryPolicy.evaluate(
                true, true, true, false, false, false, false, true, false, false);
        check(!peerJitter.accept && !peerJitter.refreshOwner);

        // Missing basis from another current observer adds nothing; returning basis reconciles compatibly.
        LimitsHistoryPolicy.Decision missingBasis = LimitsHistoryPolicy.evaluate(
                true, true, true, false, true, false, false, false, false, true);
        check(!missingBasis.accept);
        LimitsHistoryPolicy.Decision basisReturned = LimitsHistoryPolicy.evaluate(
                true, true, true, false, false, true, false, false, false, true);
        check(basisReturned.accept && basisReturned.ambiguous && !basisReturned.baseline);

        System.out.println(checks + " history merge policy checks passed");
    }
}
