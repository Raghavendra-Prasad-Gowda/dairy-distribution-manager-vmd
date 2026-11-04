@api @security @access
Feature: Permitted access by role
  The refusals for every endpoint are in access-control-matrix.feature. These scenarios check the other
  half: callers who ARE allowed get past the role check (a validation error afterwards is fine).

  @superadmin
  Scenario: A dispatcher can read stock availability and the daily dispatch sheet
    When dispatcher calls "GET /api/v1/reports/daily-dispatch?date=${today}"
    Then the request is not blocked by access control
    When dispatcher calls "GET /api/v1/stock-receipts/availability?date=${today}"
    Then the request is not blocked by access control

  Scenario Outline: Admins pass the role check on admin endpoints
    When admin calls "<request>"
    Then the request is not blocked by access control

    Examples:
      | request                                              |
      | GET /api/v1/brands                                   |
      | GET /api/v1/categories                               |
      | GET /api/v1/products                                 |
      | GET /api/v1/routes                                   |
      | GET /api/v1/dairy-payments                           |
      | GET /api/v1/salespeople                              |
      | GET /api/v1/bills                                    |
      | GET /api/v1/reports/outstanding                      |
      | GET /api/v1/reports/daily-dispatch?date=${today}     |
      | GET /api/v1/stock-receipts?date=${today}             |

  @superadmin
  Scenario Outline: Superadmins pass the role check on superadmin endpoints
    When superadmin calls "<request>"
    Then the request is not blocked by access control

    Examples:
      | request                  |
      | GET /api/v1/admin-users  |
      | GET /api/v1/brands       |

  Scenario: Only a dispatcher may finalise the day; admins are refused
    When admin calls "POST /api/v1/dispatches/finalize-day"
    Then the response status is 403
    And the error message contains "Dispatcher access required"
