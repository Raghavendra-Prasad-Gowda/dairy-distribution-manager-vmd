@api @security
Feature: Access control by role
  The backend decides who may call what. Callers without credentials, with a broken token, or with
  the wrong role must be refused before any data is read or written.

  Scenario Outline: Callers without a token are refused
    When anonymous calls "<request>"
    Then the response status is 403

    Examples: Admin-only resources
      | request                                                   |
      | GET /api/v1/brands                                        |
      | GET /api/v1/categories                                    |
      | GET /api/v1/products                                      |
      | GET /api/v1/routes                                        |
      | GET /api/v1/salespeople                                   |
      | GET /api/v1/stock-receipts?date=2026-04-30                |
      | GET /api/v1/dairy-balance?date=2026-04-30                 |
      | GET /api/v1/dairy-payments                                |
      | GET /api/v1/salesperson-payments                          |
      | GET /api/v1/dispatches                                    |
      | GET /api/v1/bills                                         |
      | GET /api/v1/reports/outstanding                           |
      | GET /api/v1/admin-users                                   |
      | POST /api/v1/dairy-payments                               |
      | POST /api/v1/stock-receipts/bulk                          |
      | POST /api/v1/dispatches                                   |
      | DELETE /api/v1/dispatches/1                               |
      | DELETE /api/v1/dairy-payments/1                           |

  Scenario Outline: A malformed token is rejected as unauthorised
    When a caller with a malformed token calls "<request>"
    Then the response status is 401

    Examples:
      | request                              |
      | GET /api/v1/routes                   |
      | GET /api/v1/salespeople              |
      | GET /api/v1/dispatches               |
      | POST /api/v1/dairy-payments          |
      | GET /api/v1/reports/outstanding      |

  Scenario Outline: Salesmen cannot reach admin-only endpoints
    When salesman calls "<request>"
    Then the response status is 403

    Examples: Dairy side
      | request                                                   |
      | GET /api/v1/brands                                        |
      | GET /api/v1/categories                                    |
      | GET /api/v1/products                                      |
      | POST /api/v1/products                                     |
      | PUT /api/v1/products/2147483647                           |
      | DELETE /api/v1/products/2147483647                        |
      | GET /api/v1/routes                                        |
      | POST /api/v1/routes                                       |
      | DELETE /api/v1/routes/2147483647                          |
      | GET /api/v1/stock-receipts?date=2026-04-30                |
      | GET /api/v1/stock-receipts/availability?date=2026-04-30   |
      | POST /api/v1/stock-receipts/bulk                          |
      | GET /api/v1/dairy-balance?date=2026-04-30                 |
      | GET /api/v1/dairy-balance/1?date=2026-04-30               |
      | GET /api/v1/dairy-payments                                |
      | POST /api/v1/dairy-payments                               |
      | PUT /api/v1/dairy-payments/2147483647                     |
      | DELETE /api/v1/dairy-payments/2147483647                  |

    Examples: Salespeople, billing and reports
      | request                                                   |
      | GET /api/v1/salespeople                                   |
      | GET /api/v1/salespeople/1                                 |
      | POST /api/v1/salespeople                                  |
      | PUT /api/v1/salespeople/2147483647                        |
      | DELETE /api/v1/salespeople/2147483647                     |
      | POST /api/v1/salesperson-payments                         |
      | PUT /api/v1/salesperson-payments/2147483647               |
      | DELETE /api/v1/salesperson-payments/2147483647            |
      | GET /api/v1/bills                                         |
      | POST /api/v1/bills                                        |
      | DELETE /api/v1/bills/2147483647                           |
      | GET /api/v1/reports/dairy-statement                       |
      | GET /api/v1/reports/salesperson-statement                 |
      | GET /api/v1/reports/stock-summary                         |
      | GET /api/v1/reports/outstanding                           |
      | GET /api/v1/reports/deposit-summary                       |
      | GET /api/v1/reports/profit-loss                           |
      | GET /api/v1/reports/daily-dispatch                        |

  Scenario Outline: Admins cannot reach superadmin-only endpoints
    When admin calls "<request>"
    Then the response status is 403

    Examples:
      | request                                        |
      | GET /api/v1/admin-users                        |
      | POST /api/v1/admin-users                       |
      | PUT /api/v1/admin-users/2147483647             |
      | DELETE /api/v1/admin-users/2147483647          |
      | POST /api/v1/brands                            |
      | POST /api/v1/salespeople/reset-ledger          |
      | POST /api/v1/dairy-payments/bulk-topup         |
      | POST /api/v1/dairy-deposit-topups/bulk         |
      | DELETE /api/v1/dairy-deposit-topups/2147483647 |
      | PUT /api/v1/pin/update                         |
      | PUT /api/v1/pin/settings                       |
      | PUT /api/v1/pin/update-pl                      |

  @superadmin
  Scenario Outline: Dispatchers are limited to their two read routes
    When dispatcher calls "<request>"
    Then the response status is 403

    Examples:
      | request                                            |
      | GET /api/v1/stock-receipts?date=2026-04-30         |
      | GET /api/v1/dispatches                             |
      | PATCH /api/v1/dispatches/2147483647/submit         |
      | DELETE /api/v1/dispatches/2147483647               |
      | GET /api/v1/salesperson-balance/1?date=2026-04-30  |
      | GET /api/v1/salesperson-balance/1/history?from=2026-04-01&to=2026-04-30 |
      | GET /api/v1/salesperson-payments                   |
      | GET /api/v1/salespeople/1/prices                   |
      | GET /api/v1/dairy-payments                         |
      | GET /api/v1/reports/outstanding                    |
      | GET /api/v1/reports/dairy-statement                |
      | GET /api/v1/reports/profit-loss                    |
      | POST /api/v1/admin-users                           |

  @superadmin
  Scenario: Dispatchers cannot create or change stock entries
    When dispatcher calls "POST /api/v1/dispatches" with:
      """
      { "salespersonId": 1, "dispatchDate": "${today}", "items": [] }
      """
    Then the response status is 403

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
