package com.vmd.automation.core;

import java.time.LocalDate;
import java.time.ZoneId;

/** The backend validates dates against India time, so the suite must compute "today" the same way. */
public final class Dates {

    private static final ZoneId IST = ZoneId.of("Asia/Kolkata");

    private Dates() {}

    public static LocalDate todayIst() {
        return LocalDate.now(IST);
    }

    public static LocalDate todayIstPlusDays(long days) {
        return todayIst().plusDays(days);
    }
}
