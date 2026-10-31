package com.vmd.automation.core;

import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Deque;
import java.util.List;

/**
 * Undo-actions for everything a scenario created, executed newest-first (children before parents).
 * Every action runs even if an earlier one failed; failures are reported together afterwards, so one
 * stuck record never hides the rest and never leaves later records behind.
 */
public final class Cleanup {

    private record Action(String description, Runnable body) {}

    private final Deque<Action> actions = new ArrayDeque<>();

    public void register(String description, Runnable body) {
        actions.push(new Action(description, body));
    }

    public void runAll() {
        List<String> failures = new ArrayList<>();
        while (!actions.isEmpty()) {
            Action action = actions.pop();
            try {
                action.body().run();
            } catch (RuntimeException | AssertionError e) {
                failures.add(action.description() + " -> " + e.getMessage());
            }
        }
        if (!failures.isEmpty()) {
            throw new AssertionError("cleanup left test data behind:\n  " + String.join("\n  ", failures));
        }
    }
}
