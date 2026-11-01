@api @security @access
Feature: Access control matrix
  Every protected endpoint is refused to callers who are not allowed to use it - without a token,
  with a broken token, and with the wrong role - before any data is read or written. Generated from
  the endpoint list of the mocked RBAC spec plus the role-guarded endpoints of every other spec.
  Refusals happen before validation, so the bodies below only need to be well-formed.


  Scenario Outline: Callers without a token are refused
    When anonymous calls "<request>"
    Then the response status is <status>

    Examples:
      | request | status |
      | GET /api/v1/stock-receipts?date=2026-04-30 | 403 |
      | GET /api/v1/stock-receipts/availability?date=2026-04-30 | 403 |
      | GET /api/v1/dairy-balance?date=2026-04-30 | 403 |
      | GET /api/v1/dairy-balance/1?date=2026-04-30 | 403 |
      | GET /api/v1/dairy-payments | 403 |
      | DELETE /api/v1/dairy-payments/1 | 403 |
      | GET /api/v1/salespeople | 403 |
      | GET /api/v1/salespeople/1 | 403 |
      | DELETE /api/v1/salespeople/1 | 403 |
      | GET /api/v1/reports/dairy-statement?brandId=1&from=2026-04-01&to=2026-04-30 | 403 |
      | GET /api/v1/reports/salesperson-statement?salespersonId=1&from=2026-04-01&to=2026-04-30 | 403 |
      | GET /api/v1/reports/stock-summary?date=2026-04-30 | 403 |
      | GET /api/v1/reports/outstanding | 403 |
      | GET /api/v1/reports/deposit-summary?brandId=1&from=2026-04-01&to=2026-04-30 | 403 |
      | GET /api/v1/reports/daily-dispatch?date=2026-04-30 | 403 |
      | GET /api/v1/routes | 403 |
      | DELETE /api/v1/routes/1 | 403 |
      | GET /api/v1/salespeople/1/products | 403 |
      | GET /api/v1/products | 403 |
      | DELETE /api/v1/products/1 | 403 |
      | GET /api/v1/products/salesperson-global | 403 |
      | DELETE /api/v1/products/1/salesperson-prices | 403 |
      | GET /api/v1/categories | 403 |
      | DELETE /api/v1/categories/1 | 403 |
      | GET /api/v1/dispatches/summary?date=2026-04-30 | 403 |
      | GET /api/v1/brands | 403 |
      | GET /api/v1/bills | 403 |
      | GET /api/v1/bills/preview?salespersonId=1&from=2026-04-01&to=2026-04-30 | 403 |
      | GET /api/v1/bills/1 | 403 |
      | DELETE /api/v1/bills/1 | 403 |
      | GET /api/v1/reports/profit-loss?from=2026-04-01&to=2026-04-30 | 403 |
      | DELETE /api/v1/salesperson-payments/1 | 403 |
      | GET /api/v1/salesperson-payments | 403 |
      | POST /api/v1/salespeople/1/prices/copy-from/2?brandId=1 | 403 |
      | DELETE /api/v1/dispatches/finalize-day | 403 |
      | GET /api/v1/dispatches | 403 |
      | PATCH /api/v1/dispatches/1/submit | 403 |
      | PATCH /api/v1/dispatches/1/lock | 403 |
      | PATCH /api/v1/dispatches/1/unlock | 403 |
      | DELETE /api/v1/dispatches/1 | 403 |
      | POST /api/v1/dispatches/finalize-day | 403 |
      | GET /api/v1/salesperson-balance/1?date=2026-04-30 | 403 |
      | GET /api/v1/salesperson-balance/1/history | 403 |
      | GET /api/v1/salespeople/1/prices | 403 |
      | GET /api/v1/salesperson-statement/me?from=2026-04-01&to=2026-04-30 | 403 |
      | POST /api/v1/auth/logout | 403 |
      | GET /api/v1/admin-users | 403 |
      | DELETE /api/v1/admin-users/1 | 403 |
      | GET /api/v1/admin-users/mfa/status | 403 |
      | DELETE /api/v1/dairy-deposit-topups/1 | 403 |

  Scenario Outline: Callers without a token are refused (with a body)
    When anonymous calls "<request>" with:
      """
      <body>
      """
    Then the response status is <status>

    Examples:
      | request | body | status |
      | POST /api/v1/stock-receipts/bulk | {"brandId": 1, "date": "2026-04-30", "items": []} | 403 |
      | POST /api/v1/dairy-payments | {"brandId": 1, "amount": 100, "paymentDate": "2026-04-30"} | 403 |
      | PUT /api/v1/dairy-payments/1 | {"amount": 100, "paymentDate": "2026-04-30"} | 403 |
      | POST /api/v1/salespeople | {"name": "Test"} | 403 |
      | PUT /api/v1/salespeople/1 | {"name": "Updated"} | 403 |
      | POST /api/v1/pin/verify | {"pin": "123456"} | 403 |
      | POST /api/v1/routes | {"brandId": 1, "routeNumber": "R1"} | 403 |
      | PUT /api/v1/routes/1 | {"routeNumber": "R2"} | 403 |
      | POST /api/v1/salespeople/1/products/bulk | {"products": [{"productId": 1, "isEnabled": true}]} | 403 |
      | POST /api/v1/products | {"name": "Test", "brandId": 1, "category": "Milk", "unitType": "ml", "unitSize": 500, "costPrice": 20, "sellingPrice": 25} | 403 |
      | PUT /api/v1/products/1 | {"name": "Updated"} | 403 |
      | PATCH /api/v1/products/salesperson-global | {"products": [{"productId": 1, "isEnabled": true, "defaultPrice": 10}]} | 403 |
      | POST /api/v1/categories | {"name": "Test", "brandId": 1} | 403 |
      | PUT /api/v1/categories/1 | {"name": "Updated"} | 403 |
      | PATCH /api/v1/brands/reorder | [{"id": 1, "displayOrder": 1}] | 403 |
      | POST /api/v1/brands/1/copy-products | {"sourceBrandId": 2} | 403 |
      | PATCH /api/v1/categories/reorder | [{"id": 1, "displayOrder": 1}] | 403 |
      | PATCH /api/v1/products/reorder | [{"id": 1, "displayOrder": 1}] | 403 |
      | PUT /api/v1/salespeople/reorder | [{"id": 1, "displayOrder": 1}] | 403 |
      | POST /api/v1/bills | {"salespersonId": 1, "from": "2026-04-01", "to": "2026-04-30"} | 403 |
      | POST /api/v1/salesperson-payments | {"salespersonId": 1, "paymentDate": "2026-04-30", "amount": 5} | 403 |
      | PUT /api/v1/salesperson-payments/1 | {"paymentDate": "2026-04-30", "amount": 5} | 403 |
      | POST /api/v1/salesperson-payments/bulk-topup | {"paymentDate": "2026-04-30", "entries": [{"salespersonId": 1, "amount": 5}]} | 403 |
      | POST /api/v1/salespeople/1/prices/bulk | {"effectiveFrom": "2999-01-01", "prices": []} | 403 |
      | POST /api/v1/salespeople/bulk-update | {"salespersonIds": [1], "effectiveFrom": "2999-01-01", "productPrices": [{"productId": 1, "sellingPrice": 5}]} | 403 |
      | POST /api/v1/salespeople/products/bulk-update | {"salespersonIds": [1], "products": [{"productId": 1, "isEnabled": true}]} | 403 |
      | POST /api/v1/pin/verify-pl | {"pin": "123456"} | 403 |
      | POST /api/v1/dispatches/open-for-entry | {"salespersonId": 1, "dispatchDate": "2026-04-30"} | 403 |
      | POST /api/v1/dispatches | {"salespersonId": 1, "dispatchDate": "2026-04-30", "items": []} | 403 |
      | POST /api/v1/auth/change-password | {"currentPassword": "a", "newPassword": "bcdefg"} | 403 |
      | POST /api/v1/admin-users | {"username": "abc", "password": "secret1"} | 403 |
      | PUT /api/v1/admin-users/1 | {"isActive": true} | 403 |
      | PUT /api/v1/admin-users/1/mfa-required | {"required": true} | 403 |
      | POST /api/v1/brands | {"name": "Nope"} | 403 |
      | PUT /api/v1/brands/1 | {"name": "Renamed"} | 403 |
      | POST /api/v1/salespeople/reset-ledger | {"salespersonIds": [1]} | 403 |
      | POST /api/v1/dairy-payments/bulk-topup | {"paymentDate": "2026-04-30", "entries": [{"brandId": 1, "amount": 5}]} | 403 |
      | POST /api/v1/dairy-deposit-topups/bulk | {"topUpDate": "2026-04-30", "entries": [{"brandId": 1, "amount": 5}]} | 403 |
      | PUT /api/v1/pin/update | {"currentPin": "x", "newPin": "123456"} | 403 |
      | PUT /api/v1/pin/update-pl | {"currentPin": "x", "newPin": "123456"} | 403 |
      | PUT /api/v1/pin/settings | {"plPinEnabled": true} | 403 |

  Scenario Outline: A malformed token is rejected as unauthorised
    When a caller with a malformed token calls "<request>"
    Then the response status is <status>

    Examples:
      | request | status |
      | GET /api/v1/stock-receipts?date=2026-04-30 | 401 |
      | GET /api/v1/stock-receipts/availability?date=2026-04-30 | 401 |
      | GET /api/v1/dairy-balance?date=2026-04-30 | 401 |
      | GET /api/v1/dairy-balance/1?date=2026-04-30 | 401 |
      | GET /api/v1/dairy-payments | 401 |
      | DELETE /api/v1/dairy-payments/1 | 401 |
      | GET /api/v1/salespeople | 401 |
      | GET /api/v1/salespeople/1 | 401 |
      | DELETE /api/v1/salespeople/1 | 401 |
      | GET /api/v1/reports/dairy-statement?brandId=1&from=2026-04-01&to=2026-04-30 | 401 |
      | GET /api/v1/reports/salesperson-statement?salespersonId=1&from=2026-04-01&to=2026-04-30 | 401 |
      | GET /api/v1/reports/stock-summary?date=2026-04-30 | 401 |
      | GET /api/v1/reports/outstanding | 401 |
      | GET /api/v1/reports/deposit-summary?brandId=1&from=2026-04-01&to=2026-04-30 | 401 |
      | GET /api/v1/reports/daily-dispatch?date=2026-04-30 | 401 |
      | GET /api/v1/routes | 401 |
      | DELETE /api/v1/routes/1 | 401 |
      | GET /api/v1/salespeople/1/products | 401 |
      | GET /api/v1/products | 401 |
      | DELETE /api/v1/products/1 | 401 |
      | GET /api/v1/products/salesperson-global | 401 |
      | DELETE /api/v1/products/1/salesperson-prices | 401 |
      | GET /api/v1/categories | 401 |
      | DELETE /api/v1/categories/1 | 401 |
      | GET /api/v1/dispatches/summary?date=2026-04-30 | 401 |
      | GET /api/v1/brands | 401 |
      | GET /api/v1/bills | 401 |
      | GET /api/v1/bills/preview?salespersonId=1&from=2026-04-01&to=2026-04-30 | 401 |
      | GET /api/v1/bills/1 | 401 |
      | DELETE /api/v1/bills/1 | 401 |
      | GET /api/v1/reports/profit-loss?from=2026-04-01&to=2026-04-30 | 401 |
      | DELETE /api/v1/salesperson-payments/1 | 401 |
      | GET /api/v1/salesperson-payments | 401 |
      | POST /api/v1/salespeople/1/prices/copy-from/2?brandId=1 | 401 |
      | DELETE /api/v1/dispatches/finalize-day | 401 |
      | GET /api/v1/dispatches | 401 |
      | PATCH /api/v1/dispatches/1/submit | 401 |
      | PATCH /api/v1/dispatches/1/lock | 401 |
      | PATCH /api/v1/dispatches/1/unlock | 401 |
      | DELETE /api/v1/dispatches/1 | 401 |
      | POST /api/v1/dispatches/finalize-day | 401 |
      | GET /api/v1/salesperson-balance/1?date=2026-04-30 | 401 |
      | GET /api/v1/salesperson-balance/1/history | 401 |
      | GET /api/v1/salespeople/1/prices | 401 |
      | GET /api/v1/salesperson-statement/me?from=2026-04-01&to=2026-04-30 | 401 |
      | POST /api/v1/auth/logout | 401 |
      | GET /api/v1/admin-users | 401 |
      | DELETE /api/v1/admin-users/1 | 401 |
      | GET /api/v1/admin-users/mfa/status | 401 |
      | DELETE /api/v1/dairy-deposit-topups/1 | 401 |

  Scenario Outline: A malformed token is rejected as unauthorised (with a body)
    When a caller with a malformed token calls "<request>" with:
      """
      <body>
      """
    Then the response status is <status>

    Examples:
      | request | body | status |
      | POST /api/v1/stock-receipts/bulk | {"brandId": 1, "date": "2026-04-30", "items": []} | 401 |
      | POST /api/v1/dairy-payments | {"brandId": 1, "amount": 100, "paymentDate": "2026-04-30"} | 401 |
      | PUT /api/v1/dairy-payments/1 | {"amount": 100, "paymentDate": "2026-04-30"} | 401 |
      | POST /api/v1/salespeople | {"name": "Test"} | 401 |
      | PUT /api/v1/salespeople/1 | {"name": "Updated"} | 401 |
      | POST /api/v1/pin/verify | {"pin": "123456"} | 401 |
      | POST /api/v1/routes | {"brandId": 1, "routeNumber": "R1"} | 401 |
      | PUT /api/v1/routes/1 | {"routeNumber": "R2"} | 401 |
      | POST /api/v1/salespeople/1/products/bulk | {"products": [{"productId": 1, "isEnabled": true}]} | 401 |
      | POST /api/v1/products | {"name": "Test", "brandId": 1, "category": "Milk", "unitType": "ml", "unitSize": 500, "costPrice": 20, "sellingPrice": 25} | 401 |
      | PUT /api/v1/products/1 | {"name": "Updated"} | 401 |
      | PATCH /api/v1/products/salesperson-global | {"products": [{"productId": 1, "isEnabled": true, "defaultPrice": 10}]} | 401 |
      | POST /api/v1/categories | {"name": "Test", "brandId": 1} | 401 |
      | PUT /api/v1/categories/1 | {"name": "Updated"} | 401 |
      | PATCH /api/v1/brands/reorder | [{"id": 1, "displayOrder": 1}] | 401 |
      | POST /api/v1/brands/1/copy-products | {"sourceBrandId": 2} | 401 |
      | PATCH /api/v1/categories/reorder | [{"id": 1, "displayOrder": 1}] | 401 |
      | PATCH /api/v1/products/reorder | [{"id": 1, "displayOrder": 1}] | 401 |
      | PUT /api/v1/salespeople/reorder | [{"id": 1, "displayOrder": 1}] | 401 |
      | POST /api/v1/bills | {"salespersonId": 1, "from": "2026-04-01", "to": "2026-04-30"} | 401 |
      | POST /api/v1/salesperson-payments | {"salespersonId": 1, "paymentDate": "2026-04-30", "amount": 5} | 401 |
      | PUT /api/v1/salesperson-payments/1 | {"paymentDate": "2026-04-30", "amount": 5} | 401 |
      | POST /api/v1/salesperson-payments/bulk-topup | {"paymentDate": "2026-04-30", "entries": [{"salespersonId": 1, "amount": 5}]} | 401 |
      | POST /api/v1/salespeople/1/prices/bulk | {"effectiveFrom": "2999-01-01", "prices": []} | 401 |
      | POST /api/v1/salespeople/bulk-update | {"salespersonIds": [1], "effectiveFrom": "2999-01-01", "productPrices": [{"productId": 1, "sellingPrice": 5}]} | 401 |
      | POST /api/v1/salespeople/products/bulk-update | {"salespersonIds": [1], "products": [{"productId": 1, "isEnabled": true}]} | 401 |
      | POST /api/v1/pin/verify-pl | {"pin": "123456"} | 401 |
      | POST /api/v1/dispatches/open-for-entry | {"salespersonId": 1, "dispatchDate": "2026-04-30"} | 401 |
      | POST /api/v1/dispatches | {"salespersonId": 1, "dispatchDate": "2026-04-30", "items": []} | 401 |
      | POST /api/v1/auth/change-password | {"currentPassword": "a", "newPassword": "bcdefg"} | 401 |
      | POST /api/v1/admin-users | {"username": "abc", "password": "secret1"} | 401 |
      | PUT /api/v1/admin-users/1 | {"isActive": true} | 401 |
      | PUT /api/v1/admin-users/1/mfa-required | {"required": true} | 401 |
      | POST /api/v1/brands | {"name": "Nope"} | 401 |
      | PUT /api/v1/brands/1 | {"name": "Renamed"} | 401 |
      | POST /api/v1/salespeople/reset-ledger | {"salespersonIds": [1]} | 401 |
      | POST /api/v1/dairy-payments/bulk-topup | {"paymentDate": "2026-04-30", "entries": [{"brandId": 1, "amount": 5}]} | 401 |
      | POST /api/v1/dairy-deposit-topups/bulk | {"topUpDate": "2026-04-30", "entries": [{"brandId": 1, "amount": 5}]} | 401 |
      | PUT /api/v1/pin/update | {"currentPin": "x", "newPin": "123456"} | 401 |
      | PUT /api/v1/pin/update-pl | {"currentPin": "x", "newPin": "123456"} | 401 |
      | PUT /api/v1/pin/settings | {"plPinEnabled": true} | 401 |

  Scenario Outline: Salesmen are refused everything outside their own data
    When salesman calls "<request>"
    Then the response status is <status>

    Examples:
      | request | status |
      | GET /api/v1/stock-receipts?date=2026-04-30 | 403 |
      | GET /api/v1/stock-receipts/availability?date=2026-04-30 | 403 |
      | GET /api/v1/dairy-balance?date=2026-04-30 | 403 |
      | GET /api/v1/dairy-balance/1?date=2026-04-30 | 403 |
      | GET /api/v1/dairy-payments | 403 |
      | DELETE /api/v1/dairy-payments/1 | 403 |
      | GET /api/v1/salespeople | 403 |
      | GET /api/v1/salespeople/1 | 403 |
      | DELETE /api/v1/salespeople/1 | 403 |
      | GET /api/v1/reports/dairy-statement?brandId=1&from=2026-04-01&to=2026-04-30 | 403 |
      | GET /api/v1/reports/salesperson-statement?salespersonId=1&from=2026-04-01&to=2026-04-30 | 403 |
      | GET /api/v1/reports/stock-summary?date=2026-04-30 | 403 |
      | GET /api/v1/reports/outstanding | 403 |
      | GET /api/v1/reports/deposit-summary?brandId=1&from=2026-04-01&to=2026-04-30 | 403 |
      | GET /api/v1/reports/daily-dispatch?date=2026-04-30 | 403 |
      | GET /api/v1/routes | 403 |
      | DELETE /api/v1/routes/1 | 403 |
      | GET /api/v1/salespeople/1/products | 403 |
      | GET /api/v1/products | 403 |
      | DELETE /api/v1/products/1 | 403 |
      | GET /api/v1/products/salesperson-global | 403 |
      | DELETE /api/v1/products/1/salesperson-prices | 403 |
      | GET /api/v1/categories | 403 |
      | DELETE /api/v1/categories/1 | 403 |
      | GET /api/v1/dispatches/summary?date=2026-04-30 | 403 |
      | GET /api/v1/brands | 403 |
      | GET /api/v1/bills | 403 |
      | GET /api/v1/bills/preview?salespersonId=1&from=2026-04-01&to=2026-04-30 | 403 |
      | GET /api/v1/bills/1 | 403 |
      | DELETE /api/v1/bills/1 | 403 |
      | GET /api/v1/reports/profit-loss?from=2026-04-01&to=2026-04-30 | 403 |
      | DELETE /api/v1/salesperson-payments/1 | 403 |
      | POST /api/v1/salespeople/1/prices/copy-from/2?brandId=1 | 403 |
      | DELETE /api/v1/dispatches/finalize-day | 403 |
      | GET /api/v1/admin-users | 403 |
      | DELETE /api/v1/admin-users/1 | 403 |
      | GET /api/v1/admin-users/mfa/status | 403 |
      | DELETE /api/v1/dairy-deposit-topups/1 | 403 |
      | PATCH /api/v1/dispatches/1/lock | 403 |
      | PATCH /api/v1/dispatches/1/unlock | 403 |
      | POST /api/v1/dispatches/finalize-day | 403 |

  Scenario Outline: Salesmen are refused everything outside their own data (with a body)
    When salesman calls "<request>" with:
      """
      <body>
      """
    Then the response status is <status>

    Examples:
      | request | body | status |
      | POST /api/v1/stock-receipts/bulk | {"brandId": 1, "date": "2026-04-30", "items": []} | 403 |
      | POST /api/v1/dairy-payments | {"brandId": 1, "amount": 100, "paymentDate": "2026-04-30"} | 403 |
      | PUT /api/v1/dairy-payments/1 | {"amount": 100, "paymentDate": "2026-04-30"} | 403 |
      | POST /api/v1/salespeople | {"name": "Test"} | 403 |
      | PUT /api/v1/salespeople/1 | {"name": "Updated"} | 403 |
      | POST /api/v1/pin/verify | {"pin": "123456"} | 403 |
      | POST /api/v1/routes | {"brandId": 1, "routeNumber": "R1"} | 403 |
      | PUT /api/v1/routes/1 | {"routeNumber": "R2"} | 403 |
      | POST /api/v1/salespeople/1/products/bulk | {"products": [{"productId": 1, "isEnabled": true}]} | 403 |
      | POST /api/v1/products | {"name": "Test", "brandId": 1, "category": "Milk", "unitType": "ml", "unitSize": 500, "costPrice": 20, "sellingPrice": 25} | 403 |
      | PUT /api/v1/products/1 | {"name": "Updated"} | 403 |
      | PATCH /api/v1/products/salesperson-global | {"products": [{"productId": 1, "isEnabled": true, "defaultPrice": 10}]} | 403 |
      | POST /api/v1/categories | {"name": "Test", "brandId": 1} | 403 |
      | PUT /api/v1/categories/1 | {"name": "Updated"} | 403 |
      | PATCH /api/v1/brands/reorder | [{"id": 1, "displayOrder": 1}] | 403 |
      | POST /api/v1/brands/1/copy-products | {"sourceBrandId": 2} | 403 |
      | PATCH /api/v1/categories/reorder | [{"id": 1, "displayOrder": 1}] | 403 |
      | PATCH /api/v1/products/reorder | [{"id": 1, "displayOrder": 1}] | 403 |
      | PUT /api/v1/salespeople/reorder | [{"id": 1, "displayOrder": 1}] | 403 |
      | POST /api/v1/bills | {"salespersonId": 1, "from": "2026-04-01", "to": "2026-04-30"} | 403 |
      | POST /api/v1/salesperson-payments | {"salespersonId": 1, "paymentDate": "2026-04-30", "amount": 5} | 403 |
      | PUT /api/v1/salesperson-payments/1 | {"paymentDate": "2026-04-30", "amount": 5} | 403 |
      | POST /api/v1/salesperson-payments/bulk-topup | {"paymentDate": "2026-04-30", "entries": [{"salespersonId": 1, "amount": 5}]} | 403 |
      | POST /api/v1/salespeople/1/prices/bulk | {"effectiveFrom": "2999-01-01", "prices": []} | 403 |
      | POST /api/v1/salespeople/bulk-update | {"salespersonIds": [1], "effectiveFrom": "2999-01-01", "productPrices": [{"productId": 1, "sellingPrice": 5}]} | 403 |
      | POST /api/v1/salespeople/products/bulk-update | {"salespersonIds": [1], "products": [{"productId": 1, "isEnabled": true}]} | 403 |
      | POST /api/v1/pin/verify-pl | {"pin": "123456"} | 403 |
      | POST /api/v1/dispatches/open-for-entry | {"salespersonId": 1, "dispatchDate": "2026-04-30"} | 403 |
      | POST /api/v1/admin-users | {"username": "abc", "password": "secret1"} | 403 |
      | PUT /api/v1/admin-users/1 | {"isActive": true} | 403 |
      | PUT /api/v1/admin-users/1/mfa-required | {"required": true} | 403 |
      | POST /api/v1/brands | {"name": "Nope"} | 403 |
      | PUT /api/v1/brands/1 | {"name": "Renamed"} | 403 |
      | POST /api/v1/salespeople/reset-ledger | {"salespersonIds": [1]} | 403 |
      | POST /api/v1/dairy-payments/bulk-topup | {"paymentDate": "2026-04-30", "entries": [{"brandId": 1, "amount": 5}]} | 403 |
      | POST /api/v1/dairy-deposit-topups/bulk | {"topUpDate": "2026-04-30", "entries": [{"brandId": 1, "amount": 5}]} | 403 |
      | PUT /api/v1/pin/update | {"currentPin": "x", "newPin": "123456"} | 403 |
      | PUT /api/v1/pin/update-pl | {"currentPin": "x", "newPin": "123456"} | 403 |
      | PUT /api/v1/pin/settings | {"plPinEnabled": true} | 403 |

  @superadmin
  Scenario Outline: Dispatchers are limited to the dispatch sheet and stock availability
    When dispatcher calls "<request>"
    Then the response status is <status>

    Examples:
      | request | status |
      | GET /api/v1/stock-receipts?date=2026-04-30 | 403 |
      | GET /api/v1/dairy-balance?date=2026-04-30 | 403 |
      | GET /api/v1/dairy-balance/1?date=2026-04-30 | 403 |
      | GET /api/v1/dairy-payments | 403 |
      | DELETE /api/v1/dairy-payments/1 | 403 |
      | GET /api/v1/salespeople | 403 |
      | GET /api/v1/salespeople/1 | 403 |
      | DELETE /api/v1/salespeople/1 | 403 |
      | GET /api/v1/reports/dairy-statement?brandId=1&from=2026-04-01&to=2026-04-30 | 403 |
      | GET /api/v1/reports/salesperson-statement?salespersonId=1&from=2026-04-01&to=2026-04-30 | 403 |
      | GET /api/v1/reports/stock-summary?date=2026-04-30 | 403 |
      | GET /api/v1/reports/outstanding | 403 |
      | GET /api/v1/reports/deposit-summary?brandId=1&from=2026-04-01&to=2026-04-30 | 403 |
      | GET /api/v1/routes | 403 |
      | DELETE /api/v1/routes/1 | 403 |
      | GET /api/v1/salespeople/1/products | 403 |
      | GET /api/v1/products | 403 |
      | DELETE /api/v1/products/1 | 403 |
      | GET /api/v1/products/salesperson-global | 403 |
      | DELETE /api/v1/products/1/salesperson-prices | 403 |
      | GET /api/v1/categories | 403 |
      | DELETE /api/v1/categories/1 | 403 |
      | GET /api/v1/dispatches/summary?date=2026-04-30 | 403 |
      | GET /api/v1/brands | 403 |
      | GET /api/v1/bills | 403 |
      | GET /api/v1/bills/preview?salespersonId=1&from=2026-04-01&to=2026-04-30 | 403 |
      | GET /api/v1/bills/1 | 403 |
      | DELETE /api/v1/bills/1 | 403 |
      | GET /api/v1/reports/profit-loss?from=2026-04-01&to=2026-04-30 | 403 |
      | DELETE /api/v1/salesperson-payments/1 | 403 |
      | GET /api/v1/salesperson-payments | 403 |
      | POST /api/v1/salespeople/1/prices/copy-from/2?brandId=1 | 403 |
      | DELETE /api/v1/dispatches/finalize-day | 403 |
      | GET /api/v1/admin-users | 403 |
      | DELETE /api/v1/admin-users/1 | 403 |
      | GET /api/v1/admin-users/mfa/status | 403 |
      | DELETE /api/v1/dairy-deposit-topups/1 | 403 |
      | GET /api/v1/dispatches | 403 |
      | PATCH /api/v1/dispatches/1/submit | 403 |
      | DELETE /api/v1/dispatches/1 | 403 |
      | GET /api/v1/salesperson-balance/1?date=2026-04-30 | 403 |
      | GET /api/v1/salesperson-balance/1/history | 403 |
      | GET /api/v1/salespeople/1/prices | 403 |
      | GET /api/v1/salesperson-statement/me?from=2026-04-01&to=2026-04-30 | 403 |

  @superadmin
  Scenario Outline: Dispatchers are limited to the dispatch sheet and stock availability (with a body)
    When dispatcher calls "<request>" with:
      """
      <body>
      """
    Then the response status is <status>

    Examples:
      | request | body | status |
      | POST /api/v1/stock-receipts/bulk | {"brandId": 1, "date": "2026-04-30", "items": []} | 403 |
      | POST /api/v1/dairy-payments | {"brandId": 1, "amount": 100, "paymentDate": "2026-04-30"} | 403 |
      | PUT /api/v1/dairy-payments/1 | {"amount": 100, "paymentDate": "2026-04-30"} | 403 |
      | POST /api/v1/salespeople | {"name": "Test"} | 403 |
      | PUT /api/v1/salespeople/1 | {"name": "Updated"} | 403 |
      | POST /api/v1/pin/verify | {"pin": "123456"} | 403 |
      | POST /api/v1/routes | {"brandId": 1, "routeNumber": "R1"} | 403 |
      | PUT /api/v1/routes/1 | {"routeNumber": "R2"} | 403 |
      | POST /api/v1/salespeople/1/products/bulk | {"products": [{"productId": 1, "isEnabled": true}]} | 403 |
      | POST /api/v1/products | {"name": "Test", "brandId": 1, "category": "Milk", "unitType": "ml", "unitSize": 500, "costPrice": 20, "sellingPrice": 25} | 403 |
      | PUT /api/v1/products/1 | {"name": "Updated"} | 403 |
      | PATCH /api/v1/products/salesperson-global | {"products": [{"productId": 1, "isEnabled": true, "defaultPrice": 10}]} | 403 |
      | POST /api/v1/categories | {"name": "Test", "brandId": 1} | 403 |
      | PUT /api/v1/categories/1 | {"name": "Updated"} | 403 |
      | PATCH /api/v1/brands/reorder | [{"id": 1, "displayOrder": 1}] | 403 |
      | POST /api/v1/brands/1/copy-products | {"sourceBrandId": 2} | 403 |
      | PATCH /api/v1/categories/reorder | [{"id": 1, "displayOrder": 1}] | 403 |
      | PATCH /api/v1/products/reorder | [{"id": 1, "displayOrder": 1}] | 403 |
      | PUT /api/v1/salespeople/reorder | [{"id": 1, "displayOrder": 1}] | 403 |
      | POST /api/v1/bills | {"salespersonId": 1, "from": "2026-04-01", "to": "2026-04-30"} | 403 |
      | POST /api/v1/salesperson-payments | {"salespersonId": 1, "paymentDate": "2026-04-30", "amount": 5} | 403 |
      | PUT /api/v1/salesperson-payments/1 | {"paymentDate": "2026-04-30", "amount": 5} | 403 |
      | POST /api/v1/salesperson-payments/bulk-topup | {"paymentDate": "2026-04-30", "entries": [{"salespersonId": 1, "amount": 5}]} | 403 |
      | POST /api/v1/salespeople/1/prices/bulk | {"effectiveFrom": "2999-01-01", "prices": []} | 403 |
      | POST /api/v1/salespeople/bulk-update | {"salespersonIds": [1], "effectiveFrom": "2999-01-01", "productPrices": [{"productId": 1, "sellingPrice": 5}]} | 403 |
      | POST /api/v1/salespeople/products/bulk-update | {"salespersonIds": [1], "products": [{"productId": 1, "isEnabled": true}]} | 403 |
      | POST /api/v1/pin/verify-pl | {"pin": "123456"} | 403 |
      | POST /api/v1/dispatches/open-for-entry | {"salespersonId": 1, "dispatchDate": "2026-04-30"} | 403 |
      | POST /api/v1/admin-users | {"username": "abc", "password": "secret1"} | 403 |
      | PUT /api/v1/admin-users/1 | {"isActive": true} | 403 |
      | PUT /api/v1/admin-users/1/mfa-required | {"required": true} | 403 |
      | POST /api/v1/brands | {"name": "Nope"} | 403 |
      | PUT /api/v1/brands/1 | {"name": "Renamed"} | 403 |
      | POST /api/v1/salespeople/reset-ledger | {"salespersonIds": [1]} | 403 |
      | POST /api/v1/dairy-payments/bulk-topup | {"paymentDate": "2026-04-30", "entries": [{"brandId": 1, "amount": 5}]} | 403 |
      | POST /api/v1/dairy-deposit-topups/bulk | {"topUpDate": "2026-04-30", "entries": [{"brandId": 1, "amount": 5}]} | 403 |
      | PUT /api/v1/pin/update | {"currentPin": "x", "newPin": "123456"} | 403 |
      | PUT /api/v1/pin/update-pl | {"currentPin": "x", "newPin": "123456"} | 403 |
      | PUT /api/v1/pin/settings | {"plPinEnabled": true} | 403 |
      | POST /api/v1/dispatches | {"salespersonId": 1, "dispatchDate": "2026-04-30", "items": []} | 403 |

  Scenario Outline: Admins are refused superadmin-only actions
    When admin calls "<request>"
    Then the response status is <status>

    Examples:
      | request | status |
      | GET /api/v1/admin-users | 403 |
      | DELETE /api/v1/admin-users/1 | 403 |
      | GET /api/v1/admin-users/mfa/status | 403 |
      | DELETE /api/v1/dairy-deposit-topups/1 | 403 |

  Scenario Outline: Admins are refused superadmin-only actions (with a body)
    When admin calls "<request>" with:
      """
      <body>
      """
    Then the response status is <status>

    Examples:
      | request | body | status |
      | POST /api/v1/admin-users | {"username": "abc", "password": "secret1"} | 403 |
      | PUT /api/v1/admin-users/1 | {"isActive": true} | 403 |
      | PUT /api/v1/admin-users/1/mfa-required | {"required": true} | 403 |
      | POST /api/v1/brands | {"name": "Nope"} | 403 |
      | PUT /api/v1/brands/1 | {"name": "Renamed"} | 403 |
      | POST /api/v1/salespeople/reset-ledger | {"salespersonIds": [1]} | 403 |
      | POST /api/v1/dairy-payments/bulk-topup | {"paymentDate": "2026-04-30", "entries": [{"brandId": 1, "amount": 5}]} | 403 |
      | POST /api/v1/dairy-deposit-topups/bulk | {"topUpDate": "2026-04-30", "entries": [{"brandId": 1, "amount": 5}]} | 403 |
      | PUT /api/v1/pin/update | {"currentPin": "x", "newPin": "123456"} | 403 |
      | PUT /api/v1/pin/update-pl | {"currentPin": "x", "newPin": "123456"} | 403 |
      | PUT /api/v1/pin/settings | {"plPinEnabled": true} | 403 |
