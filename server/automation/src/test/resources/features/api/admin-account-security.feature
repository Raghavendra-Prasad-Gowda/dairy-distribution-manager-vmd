@api @admin-users @superadmin
Feature: Account unlock and the superadmin's own two-step sign-in
  Unlocking another account, and enrolling or removing two-step sign-in on your own account, are superadmin
  duties. A real lock-out needs five wrong passwords and a real enrolment changes the shared superadmin, so
  those paths stay in the mocked specs (`accountLock`, `mfa`); everything reachable without side effects is here.

  Scenario: An account that is not locked cannot be unlocked
    Given a throwaway admin user "user"
    When superadmin calls "PUT /api/v1/admin-users/${user.id}/unlock"
    Then the response status is 400
    And the error message contains "not locked"

  Scenario Outline: Unlocking needs a real account id
    When superadmin calls "PUT /api/v1/admin-users/<id>/unlock"
    Then the response status is <status>

    Examples:
      | id         | status |
      | abc        | 400    |
      | 0          | 400    |
      | 2147483647 | 404    |

  Scenario Outline: Only a superadmin can unlock an account
    Given a throwaway admin user "user"
    When <caller> calls "PUT /api/v1/admin-users/${user.id}/unlock"
    Then the response status is <status>

    Examples:
      | caller     | status |
      | admin      | 403    |
      | dispatcher | 403    |
      | anonymous  | 403    |

  Scenario Outline: Confirming two-step sign-in needs a six-digit code
    When superadmin calls "POST /api/v1/admin-users/mfa/confirm" with:
      """
      <body>
      """
    Then the response status is 400

    Examples:
      | body                |
      | {}                  |
      | { "code": "12" }    |
      | { "code": "abcdef" } |
      | { "code": "1234567" } |

  Scenario: A well-formed code is refused when no enrolment is pending or the code is wrong
    When superadmin calls "POST /api/v1/admin-users/mfa/confirm" with:
      """
      { "code": "000000" }
      """
    Then the response status is 400

  Scenario: Removing two-step sign-in needs the account password
    When superadmin calls "POST /api/v1/admin-users/mfa/disable" with:
      """
      {}
      """
    Then the response status is 400
    When superadmin calls "POST /api/v1/admin-users/mfa/disable" with:
      """
      { "password": "definitely-not-the-password" }
      """
    Then the response status is 401
    And the error message contains "incorrect"

  Scenario Outline: Two-step sign-in enrolment is for superadmins only
    When <caller> calls "<request>" with:
      """
      { "code": "123456", "password": "x" }
      """
    Then the response status is <status>

    Examples:
      | caller     | request                                | status |
      | admin      | POST /api/v1/admin-users/mfa/setup     | 403    |
      | admin      | POST /api/v1/admin-users/mfa/confirm   | 403    |
      | admin      | POST /api/v1/admin-users/mfa/disable   | 403    |
      | dispatcher | POST /api/v1/admin-users/mfa/setup     | 403    |
      | dispatcher | POST /api/v1/admin-users/mfa/confirm   | 403    |
      | dispatcher | POST /api/v1/admin-users/mfa/disable   | 403    |
      | anonymous  | POST /api/v1/admin-users/mfa/setup     | 403    |
      | anonymous  | POST /api/v1/admin-users/mfa/confirm   | 403    |
      | anonymous  | POST /api/v1/admin-users/mfa/disable   | 403    |
