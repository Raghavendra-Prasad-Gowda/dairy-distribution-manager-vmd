@api @client-errors
Feature: Frontend crash reports
  The browser reports crashes to a public endpoint. It must accept sparse reports from anyone, even
  with a bad token, but refuse oversized fields.

  Scenario Outline: A crash report is accepted from anyone
    When <caller> calls "POST /api/v1/errors/client" with:
      """
      <body>
      """
    Then the response status is 200

    Examples:
      | caller    | body                                                                  |
      | anonymous | { "message": "E2E report", "page": "/e2e", "version": "v0-e2e" }      |
      | anonymous | { }                                                                   |
      | anonymous | { "message": "only a message" }                                       |
      | admin     | { "message": "signed-in report" }                                     |

  Scenario: A crash report with a broken token is still accepted
    When a caller with a malformed token calls "POST /api/v1/errors/client" with:
      """
      { "message": "stale session" }
      """
    Then the response status is 200

  Scenario Outline: Oversized fields are refused
    When anonymous calls "POST /api/v1/errors/client" with:
      """
      { "<field>": "${repeat:<length>}" }
      """
    Then the response status is 400

    Examples:
      | field   | length |
      | message | 2001   |
      | stack   | 5001   |
      | page    | 301    |
      | version | 61     |
