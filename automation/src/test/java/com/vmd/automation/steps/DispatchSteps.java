package com.vmd.automation.steps;

import static org.assertj.core.api.Assertions.assertThat;

import com.vmd.automation.TestContext;
import com.vmd.automation.core.ApiClient;
import com.vmd.automation.core.AuthManager;
import com.vmd.automation.core.Dates;
import com.vmd.automation.core.Role;
import io.cucumber.java.en.Given;
import io.restassured.response.Response;
import org.opentest4j.TestAbortedException;

/** Preconditions and clean-ups for scenarios that depend on, or change, the shared "today" state. */
public class DispatchSteps {

    private final TestContext ctx;

    public DispatchSteps(TestContext ctx) {
        this.ctx = ctx;
    }

    /**
     * Whether today has been finalised is shared state that real users can change, so scenarios that need
     * it open skip (rather than fail) when it is not.
     */
    @Given("today has not been finalised")
    public void todayHasNotBeenFinalised() {
        Response res = ApiClient.withToken(AuthManager.token(Role.ADMIN))
                .get("/api/v1/reports/daily-dispatch?date=" + Dates.todayIst());
        assertThat(res.statusCode()).as("daily dispatch (%s)", res.asString()).isEqualTo(200);
        if (Boolean.TRUE.equals(res.jsonPath().get("data.isDayFinalized"))) {
            throw new TestAbortedException("Today is already finalised on this environment; scenario needs an open day");
        }
    }

    /** Registers the undo for a finalisation the scenario is about to perform. Safe if the scenario already undid it. */
    @Given("the day finalisation is undone afterwards")
    public void theDayFinalisationIsUndoneAfterwards() {
        ctx.cleanup.register("undo today's finalisation", () -> {
            Response res = ApiClient.withToken(AuthManager.token(Role.ADMIN)).delete("/api/v1/dispatches/finalize-day");
            assertThat(res.statusCode()).as("undo finalisation (%s)", res.asString()).isIn(200, 400);
        });
    }
}
