@api @dispatch @shared-state @superadmin
Feature: Dispatch day finalisation
  Finalising "today" locks every salesperson's entry for the day, system-wide, and is a single flag per
  day. These scenarios therefore change state that real users share, and are tagged @shared-state: they
  are excluded from the staging gate and run on demand (mvn test -Dcucumber.filter.tags="@shared-state")
  against an environment nobody else is using. Each one skips if today is already finalised and undoes
  its own finalisation afterwards.

  Background:
    Given today has not been finalised
    And the day finalisation is undone afterwards
    And a throwaway brand "brand"
    And a throwaway product "milk" in brand "brand"
    And a salesperson with a clean ledger "other"

  Scenario: A dispatcher finalises the day, which locks the stragglers and marks the day finalised
    Given admin dispatches 2 of "milk" at 22 to "other" on "${today}"
    When dispatcher calls "POST /api/v1/dispatches/finalize-day"
    Then the response status is 200
    And the JSON field "data.message" equals "Day finalized"
    When admin calls "GET /api/v1/reports/daily-dispatch?date=${today}"
    Then the JSON field "data.isDayFinalized" equals "true"
    When admin calls "GET /api/v1/dispatches?salespersonId=${other.id}&date=${today}"
    Then the JSON field "data[0].isLocked" equals "true"

  Scenario: Today cannot be finalised twice
    Given dispatcher calls "POST /api/v1/dispatches/finalize-day"
    When dispatcher calls "POST /api/v1/dispatches/finalize-day"
    Then the response status is 400
    And the error message contains "already been finalized"

  Scenario: After finalisation a dispatcher can no longer unlock or lock today's entries, an admin still can
    Given admin dispatches 2 of "milk" at 22 to "other" on "${today}"
    And admin calls "GET /api/v1/dispatches?salespersonId=${other.id}&date=${today}"
    And I remember the item of "data" whose "salespersonId" is "${other.id}" as "entry"
    And dispatcher calls "POST /api/v1/dispatches/finalize-day"
    When dispatcher calls "PATCH /api/v1/dispatches/${entry.id}/unlock"
    Then the response status is 403
    And the error message contains "finalized"
    When dispatcher calls "PATCH /api/v1/dispatches/${entry.id}/lock"
    Then the response status is 403
    When admin calls "PATCH /api/v1/dispatches/${entry.id}/unlock"
    Then the response status is 200

  Scenario: An admin or superadmin can reverse today's finalisation, and only once
    Given dispatcher calls "POST /api/v1/dispatches/finalize-day"
    When admin calls "DELETE /api/v1/dispatches/finalize-day"
    Then the response status is 200
    When admin calls "GET /api/v1/reports/daily-dispatch?date=${today}"
    Then the JSON field "data.isDayFinalized" equals "false"
    When admin calls "DELETE /api/v1/dispatches/finalize-day"
    Then the response status is 400
    And the error message contains "not been explicitly finalized"
    Given dispatcher calls "POST /api/v1/dispatches/finalize-day"
    When superadmin calls "DELETE /api/v1/dispatches/finalize-day"
    Then the response status is 200
