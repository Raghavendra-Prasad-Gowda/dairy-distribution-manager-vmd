@api @dispatch @superadmin
Feature: Stock entries (dispatches)
  A dispatch is the stock handed to a salesperson on a day. Admins can enter any day; a salesman can
  enter today or tomorrow and the server - not the client - decides the price. Entries lock when
  submitted and past days are locked unless an admin reopens them.

  Background:
    Given a throwaway brand "brand"
    And a throwaway product "milk" in brand "brand"
    And the run's salesman as "me"

  Scenario: A salesman's stock entry is priced by the server, not by the client
    Given admin enables "milk" for everyone at price 22
    When salesman calls "POST /api/v1/dispatches" with:
      """
      { "dispatchDate": "${today}", "items": [ { "productId": ${milk.id}, "quantity": 3, "unitPrice": 1 } ] }
      """
    Then the response status is 201
    And I remember the response data as "dispatch"
    And afterwards admin cleans up with "DELETE /api/v1/dispatches/${dispatch.id}"
    And the JSON amount "data.items[0].unitPrice" equals "22"
    And the JSON amount "data.totalAmount" equals "66"
    And the JSON field "data.isLocked" equals "false"

  Scenario: A custom price for the salesman wins over the global price
    Given admin enables "milk" for everyone at price 22
    And admin sets the price of "milk" for "me" to 30
    When salesman calls "POST /api/v1/dispatches" with:
      """
      { "dispatchDate": "${today}", "items": [ { "productId": ${milk.id}, "quantity": 2, "unitPrice": 1 } ] }
      """
    Then the response status is 201
    And I remember the response data as "dispatch"
    And afterwards admin cleans up with "DELETE /api/v1/dispatches/${dispatch.id}"
    And the JSON amount "data.totalAmount" equals "60"

  Scenario: A salesman cannot take a product that is not enabled for them
    When salesman calls "POST /api/v1/dispatches" with:
      """
      { "dispatchDate": "${today}", "items": [ { "productId": ${milk.id}, "quantity": 1, "unitPrice": 1 } ] }
      """
    Then the response status is 403
    And the error message contains "not enabled"

  Scenario: A salesman's entry always belongs to the salesman, whatever the payload says
    Given admin enables "milk" for everyone at price 22
    And a salesperson with a clean ledger "other"
    When salesman calls "POST /api/v1/dispatches" with:
      """
      { "salespersonId": ${other.id}, "dispatchDate": "${today}", "items": [ { "productId": ${milk.id}, "quantity": 1, "unitPrice": 1 } ] }
      """
    Then the response status is 201
    And I remember the response data as "dispatch"
    And afterwards admin cleans up with "DELETE /api/v1/dispatches/${dispatch.id}"
    And the JSON field "data.salespersonId" equals "${me.id}"

  Scenario: Submitting locks an entry until an admin unlocks it
    Given admin enables "milk" for everyone at price 22
    When salesman calls "POST /api/v1/dispatches" with:
      """
      { "dispatchDate": "${today}", "items": [ { "productId": ${milk.id}, "quantity": 3, "unitPrice": 1 } ] }
      """
    Then I remember the response data as "dispatch"
    And afterwards admin cleans up with "DELETE /api/v1/dispatches/${dispatch.id}"
    When salesman calls "PATCH /api/v1/dispatches/${dispatch.id}/submit"
    Then the response status is 200
    When salesman calls "POST /api/v1/dispatches" with:
      """
      { "dispatchDate": "${today}", "items": [ { "productId": ${milk.id}, "quantity": 9, "unitPrice": 1 } ] }
      """
    Then the response status is 403
    And the error message contains "locked"
    When salesman calls "GET /api/v1/dispatches?date=${today}"
    Then the JSON field "data.find { it.id == ${dispatch.id} }.isLocked" equals "true"
    When admin calls "PATCH /api/v1/dispatches/${dispatch.id}/unlock"
    Then the response status is 200
    When salesman calls "POST /api/v1/dispatches" with:
      """
      { "dispatchDate": "${today}", "items": [ { "productId": ${milk.id}, "quantity": 4, "unitPrice": 1 } ] }
      """
    Then the response status is 200
    And the JSON amount "data.totalAmount" equals "88"
    When admin calls "PATCH /api/v1/dispatches/${dispatch.id}/lock"
    Then the response status is 200
    When salesman calls "GET /api/v1/dispatches?date=${today}"
    Then the JSON field "data.find { it.id == ${dispatch.id} }.isLocked" equals "true"

  Scenario: A salesman cannot enter a past day until an admin opens it
    Given admin enables "milk" for everyone at price 22
    When salesman calls "POST /api/v1/dispatches" with:
      """
      { "dispatchDate": "${today-1}", "items": [ { "productId": ${milk.id}, "quantity": 1, "unitPrice": 1 } ] }
      """
    Then the response status is 403
    And the error message contains "locked"
    When admin calls "POST /api/v1/dispatches/open-for-entry" with:
      """
      { "salespersonId": ${me.id}, "dispatchDate": "${today-1}" }
      """
    Then the response status is 200
    And I remember the JSON field "data.dispatchId" as "opened"
    And afterwards admin cleans up with "DELETE /api/v1/dispatches/${opened}"
    When salesman calls "POST /api/v1/dispatches" with:
      """
      { "dispatchDate": "${today-1}", "items": [ { "productId": ${milk.id}, "quantity": 2, "unitPrice": 1 } ] }
      """
    Then the response status is 200
    And the JSON amount "data.totalAmount" equals "44"

  Scenario: Admins can enter stock for any salesperson on any day, with their own prices
    Given a salesperson with a clean ledger "sp"
    When admin calls "POST /api/v1/dispatches" with:
      """
      { "salespersonId": ${sp.id}, "dispatchDate": "${today-4}", "notes": "E2E",
        "items": [ { "productId": ${milk.id}, "quantity": 2, "unitPrice": 17 } ] }
      """
    Then the response status is 201
    And the JSON amount "data.totalAmount" equals "34"

  Scenario Outline: Invalid stock entries are refused
    When admin calls "POST /api/v1/dispatches" with:
      """
      <body>
      """
    Then the response status is 400

    Examples:
      | body                                                                                                            |
      | { "dispatchDate": "${today}", "items": [] }                                                                     |
      | { "salespersonId": 1, "dispatchDate": "${today+2}", "items": [] }                                               |
      | { "salespersonId": 1, "dispatchDate": "bad", "items": [] }                                                      |
      | { "salespersonId": 1, "dispatchDate": "2026-04-30", "items": [ { "productId": 1, "quantity": -1, "unitPrice": 5 } ] } |
      | { "salespersonId": 1, "dispatchDate": "2026-04-30", "items": [ { "productId": 1, "quantity": 0, "unitPrice": 5 } ] }  |
      | { "salespersonId": 1, "dispatchDate": "2026-04-30", "items": [ { "productId": 1, "quantity": 1, "unitPrice": -5 } ] } |

  Scenario Outline: Stock entry ids are validated
    When admin calls "<method> /api/v1/dispatches/<id><suffix>"
    Then the response status is <status>

    Examples:
      | method | id         | suffix  | status |
      | DELETE | abc        |         | 400    |
      | DELETE | 2147483647 |         | 404    |
      | PATCH  | 2147483647 | /submit | 404    |
      | PATCH  | 2147483647 | /lock   | 404    |
      | PATCH  | 2147483647 | /unlock | 404    |

  Scenario: Entries are listed per salesperson and day, and a salesman sees only their own
    Given a salesperson with a clean ledger "other"
    And admin dispatches 2 of "milk" at 22 to "other" on "${today-2}"
    When admin calls "GET /api/v1/dispatches?salespersonId=${other.id}&date=${today-2}"
    Then the call succeeds
    And the JSON list "data" has 1 item
    And the JSON field "data[0].salesperson.name" equals "${other.name}"
    When salesman calls "GET /api/v1/dispatches?salespersonId=${other.id}"
    Then the call succeeds
    And the JSON list "data" has no item whose "salespersonId" is "${other.id}"

  Scenario: Entries can be paged
    Given a salesperson with a clean ledger "other"
    And admin dispatches 1 of "milk" at 22 to "other" on "${today-3}"
    And admin dispatches 1 of "milk" at 22 to "other" on "${today-2}"
    When admin calls "GET /api/v1/dispatches?salespersonId=${other.id}&page=1&limit=1"
    Then the JSON list "data.items" has 1 item
    And the JSON field "data.pagination.total" equals "2"

  Scenario: A day's summary lists who got what
    Given a salesperson with a clean ledger "other"
    And admin dispatches 2 of "milk" at 22 to "other" on "${today-2}"
    When admin calls "GET /api/v1/dispatches/summary?date=${today-2}"
    Then the call succeeds
    And the JSON field "data.find { it.salespersonId == ${other.id} }.salesperson.name" equals "${other.name}"
    When admin calls "GET /api/v1/dispatches/summary"
    Then the response status is 400
    When salesman calls "GET /api/v1/dispatches/summary?date=${today-2}"
    Then the response status is 403

  Scenario: A salesman cannot delete another salesperson's entry
    Given a salesperson with a clean ledger "other"
    And admin dispatches 2 of "milk" at 22 to "other" on "${today-2}" remembered as "dispatch"
    When salesman calls "DELETE /api/v1/dispatches/${dispatch.id}"
    Then the response status is 403

  @superadmin
  Scenario: A dispatcher cannot lock or unlock a past entry
    Given a salesperson with a clean ledger "other"
    And admin dispatches 2 of "milk" at 22 to "other" on "${today-2}" remembered as "dispatch"
    When dispatcher calls "PATCH /api/v1/dispatches/${dispatch.id}/lock"
    Then the response status is 403
    And the error message contains "today"
    When dispatcher calls "PATCH /api/v1/dispatches/${dispatch.id}/unlock"
    Then the response status is 403

  Scenario: Locking or unlocking an entry that is already in that state changes nothing
    Given a salesperson with a clean ledger "other"
    And admin dispatches 2 of "milk" at 22 to "other" on "${today-2}" remembered as "dispatch"
    When admin calls "PATCH /api/v1/dispatches/${dispatch.id}/unlock"
    Then the response status is 200
    When admin calls "PATCH /api/v1/dispatches/${dispatch.id}/unlock"
    Then the response status is 200
    When admin calls "PATCH /api/v1/dispatches/${dispatch.id}/lock"
    Then the response status is 200
    When admin calls "PATCH /api/v1/dispatches/${dispatch.id}/lock"
    Then the response status is 200

  Scenario: A free sample can be given at a price of zero
    Given a salesperson with a clean ledger "other"
    When admin dispatches 3 of "milk" at 0 to "other" on "${today-2}"
    Then the JSON amount "data.totalAmount" equals "0"
    And the ledger of salesperson "other" shows:
      | date       | given | closing |
      | ${today-2} | 0     | 0       |

  # ── price integrity: the server re-derives a salesman's price on every save ──

  Scenario: A salesman's price is re-derived when the entry is updated, not only when it is created
    Given admin enables "milk" for everyone at price 22
    When salesman calls "POST /api/v1/dispatches" with:
      """
      { "dispatchDate": "${today}", "items": [ { "productId": ${milk.id}, "quantity": 1, "unitPrice": 1 } ] }
      """
    Then I remember the response data as "dispatch"
    And afterwards admin cleans up with "DELETE /api/v1/dispatches/${dispatch.id}"
    When admin sets the price of "milk" for "me" to 30
    And salesman calls "POST /api/v1/dispatches" with:
      """
      { "dispatchDate": "${today}", "items": [ { "productId": ${milk.id}, "quantity": 2, "unitPrice": 1 } ] }
      """
    Then the response status is 200
    And the JSON amount "data.totalAmount" equals "60"

  Scenario: A product switched off globally can still be taken when the salesman has an exception for it
    Given admin sets the price of "milk" for "me" to 30
    And admin calls "POST /api/v1/salespeople/${me.id}/products/bulk" with:
      """
      { "products": [ { "productId": ${milk.id}, "isEnabled": true } ] }
      """
    When salesman calls "POST /api/v1/dispatches" with:
      """
      { "dispatchDate": "${today}", "items": [ { "productId": ${milk.id}, "quantity": 2, "unitPrice": 1 } ] }
      """
    Then the response status is 201
    And I remember the response data as "dispatch"
    And afterwards admin cleans up with "DELETE /api/v1/dispatches/${dispatch.id}"
    And the JSON amount "data.totalAmount" equals "60"

  Scenario: A product switched on globally is refused when the salesman has an exception switching it off
    Given admin enables "milk" for everyone at price 22
    And admin calls "POST /api/v1/salespeople/${me.id}/products/bulk" with:
      """
      { "products": [ { "productId": ${milk.id}, "isEnabled": false } ] }
      """
    When salesman calls "POST /api/v1/dispatches" with:
      """
      { "dispatchDate": "${today}", "items": [ { "productId": ${milk.id}, "quantity": 1, "unitPrice": 1 } ] }
      """
    Then the response status is 403
    And the error message contains "not enabled"

  Scenario: A salesman cannot take a product that is inactive or does not exist
    Given admin enables "milk" for everyone at price 22
    When salesman calls "POST /api/v1/dispatches" with:
      """
      { "dispatchDate": "${today}", "items": [ { "productId": 2147483647, "quantity": 1, "unitPrice": 1 } ] }
      """
    Then the response status is 400
    And the error message contains "not available"
    When admin calls "DELETE /api/v1/products/${milk.id}"
    And salesman calls "POST /api/v1/dispatches" with:
      """
      { "dispatchDate": "${today}", "items": [ { "productId": ${milk.id}, "quantity": 1, "unitPrice": 1 } ] }
      """
    Then the response status is 400
    And the error message contains "not available"

  # ── lock rules ──

  Scenario: A draft left over from a past day is locked for the salesman, including clearing it
    Given admin enables "milk" for everyone at price 22
    And admin dispatches 2 of "milk" at 22 to "me" on "${today-1}" remembered as "dispatch"
    And afterwards admin cleans up with "DELETE /api/v1/dispatches/${dispatch.id}"
    When salesman calls "POST /api/v1/dispatches" with:
      """
      { "dispatchDate": "${today-1}", "items": [ { "productId": ${milk.id}, "quantity": 5, "unitPrice": 1 } ] }
      """
    Then the response status is 403
    And the error message contains "locked"
    When salesman calls "POST /api/v1/dispatches" with:
      """
      { "dispatchDate": "${today-1}", "items": [] }
      """
    Then the response status is 403

  Scenario: Admins can enter any past day without it being opened first
    Given a salesperson with a clean ledger "other"
    When admin calls "POST /api/v1/dispatches" with:
      """
      { "salespersonId": ${other.id}, "dispatchDate": "${today-5}", "items": [ { "productId": ${milk.id}, "quantity": 1, "unitPrice": 10 } ] }
      """
    Then the response status is 201

  Scenario: A salesman can enter tomorrow's stock
    Given admin enables "milk" for everyone at price 22
    When salesman calls "POST /api/v1/dispatches" with:
      """
      { "dispatchDate": "${today+1}", "items": [ { "productId": ${milk.id}, "quantity": 1, "unitPrice": 1 } ] }
      """
    Then the response status is 201
    And I remember the response data as "dispatch"
    And afterwards admin cleans up with "DELETE /api/v1/dispatches/${dispatch.id}"

  Scenario: Clearing an entry an admin has unlocked empties it but leaves it unlocked
    Given a salesperson with a clean ledger "other"
    And admin dispatches 2 of "milk" at 22 to "other" on "${today-2}" remembered as "dispatch"
    And admin calls "PATCH /api/v1/dispatches/${dispatch.id}/unlock"
    When admin calls "POST /api/v1/dispatches" with:
      """
      { "salespersonId": ${other.id}, "dispatchDate": "${today-2}", "items": [] }
      """
    Then the response status is 200
    And the JSON field "data.message" equals "Stock entry cleared"
    When admin calls "GET /api/v1/dispatches?salespersonId=${other.id}&date=${today-2}"
    Then the JSON list "data" has 1 item
    And the JSON amount "data[0].totalAmount" equals "0"
    And the JSON field "data[0].isAdminUnlocked" equals "true"

  Scenario: Saving as part of a submit behaves like a normal save
    Given a salesperson with a clean ledger "other"
    When admin calls "POST /api/v1/dispatches" with:
      """
      { "salespersonId": ${other.id}, "dispatchDate": "${today-2}", "submitting": true,
        "items": [ { "productId": ${milk.id}, "quantity": 2, "unitPrice": 10 } ] }
      """
    Then the response status is 201
    And the ledger of salesperson "other" shows:
      | date       | given | closing |
      | ${today-2} | 20    | 20      |
    When admin calls "POST /api/v1/dispatches" with:
      """
      { "salespersonId": ${other.id}, "dispatchDate": "${today-2}", "submitting": true, "items": [] }
      """
    Then the JSON field "data.message" equals "Stock entry cleared"

  Scenario: A salesman may delete their own draft but not a submitted or past one
    Given admin enables "milk" for everyone at price 22
    When salesman calls "POST /api/v1/dispatches" with:
      """
      { "dispatchDate": "${today}", "items": [ { "productId": ${milk.id}, "quantity": 1, "unitPrice": 1 } ] }
      """
    Then I remember the response data as "draft"
    And afterwards admin cleans up with "DELETE /api/v1/dispatches/${draft.id}"
    When salesman calls "PATCH /api/v1/dispatches/${draft.id}/submit"
    Then the response status is 200
    When salesman calls "DELETE /api/v1/dispatches/${draft.id}"
    Then the response status is 403
    When admin calls "PATCH /api/v1/dispatches/${draft.id}/unlock"
    And salesman calls "DELETE /api/v1/dispatches/${draft.id}"
    Then the response status is 200
    Given admin dispatches 2 of "milk" at 22 to "me" on "${today-1}" remembered as "old"
    And afterwards admin cleans up with "DELETE /api/v1/dispatches/${old.id}"
    When salesman calls "DELETE /api/v1/dispatches/${old.id}"
    Then the response status is 403

  # ── submit / lock / unlock ──

  Scenario: An admin can submit any entry, which locks it, and a salesman cannot submit someone else's
    Given a salesperson with a clean ledger "other"
    And admin dispatches 2 of "milk" at 22 to "other" on "${today-2}" remembered as "dispatch"
    When salesman calls "PATCH /api/v1/dispatches/${dispatch.id}/submit"
    Then the response status is 403
    When admin calls "PATCH /api/v1/dispatches/${dispatch.id}/submit"
    Then the response status is 200
    When admin calls "GET /api/v1/dispatches?salespersonId=${other.id}&date=${today-2}"
    Then the JSON field "data[0].isSubmitted" equals "true"
    And the JSON field "data[0].isLocked" equals "true"

  Scenario: Superadmins can lock and unlock entries
    Given a salesperson with a clean ledger "other"
    And admin dispatches 2 of "milk" at 22 to "other" on "${today-2}" remembered as "dispatch"
    When superadmin calls "PATCH /api/v1/dispatches/${dispatch.id}/lock"
    Then the response status is 200
    When superadmin calls "PATCH /api/v1/dispatches/${dispatch.id}/unlock"
    Then the response status is 200

  Scenario Outline: Lock actions validate the entry id
    When admin calls "PATCH /api/v1/dispatches/abc/<action>"
    Then the response status is 400

    Examples:
      | action  |
      | submit  |
      | lock    |
      | unlock  |

  Scenario Outline: Opening a day for entry needs a salesperson and a valid date
    When admin calls "POST /api/v1/dispatches/open-for-entry" with:
      """
      <body>
      """
    Then the response status is 400

    Examples:
      | body                                  |
      | { "dispatchDate": "2026-04-30" }      |
      | { "salespersonId": 1 }                |
      | { "salespersonId": 1, "dispatchDate": "bad" } |

  Scenario: Opening a day for a salesperson who already has an entry unlocks that entry
    Given a salesperson with a clean ledger "other"
    And admin dispatches 2 of "milk" at 22 to "other" on "${today-2}" remembered as "dispatch"
    When admin calls "POST /api/v1/dispatches/open-for-entry" with:
      """
      { "salespersonId": ${other.id}, "dispatchDate": "${today-2}" }
      """
    Then the response status is 200
    And the JSON field "data.dispatchId" equals "${dispatch.id}"
    When admin calls "GET /api/v1/dispatches?salespersonId=${other.id}&date=${today-2}"
    Then the JSON field "data[0].isAdminUnlocked" equals "true"
    And the JSON field "data[0].isLocked" equals "false"

  Scenario: Entries cannot be filtered by a non-numeric salesperson
    When admin calls "GET /api/v1/dispatches?salespersonId=abc"
    Then the response status is 400

  # ── dispatcher: only today's entries, only while the day is open ──

  @superadmin
  Scenario: A dispatcher can lock and unlock an entry dated today
    Given today has not been finalised
    And a salesperson with a clean ledger "other"
    And admin dispatches 2 of "milk" at 22 to "other" on "${today}"
    When admin calls "GET /api/v1/dispatches?salespersonId=${other.id}&date=${today}"
    Then I remember the item of "data" whose "salespersonId" is "${other.id}" as "entry"
    When dispatcher calls "PATCH /api/v1/dispatches/${entry.id}/lock"
    Then the response status is 200
    When dispatcher calls "PATCH /api/v1/dispatches/${entry.id}/unlock"
    Then the response status is 200

  @superadmin
  Scenario: A dispatcher cannot lock an entry dated in the future
    Given a salesperson with a clean ledger "other"
    And admin dispatches 2 of "milk" at 22 to "other" on "${today+1}" remembered as "dispatch"
    When dispatcher calls "PATCH /api/v1/dispatches/${dispatch.id}/lock"
    Then the response status is 403
    And the error message contains "today"
