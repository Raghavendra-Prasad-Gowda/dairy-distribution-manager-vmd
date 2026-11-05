@api @known-defect
Feature: Behaviour the API should have but does not yet
  Each scenario states the correct behaviour and currently FAILS against the real backend, which the
  mocked unit-level specs could not reveal. They are excluded from the staging gate
  (-Dcucumber.filter.tags="@api and not @known-defect") so they cannot block a release; run them with
  -Dcucumber.filter.tags="@known-defect". When a defect is fixed, delete its tag and it joins the gate.

  Scenario Outline: A request body that is not valid JSON is a client error, not a server error
    When admin calls "POST /api/v1/dairy-payments" with:
      """
      <body>
      """
    Then the response status is 400

    Examples:
      | body                |
      | {bad                |
      | not json at all     |

  Scenario: A request body over the 10 KB limit is refused as too large
    When admin calls "POST /api/v1/dairy-payments" with:
      """
      { "brandId": 1, "paymentDate": "2026-04-30", "amount": 5, "notes": "${repeat:11000}" }
      """
    Then the response status is 413

  Scenario Outline: A date that does not exist on the calendar is refused
    Given a throwaway brand "brand"
    And a salesperson with a clean ledger "sp"
    When admin calls "POST /api/v1/dairy-payments" with:
      """
      { "brandId": ${brand.id}, "paymentDate": "<date>", "amount": 5 }
      """
    Then the response status is 400
    When admin calls "POST /api/v1/salesperson-payments" with:
      """
      { "salespersonId": ${sp.id}, "paymentDate": "<date>", "amount": 5 }
      """
    Then the response status is 400

    Examples:
      | date       |
      | 2026-02-30 |
      | 2026-13-45 |
      | 2026-00-10 |

  Scenario Outline: An id with trailing characters is refused instead of being read as its leading digits
    Admin edit and delete routes read the id with parseInt, so "12abc" and "1.5" are treated as 12 and 1 -
    a mistyped id could change or delete a different record. A huge id is used here so the check is harmless.

    When admin calls "<method> /api/v1/<resource>/2147483647<suffix>"
    Then the response status is 400

    Examples:
      | method | resource  | suffix |
      | DELETE | routes    | abc    |
      | DELETE | routes    | .5     |
      | DELETE | dispatches| abc    |
      | DELETE | dairy-payments | abc |
