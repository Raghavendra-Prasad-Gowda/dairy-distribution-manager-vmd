@api @salespeople
Feature: Salesperson setup
  Salespeople are the delivery agents. Each scenario creates its own throwaway salesperson and
  removes it afterwards (or deactivates it when it already has history).

  Scenario: A salesperson without a login is created, listed and fetched
    Given a throwaway salesperson "sp"
    When admin calls "GET /api/v1/salespeople/${sp.id}"
    Then the call succeeds
    And the JSON field "data.name" equals "${sp.name}"
    And the JSON field "data.username" equals "null"
    And the JSON field "data.isActive" equals "true"
    When admin calls "GET /api/v1/salespeople"
    Then the JSON list "data" contains an item whose "id" is "${sp.id}"

  Scenario: A salesperson's password is never returned
    Given a throwaway salesperson "sp" who can log in
    When admin calls "GET /api/v1/salespeople/${sp.id}"
    Then the JSON field "data.passwordHash" is absent
    And the JSON field "data.password" is absent

  Scenario: A salesperson with a login can sign in as a salesman
    Given a throwaway salesperson "sp" who can log in
    When anonymous calls "POST /api/v1/auth/login" with:
      """
      { "username": "${sp.username}", "password": "${sp.password}" }
      """
    Then the response status is 200
    And the JSON field "data.role" equals "salesman"
    And the JSON field "data.salespersonId" equals "${sp.id}"

  Scenario Outline: A login needs both a username and a password
    When admin calls "POST /api/v1/salespeople" with:
      """
      <body>
      """
    Then the response status is 400

    Examples:
      | body                                                          |
      | { "name": "E2E x", "username": "e2e-nopass" }                 |
      | { "name": "E2E x", "password": "secret1" }                    |
      | { "name": "E2E x", "username": "ab", "password": "secret1" }  |
      | { "name": "E2E x", "username": "e2e-short", "password": "123" } |
      | { "username": "e2e-noname", "password": "secret1" }           |

  Scenario: Usernames are unique regardless of letter case
    Given a throwaway salesperson "sp" who can log in
    When admin calls "POST /api/v1/salespeople" with:
      """
      { "name": "E2E duplicate", "username": "${sp.username}", "password": "secret1" }
      """
    Then the response status is 409
    And the error message contains "already taken"

  Scenario: A salesperson's details can be updated and deactivating hides them from the default list
    Given a throwaway salesperson "sp"
    When admin calls "PUT /api/v1/salespeople/${sp.id}" with:
      """
      { "phone": "9876543210", "route": "E2E route" }
      """
    Then the response status is 200
    And the JSON field "data.phone" equals "9876543210"
    When admin calls "PUT /api/v1/salespeople/${sp.id}" with:
      """
      { "isActive": false }
      """
    Then the response status is 200
    When admin calls "GET /api/v1/salespeople"
    Then the JSON list "data" has no item whose "id" is "${sp.id}"
    When admin calls "GET /api/v1/salespeople?all=true"
    Then the JSON list "data" contains an item whose "id" is "${sp.id}"

  Scenario: Removing a salesperson's username removes their login
    Given a throwaway salesperson "sp" who can log in
    When admin calls "PUT /api/v1/salespeople/${sp.id}" with:
      """
      { "username": null }
      """
    Then the response status is 200
    And the JSON field "data.username" equals "null"
    When anonymous calls "POST /api/v1/auth/login" with:
      """
      { "username": "${sp.username}", "password": "${sp.password}" }
      """
    Then the response status is 401

  Scenario: A wrong password does not sign a salesman in
    Given a throwaway salesperson "sp" who can log in
    When anonymous calls "POST /api/v1/auth/login" with:
      """
      { "username": "${sp.username}", "password": "definitely-wrong" }
      """
    Then the response status is 401
    And the error message contains "Invalid username or password"

  Scenario: A salesperson can be deleted while they have no history
    Given a throwaway salesperson "sp"
    When admin calls "DELETE /api/v1/salespeople/${sp.id}"
    Then the response status is 200
    When admin calls "GET /api/v1/salespeople/${sp.id}"
    Then the response status is 404

  Scenario Outline: Salesperson ids are validated
    When admin calls "<method> /api/v1/salespeople/<id>" with:
      """
      { "name": "E2E x" }
      """
    Then the response status is <status>

    Examples:
      | method | id         | status |
      | GET    | abc        | 400    |
      | GET    | 2147483647 | 404    |
      | PUT    | abc        | 400    |
      | DELETE | abc        | 400    |

  Scenario: Salespeople are listed in display order
    Given a throwaway salesperson "first"
    And a throwaway salesperson "second"
    When admin calls "PUT /api/v1/salespeople/reorder" with:
      """
      [ { "id": ${first.id}, "displayOrder": 9002 }, { "id": ${second.id}, "displayOrder": 9001 } ]
      """
    Then the response status is 200
    When admin calls "GET /api/v1/salespeople"
    Then the JSON list "data" is ordered by "id" as "${second.id}, ${first.id}"

  Scenario: Invalid reorder payloads are refused
    When admin calls "PUT /api/v1/salespeople/reorder" with:
      """
      { "id": 1 }
      """
    Then the response status is 400

  @superadmin
  Scenario Outline: Ledger reset requests are validated
    When superadmin calls "POST /api/v1/salespeople/reset-ledger" with:
      """
      <body>
      """
    Then the response status is <status>

    Examples:
      | body                                  | status |
      | { "salespersonIds": [] }              | 400    |
      | { }                                   | 400    |
      | { "salespersonIds": [1, 1] }          | 400    |
      | { "salespersonIds": [2147483647] }    | 404    |
