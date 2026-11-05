@api @pin
Feature: Edit and P&L PINs
  Protected edits ask for a 6-digit PIN. The real PINs are secrets the suite does not know, so it only
  checks that wrong or malformed input is refused and that PINs cannot be changed by mistake: every
  "current PIN" used here is deliberately not a PIN. Each wrong guess counts toward the PIN
  rate limit (20 per 15 minutes), so there are only a few.

  Scenario Outline: A wrong PIN is refused
    When admin calls "POST /api/v1/<endpoint>" with:
      """
      { "pin": "000000" }
      """
    Then the response status is 400
    And the error message contains "Incorrect PIN"

    Examples:
      | endpoint          |
      | pin/verify        |
      | pin/verify-pl     |

  Scenario Outline: A missing PIN is refused
    When admin calls "POST /api/v1/<endpoint>" with:
      """
      { }
      """
    Then the response status is 400

    Examples:
      | endpoint          |
      | pin/verify        |
      | pin/verify-pl     |

  Scenario: Admins can read whether the P&L PIN gate is on
    When admin calls "GET /api/v1/pin/settings"
    Then the call succeeds
    And the JSON field "data.plPinEnabled" is present

  @superadmin
  Scenario Outline: The P&L gate setting must be a true or false
    When superadmin calls "PUT /api/v1/pin/settings" with:
      """
      <body>
      """
    Then the response status is 400

    Examples:
      | body                          |
      | { }                           |
      | { "plPinEnabled": "yes" }     |

  @superadmin
  Scenario Outline: Changing a PIN needs a valid new PIN and the right current PIN
    When superadmin calls "PUT /api/v1/pin/<endpoint>" with:
      """
      <body>
      """
    Then the response status is 400

    Examples:
      | endpoint   | body                                                     |
      | update     | { "currentPin": "not-the-pin", "newPin": "123456" }      |
      | update     | { "currentPin": "not-the-pin", "newPin": "12345" }       |
      | update     | { "currentPin": "not-the-pin", "newPin": "12345a" }      |
      | update     | { "newPin": "123456" }                                   |
      | update-pl  | { "currentPin": "not-the-pin", "newPin": "123456" }      |
      | update-pl  | { "currentPin": "not-the-pin", "newPin": "1234567" }     |
      | update-pl  | { "currentPin": "not-the-pin", "newPin": "12345a" }      |
