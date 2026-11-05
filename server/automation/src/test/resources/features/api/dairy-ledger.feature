@api @ledger @dairy @superadmin
Feature: Dairy ledger
  What is owed to a dairy brand: opening balance + stock received + deposit + top-ups - payments =
  closing balance, carried forward day after day. Every scenario uses its own throwaway brand, so no
  real balance is ever touched (the brand is archived afterwards).

  Background:
    Given a throwaway brand "brand"
    And a throwaway product "milk" in brand "brand"

  Scenario: Receiving stock increases what is owed
    When admin calls "POST /api/v1/stock-receipts/bulk" with:
      """
      { "brandId": ${brand.id}, "date": "${today-2}", "items": [ { "productId": ${milk.id}, "quantity": 10, "unitPrice": 20 } ] }
      """
    Then the call succeeds
    And the JSON field "data.saved" equals "1"
    And the dairy ledger of "brand" shows:
      | date       | opening | stock | paid | closing |
      | ${today-2} | 0       | 200   | 0    | 200     |

  Scenario: A payment reduces what is owed
    Given admin receives 10 of "milk" at 20 into "brand" on "${today-2}"
    When admin calls "POST /api/v1/dairy-payments" with:
      """
      { "brandId": ${brand.id}, "paymentDate": "${today-2}", "amount": 50, "paymentMode": "UPI", "reference": "E2E ref" }
      """
    Then the response status is 201
    And the JSON field "data.isTopUp" equals "false"
    And the dairy ledger of "brand" shows:
      | date       | opening | stock | paid | closing |
      | ${today-2} | 0       | 200   | 50   | 150     |

  Scenario: Each day opens with the previous day's closing balance
    Given admin receives 10 of "milk" at 20 into "brand" on "${today-3}"
    And admin pays 50 to "brand" on "${today-2}"
    Then the dairy ledger of "brand" shows:
      | date       | opening | stock | paid | closing |
      | ${today-3} | 0       | 200   | 0    | 200     |
      | ${today-2} | 200     | 0     | 50   | 150     |
      | ${today-1} | 150     | 0     | 0    | 150     |

  Scenario: A back-dated change ripples through every later day
    Given admin receives 10 of "milk" at 20 into "brand" on "${today-3}"
    And admin pays 50 to "brand" on "${today-2}"
    And admin receives 5 of "milk" at 20 into "brand" on "${today-1}"
    When admin receives 15 of "milk" at 20 into "brand" on "${today-3}"
    Then the dairy ledger of "brand" shows:
      | date       | opening | stock | paid | closing |
      | ${today-3} | 0       | 300   | 0    | 300     |
      | ${today-2} | 300     | 0     | 50   | 250     |
      | ${today-1} | 250     | 100   | 0    | 350     |

  Scenario: Saving a day's stock again replaces it, and zero removes it
    Given admin receives 10 of "milk" at 20 into "brand" on "${today-2}"
    When admin receives 4 of "milk" at 20 into "brand" on "${today-2}"
    Then the dairy ledger of "brand" shows:
      | date       | stock | closing |
      | ${today-2} | 80    | 80      |
    When admin receives 0 of "milk" at 20 into "brand" on "${today-2}"
    Then the dairy ledger of "brand" shows:
      | date       | stock | closing |
      | ${today-2} | 0     | 0       |

  Scenario: Stock received on several routes on the same day adds up
    Given a throwaway route "north" in brand "brand"
    And a throwaway route "south" in brand "brand"
    When admin calls "POST /api/v1/stock-receipts/bulk" with:
      """
      { "brandId": ${brand.id}, "date": "${today-2}", "routeId": ${north.id},
        "items": [ { "productId": ${milk.id}, "quantity": 10, "unitPrice": 20 } ] }
      """
    And admin calls "POST /api/v1/stock-receipts/bulk" with:
      """
      { "brandId": ${brand.id}, "date": "${today-2}", "routeId": ${south.id},
        "items": [ { "productId": ${milk.id}, "quantity": 5, "unitPrice": 20 } ] }
      """
    Then the dairy ledger of "brand" shows:
      | date       | stock | closing |
      | ${today-2} | 300   | 300     |
    When admin calls "GET /api/v1/stock-receipts/availability?date=${today-2}"
    Then the JSON amount "data.find { it.productId == ${milk.id} }.received" equals "15"
    When admin calls "GET /api/v1/dairy-balance/route-breakdown?brandId=${brand.id}&from=${today-3}&to=${today}"
    Then the call succeeds
    And the JSON amount "data.find { it.routeId == ${north.id} }.totalAmount" equals "200"
    And the JSON amount "data.find { it.routeId == ${south.id} }.totalAmount" equals "100"

  Scenario: A superadmin can load an amount already owed, and it adds to the balance
    Given admin receives 10 of "milk" at 20 into "brand" on "${today-2}"
    When superadmin calls "POST /api/v1/dairy-payments/bulk-topup" with:
      """
      { "paymentDate": "${today-2}", "notes": "opening dues", "entries": [ { "brandId": ${brand.id}, "amount": 1000 } ] }
      """
    Then the response status is 201
    And the JSON field "data.count" equals "1"
    And the dairy ledger of "brand" shows:
      | date       | stock | topUp | paid | closing |
      | ${today-2} | 200   | 1000  | 0    | 1200    |

  Scenario Outline: Invalid dairy top-ups are refused
    When superadmin calls "POST /api/v1/dairy-payments/bulk-topup" with:
      """
      <body>
      """
    Then the response status is <status>

    Examples:
      | body                                                                                           | status |
      | { "paymentDate": "2026-04-30", "entries": [] }                                                 | 400    |
      | { "paymentDate": "2026-04-30", "entries": [ { "brandId": 1, "amount": 0 } ] }                  | 400    |
      | { "paymentDate": "2026-04-30", "entries": [ { "brandId": 1, "amount": 5 }, { "brandId": 1, "amount": 5 } ] } | 400 |
      | { "paymentDate": "2026-04-30", "entries": [ { "brandId": 2147483647, "amount": 5 } ] }         | 404    |

  Scenario: Editing a payment re-balances both the old and the new day
    Given admin receives 10 of "milk" at 20 into "brand" on "${today-3}"
    And admin pays 50 to "brand" on "${today-2}" remembered as "payment"
    When admin calls "PUT /api/v1/dairy-payments/${payment.id}" with:
      """
      { "amount": 80, "paymentDate": "${today-1}", "paymentMode": "Cash" }
      """
    Then the response status is 200
    And the dairy ledger of "brand" shows:
      | date       | opening | paid | closing |
      | ${today-3} | 0       | 0    | 200     |
      | ${today-2} | 200     | 0    | 200     |
      | ${today-1} | 200     | 80   | 120     |

  Scenario: Deleting a payment gives the money back to the balance
    Given admin receives 10 of "milk" at 20 into "brand" on "${today-2}"
    And admin pays 50 to "brand" on "${today-2}" remembered as "payment"
    When admin calls "DELETE /api/v1/dairy-payments/${payment.id}"
    Then the response status is 200
    And the dairy ledger of "brand" shows:
      | date       | paid | closing |
      | ${today-2} | 0    | 200     |
    When admin calls "DELETE /api/v1/dairy-payments/${payment.id}"
    Then the response status is 404

  Scenario Outline: Invalid payments are refused
    When admin calls "POST /api/v1/dairy-payments" with:
      """
      <body>
      """
    Then the response status is 400
    And the error code is "VALIDATION_ERROR"

    Examples:
      | body                                                                                  |
      | { "brandId": 1, "paymentDate": "2026-04-30", "amount": 0 }                            |
      | { "brandId": 1, "paymentDate": "2026-04-30", "amount": -5 }                           |
      | { "paymentDate": "2026-04-30", "amount": 5 }                                          |
      | { "brandId": 1, "amount": 5 }                                                         |
      | { "brandId": 1, "paymentDate": "30-04-2026", "amount": 5 }                            |
      | { "brandId": 1, "paymentDate": "2026-04-30", "amount": 5, "paymentMode": "Barter" }   |
      | { "brandId": 1, "paymentDate": "2026-04-30", "amount": 5, "notes": "${repeat:501}" }  |

  Scenario: Notes of exactly 500 characters are accepted
    When admin calls "POST /api/v1/dairy-payments" with:
      """
      { "brandId": ${brand.id}, "paymentDate": "${today-2}", "amount": 5, "notes": "${repeat:500}" }
      """
    Then the response status is 201

  Scenario Outline: Invalid payment edits are refused
    When admin calls "PUT /api/v1/dairy-payments/<id>" with:
      """
      <body>
      """
    Then the response status is <status>

    Examples:
      | id         | body                                             | status |
      | abc        | { "amount": 5, "paymentDate": "2026-04-30" }     | 400    |
      | 2147483647 | { "amount": 5, "paymentDate": "2026-04-30" }     | 404    |
      | 2147483647 | { "amount": -5, "paymentDate": "2026-04-30" }    | 400    |

  Scenario Outline: Invalid stock receipts are refused
    When admin calls "POST /api/v1/stock-receipts/bulk" with:
      """
      <body>
      """
    Then the response status is 400

    Examples:
      | body                                                                                                   |
      | { "date": "2026-04-30", "items": [] }                                                                  |
      | { "brandId": 1, "date": "${today+2}", "items": [] }                                                    |
      | { "brandId": 1, "date": "2026-04-30", "items": [ { "productId": 1, "quantity": -1, "unitPrice": 5 } ] }|
      | { "brandId": 1, "date": "2026-04-30", "items": [ { "productId": 1, "quantity": 1, "unitPrice": -5 } ] }|
      | { "brandId": 1, "date": "2026-04-30", "routeId": -1, "items": [] }                                     |

  Scenario: Stock can be entered for tomorrow
    When admin calls "POST /api/v1/stock-receipts/bulk" with:
      """
      { "brandId": ${brand.id}, "date": "${today+1}", "items": [ { "productId": ${milk.id}, "quantity": 2, "unitPrice": 20 } ] }
      """
    Then the response status is 200

  Scenario: Saved stock is listed for its day with product details
    Given admin receives 10 of "milk" at 20 into "brand" on "${today-2}"
    When admin calls "GET /api/v1/stock-receipts?date=${today-2}&brandId=${brand.id}"
    Then the call succeeds
    And the JSON list "data" has 1 item
    And the JSON field "data[0].product.name" equals "${milk.name}"
    And the JSON amount "data[0].quantity" equals "10"

  Scenario: Available stock is what was received minus what was dispatched
    Given admin receives 10 of "milk" at 20 into "brand" on "${today-2}"
    When admin calls "GET /api/v1/stock-receipts/availability?date=${today-2}"
    Then the call succeeds
    And the JSON amount "data.find { it.productId == ${milk.id} }.received" equals "10"
    And the JSON amount "data.find { it.productId == ${milk.id} }.dispatched" equals "0"
    And the JSON amount "data.find { it.productId == ${milk.id} }.available" equals "10"

  Scenario Outline: Stock queries need a date
    When admin calls "GET <path>"
    Then the response status is 400

    Examples:
      | path                                 |
      | /api/v1/stock-receipts               |
      | /api/v1/stock-receipts/availability  |
      | /api/v1/dairy-balance                |
      | /api/v1/dairy-balance/1              |

  Scenario Outline: Balance lookups validate the brand
    When admin calls "GET /api/v1/dairy-balance/<id>?date=${today}"
    Then the response status is <status>

    Examples:
      | id         | status |
      | abc        | 400    |
      | 2147483647 | 404    |

  Scenario: Every brand's balance is listed for a date
    Given admin receives 10 of "milk" at 20 into "brand" on "${today-2}"
    When admin calls "GET /api/v1/dairy-balance?date=${today-2}"
    Then the call succeeds
    And the JSON amount "data.brands.find { it.brandId == ${brand.id} }.closingBalance" equals "200"

  Scenario: Payments can be filtered by brand and date, and paged
    Given admin pays 10 to "brand" on "${today-3}"
    And admin pays 20 to "brand" on "${today-2}"
    When admin calls "GET /api/v1/dairy-payments?brandId=${brand.id}"
    Then the JSON list "data" has 2 items
    When admin calls "GET /api/v1/dairy-payments?brandId=${brand.id}&from=${today-2}&to=${today-2}"
    Then the JSON list "data" has 1 item
    And the JSON amount "data[0].amount" equals "20"
    When admin calls "GET /api/v1/dairy-payments?brandId=${brand.id}&page=1&limit=1"
    Then the JSON list "data.items" has 1 item
    And the JSON field "data.pagination.total" equals "2"

  Scenario: A brand pays a crate deposit on qualifying products
    Given admin sets deposit of 2 per litre on "brand"
    And a throwaway category "crates" in brand "brand"
    And admin marks category "crates" as deposit-bearing
    And a throwaway product "crateMilk" in brand "brand" with:
      """
      { "category": "${crates.name}", "unitType": "ml", "unitSize": 500, "containerType": "crate",
        "unitsPerContainer": 12 }
      """
    And admin enables deposit on product "crateMilk"
    When admin receives 24 of "crateMilk" at 20 into "brand" on "${today-2}"
    Then the dairy ledger of "brand" shows:
      | date       | stock | deposit | closing |
      | ${today-2} | 480   | 24      | 504     |

  Scenario: Products that do not qualify carry no deposit
    Given admin sets deposit of 2 per litre on "brand"
    And admin receives 24 of "milk" at 20 into "brand" on "${today-2}"
    Then the dairy ledger of "brand" shows:
      | date       | stock | deposit |
      | ${today-2} | 480   | 0       |

  Scenario: Deposits already held can be loaded and removed, only for deposit brands
    When superadmin calls "POST /api/v1/dairy-deposit-topups/bulk" with:
      """
      { "topUpDate": "${today-2}", "entries": [ { "brandId": ${brand.id}, "amount": 300 } ] }
      """
    Then the response status is 400
    And the error message contains "Deposit is not enabled"
    Given admin sets deposit of 2 per litre on "brand"
    When superadmin calls "POST /api/v1/dairy-deposit-topups/bulk" with:
      """
      { "topUpDate": "${today-2}", "notes": "held before the app", "entries": [ { "brandId": ${brand.id}, "amount": 300 } ] }
      """
    Then the response status is 201
    And I remember the item of "data.topUps" whose "brandId" is "${brand.id}" as "topUp"
    And the dairy ledger of "brand" shows:
      | date       | closing |
      | ${today-2} | 0       |
    When superadmin calls "DELETE /api/v1/dairy-deposit-topups/${topUp.id}"
    Then the response status is 200
    When superadmin calls "DELETE /api/v1/dairy-deposit-topups/${topUp.id}"
    Then the response status is 404

  Scenario Outline: Invalid deposit top-ups are refused
    When superadmin calls "POST /api/v1/dairy-deposit-topups/bulk" with:
      """
      <body>
      """
    Then the response status is <status>

    Examples:
      | body                                                                                  | status |
      | { "topUpDate": "2026-04-30", "entries": [] }                                          | 400    |
      | { "entries": [ { "brandId": 1, "amount": 5 } ] }                                      | 400    |
      | { "topUpDate": "2026-04-30", "entries": [ { "brandId": 2147483647, "amount": 5 } ] }  | 404    |

  Scenario: Paying a brand more than is owed leaves it in credit
    When admin pays 500 to "brand" on "${today-2}"
    Then the dairy ledger of "brand" shows:
      | date       | paid | closing |
      | ${today-2} | 500  | -500    |

  Scenario: A payment can be raised past what is owed, or lowered, and the balance follows
    Given admin receives 10 of "milk" at 20 into "brand" on "${today-2}"
    And admin pays 50 to "brand" on "${today-2}" remembered as "payment"
    When admin calls "PUT /api/v1/dairy-payments/${payment.id}" with:
      """
      { "amount": 300, "paymentDate": "${today-2}" }
      """
    Then the response status is 200
    And the dairy ledger of "brand" shows:
      | date       | paid | closing |
      | ${today-2} | 300  | -100    |
    When admin calls "PUT /api/v1/dairy-payments/${payment.id}" with:
      """
      { "amount": 10, "paymentDate": "${today-2}" }
      """
    Then the dairy ledger of "brand" shows:
      | date       | paid | closing |
      | ${today-2} | 10   | 190     |

  Scenario: A payment without a reference or notes stores none
    When admin calls "POST /api/v1/dairy-payments" with:
      """
      { "brandId": ${brand.id}, "paymentDate": "${today-2}", "amount": 5 }
      """
    Then the response status is 201
    And the JSON field "data.reference" equals "null"
    And the JSON field "data.notes" equals "null"

  Scenario Outline: Dates must be written as year-month-day
    When admin calls "POST /api/v1/dairy-payments" with:
      """
      { "brandId": ${brand.id}, "paymentDate": "<date>", "amount": 100 }
      """
    Then the response status is 400

    Examples:
      | date                |
      | 30-04-2026          |
      | 2026/04/30          |
      | 2026-4-30           |
      | 2026-04-30T00:00:00 |
      | 04-30-2026          |
      | tomorrow            |

  Scenario: Loaded dues are recorded as top-ups by the acting superadmin
    When superadmin calls "POST /api/v1/dairy-payments/bulk-topup" with:
      """
      { "paymentDate": "${today-2}", "notes": "opening dues", "entries": [ { "brandId": ${brand.id}, "amount": 1000 } ] }
      """
    Then the response status is 201
    And the JSON field "data.payments[0].isTopUp" equals "true"
    And the JSON field "data.payments[0].paymentMode" equals "Top-up"
    And the JSON field "data.payments[0].createdBy" is present
    And the JSON amount "data.total" equals "1000"

  Scenario: One top-up call re-balances every brand it touches
    Given a throwaway brand "second"
    When superadmin calls "POST /api/v1/dairy-payments/bulk-topup" with:
      """
      { "paymentDate": "${today-2}", "entries": [ { "brandId": ${brand.id}, "amount": 400 }, { "brandId": ${second.id}, "amount": 700 } ] }
      """
    Then the response status is 201
    And the dairy ledger of "brand" shows:
      | date       | topUp | closing |
      | ${today-2} | 400   | 400     |
    And the dairy ledger of "second" shows:
      | date       | topUp | closing |
      | ${today-2} | 700   | 700     |

  Scenario: Stock, a payment and a top-up on the same day are kept apart in the balance
    Given admin receives 10 of "milk" at 20 into "brand" on "${today-2}"
    And admin pays 50 to "brand" on "${today-2}"
    When superadmin calls "POST /api/v1/dairy-payments/bulk-topup" with:
      """
      { "paymentDate": "${today-2}", "entries": [ { "brandId": ${brand.id}, "amount": 1000 } ] }
      """
    Then the dairy ledger of "brand" shows:
      | date       | opening | stock | topUp | paid | closing |
      | ${today-2} | 0       | 200   | 1000  | 50   | 1150    |

  Scenario: A back-dated top-up ripples through every later day
    Given admin receives 10 of "milk" at 20 into "brand" on "${today-3}"
    And admin receives 5 of "milk" at 20 into "brand" on "${today-1}"
    When superadmin calls "POST /api/v1/dairy-payments/bulk-topup" with:
      """
      { "paymentDate": "${today-3}", "entries": [ { "brandId": ${brand.id}, "amount": 500 } ] }
      """
    Then the dairy ledger of "brand" shows:
      | date       | opening | closing |
      | ${today-3} | 0       | 700     |
      | ${today-1} | 700     | 800     |

  Scenario: A category that is not deposit-bearing adds no deposit
    Given admin sets deposit of 2 per litre on "brand"
    And a throwaway category "plain" in brand "brand"
    And a throwaway product "crateMilk" in brand "brand" with:
      """
      { "category": "${plain.name}", "unitType": "ml", "unitSize": 500, "containerType": "crate", "unitsPerContainer": 12 }
      """
    And admin enables deposit on product "crateMilk"
    When admin receives 24 of "crateMilk" at 20 into "brand" on "${today-2}"
    Then the dairy ledger of "brand" shows:
      | date       | stock | deposit |
      | ${today-2} | 480   | 0       |

  Scenario Outline: The route breakdown needs a brand and a valid period
    When admin calls "GET /api/v1/dairy-balance/route-breakdown<query>"
    Then the response status is 400

    Examples:
      | query                                           |
      |                                                 |
      | ?from=2026-04-01&to=2026-04-30                  |
      | ?brandId=1&to=2026-04-30                        |
      | ?brandId=1&from=2026-04-01                      |
      | ?brandId=1&from=2026-04-30&to=2026-04-01        |

  Scenario: Stock received without a route is labelled General in the route breakdown
    Given admin receives 10 of "milk" at 20 into "brand" on "${today-2}"
    When admin calls "GET /api/v1/dairy-balance/route-breakdown?brandId=${brand.id}&from=${today-3}&to=${today-1}"
    Then the call succeeds
    And the JSON field "data[0].routeNumber" equals "General"
    And the JSON amount "data[0].totalAmount" equals "200"
    When admin calls "GET /api/v1/dairy-balance/route-breakdown?brandId=${brand.id}&from=${today-1}&to=${today}"
    Then the JSON list "data" has 0 items

  Scenario: Stock for a product that does not exist is refused
    When admin calls "POST /api/v1/stock-receipts/bulk" with:
      """
      { "brandId": ${brand.id}, "date": "${today-2}", "items": [ { "productId": 2147483647, "quantity": 1, "unitPrice": 5 } ] }
      """
    Then the response status is 400
    And the error code is "FK_CONSTRAINT"

  Scenario: Leaving out the item list clears the day, like an empty list
    Given admin receives 10 of "milk" at 20 into "brand" on "${today-2}"
    When admin calls "POST /api/v1/stock-receipts/bulk" with:
      """
      { "brandId": ${brand.id}, "date": "${today-2}" }
      """
    Then the response status is 200
    And the dairy ledger of "brand" shows:
      | date       | stock | closing |
      | ${today-2} | 0     | 0       |

  Scenario: A deposit top-up records who loaded it and never touches the dues ledger
    Given admin sets deposit of 2 per litre on "brand"
    When superadmin calls "POST /api/v1/dairy-deposit-topups/bulk" with:
      """
      { "topUpDate": "${today-2}", "entries": [ { "brandId": ${brand.id}, "amount": 300 } ] }
      """
    Then the response status is 201
    And the JSON field "data.topUps[0].createdBy" is present
    And the JSON field "data.topUps[0].isTopUp" is absent
    And the dairy ledger of "brand" shows:
      | date       | topUp | closing |
      | ${today-2} | 0     | 0       |
