package com.vmd.automation.core;

/** The actors the API distinguishes. {@link #ANONYMOUS} sends no credentials at all. */
public enum Role {
    ANONYMOUS,
    ADMIN,
    SUPERADMIN,
    DISPATCHER,
    SALESMAN;

    public static Role parse(String text) {
        return valueOf(text.trim().toUpperCase());
    }
}
