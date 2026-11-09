package com.tokenmonitor.android;

/** Exercises the persisted guard progression behind upstream #1392. */
public final class LimitsHistoryPolicyChecks {
    private static int checks;
    private static void check(boolean condition) {
        if (!condition) throw new AssertionError("History handoff check " + (checks + 1) + " failed");
        checks++;
    }
    public static void main(String[] args) {
        // A -> B after a gap/failure: prefer B, without inventing a conflict.
        LimitsHistoryPolicy.Decision b = LimitsHistoryPolicy.handoff(0, true, false, true, false, false);
        check(b.accept && b.ambiguous && !b.breakBefore);
        check(b.guard == LimitsHistoryPolicy.GUARD_PREFERRED);
        // While B is healthy an old observer cannot inject a compatible jump.
        LimitsHistoryPolicy.Decision old = LimitsHistoryPolicy.handoff(b.guard, true, true, true, false, false);
        check(!old.accept && !old.conflict && old.guard == b.guard);
        // Reopen using the persisted guard; after B fails, a compatible A and
        // then B can continue net consumption without a new conflict boundary.
        LimitsHistoryPolicy.Decision a = LimitsHistoryPolicy.handoff(b.guard, true, false, true, false, false);
        check(a.accept && a.ambiguous && !a.breakBefore);
        check(a.guard == LimitsHistoryPolicy.GUARD_PREFERRED);
        LimitsHistoryPolicy.Decision back = LimitsHistoryPolicy.handoff(a.guard, true, false, true, false, false);
        check(back.accept && !back.breakBefore && back.guard == a.guard);
        // An actual disagreement upgrades the preference to a durable conflict.
        LimitsHistoryPolicy.Decision conflict = LimitsHistoryPolicy.handoff(back.guard, true, true, false, false, false);
        check(!conflict.accept && conflict.conflict);
        check(conflict.guard == LimitsHistoryPolicy.GUARD_CONFLICT);
        LimitsHistoryPolicy.Decision recovery = LimitsHistoryPolicy.handoff(conflict.guard, true, false, true, false, false);
        check(recovery.accept && recovery.ambiguous && recovery.breakBefore);
        check(recovery.guard == LimitsHistoryPolicy.GUARD_CONFLICT);
        // Legacy 1 remains a conflict. Missing allowance metadata alone does not
        // establish disagreement; a real allowance change does.
        check(LimitsHistoryPolicy.handoff(1, true, false, true, false, false).breakBefore);
        check(!LimitsHistoryPolicy.handoff(2, true, true, false, false, true).conflict);
        check(LimitsHistoryPolicy.handoff(0, false, true, false, true, false).guard == 1);
        check(LimitsHistoryPolicy.handoff(0, true, true, true, false, false).guard == 0);
        System.out.println(checks + " history handoff policy checks passed");
    }
}
