@api @auth @superadmin
Feature: Authentication
  Sign-in is rate-limited to 20 attempts an hour per address, and every attempt counts, so this
  feature signs in only as often as it must. Accounts are throwaway users, never the E2E accounts.

  Scenario: An admin signs in (user names ignore letter case), changes their password and must use the new one
    Given a throwaway admin user "user"
    When anonymous calls "POST /api/v1/auth/login" with:
      """
      { "username": "${upper:user.username}", "password": "${user.password}" }
      """
    Then the response status is 200
    And the JSON field "data.role" equals "admin"
    And the JSON field "data.accessToken" is present
    And the response header "Set-Cookie" contains "HttpOnly"
    And the response header "Set-Cookie" contains "Secure"
    And the response header "Set-Cookie" contains "SameSite=None"
    And I remember the JSON field "data.accessToken" as "session"
    When a caller holding "session" only as a cookie calls "GET /api/v1/brands"
    Then the response status is 403
    When the holder of "session" calls "POST /api/v1/auth/change-password" with:
      """
      { "currentPassword": "wrong-current", "newPassword": "brand-new-pass" }
      """
    Then the response status is 401
    And the error message contains "Current password is incorrect"
    When the holder of "session" calls "POST /api/v1/auth/change-password" with:
      """
      { "currentPassword": "${user.password}", "newPassword": "123" }
      """
    Then the response status is 400
    When the holder of "session" calls "POST /api/v1/auth/change-password" with:
      """
      { "newPassword": "brand-new-pass" }
      """
    Then the response status is 400
    When the holder of "session" calls "POST /api/v1/auth/change-password" with:
      """
      { "currentPassword": "${user.password}", "newPassword": "brand-new-pass" }
      """
    Then the response status is 200
    When anonymous calls "POST /api/v1/auth/login" with:
      """
      { "username": "${user.username}", "password": "brand-new-pass" }
      """
    Then the response status is 200

  Scenario: Wrong passwords and unknown users get the same answer
    Given a throwaway admin user "user"
    When anonymous calls "POST /api/v1/auth/login" with:
      """
      { "username": "${user.username}", "password": "definitely-wrong" }
      """
    Then the response status is 401
    And the error message contains "Invalid username or password"
    When anonymous calls "POST /api/v1/auth/login" with:
      """
      { "username": "e2e-nobody-${unique}", "password": "whatever1" }
      """
    Then the response status is 401
    And the error message contains "Invalid username or password"

  Scenario: A deactivated account cannot sign in
    Given a throwaway admin user "user"
    When superadmin calls "PUT /api/v1/admin-users/${user.id}" with:
      """
      { "isActive": false }
      """
    Then the response status is 200
    When anonymous calls "POST /api/v1/auth/login" with:
      """
      { "username": "${user.username}", "password": "${user.password}" }
      """
    Then the response status is 401

  Scenario: A sign-in needs a username and a password
    When anonymous calls "POST /api/v1/auth/login" with:
      """
      { "username": "someone" }
      """
    Then the response status is 400
    And the error code is "VALIDATION_ERROR"

  Scenario: Signing out succeeds for a signed-in user and is refused without a token
    When admin calls "POST /api/v1/auth/logout"
    Then the response status is 200
    When anonymous calls "POST /api/v1/auth/logout"
    Then the response status is 403

  Scenario Outline: Two-step sign-in endpoints refuse a made-up session
    When anonymous calls "POST /api/v1/auth/mfa/<step>" with:
      """
      { "mfaToken": "not.a.real.token"<extra> }
      """
    Then the response status is 401

    Examples:
      | step             | extra                  |
      | verify           | , "code": "123456"     |
      | setup-required   |                        |
      | confirm-required | , "code": "123456"     |

  Scenario Outline: Two-step codes must be well formed
    When anonymous calls "POST /api/v1/auth/mfa/<step>" with:
      """
      <body>
      """
    Then the response status is 400

    Examples:
      | step             | body                                          |
      | verify           | { "code": "123456" }                          |
      | confirm-required | { "mfaToken": "x", "code": "12" }             |
      | confirm-required | { "mfaToken": "x", "code": "abcdef" }         |

  Scenario: A superadmin signs in as a superadmin, changes their own password and signs out
    Given a throwaway admin user "boss" with role "superadmin"
    When anonymous calls "POST /api/v1/auth/login" with:
      """
      { "username": "${boss.username}", "password": "${boss.password}" }
      """
    Then the response status is 200
    And the JSON field "data.role" equals "superadmin"
    And I remember the JSON field "data.accessToken" as "session"
    When the holder of "session" calls "POST /api/v1/auth/change-password" with:
      """
      { "currentPassword": "${boss.password}", "newPassword": "brand-new-pass" }
      """
    Then the response status is 200
    When the holder of "session" calls "POST /api/v1/auth/logout"
    Then the response status is 200

  @superadmin
  Scenario: A dispatcher can change their own password
    Given the run's dispatcher as "dsp"
    When dispatcher calls "POST /api/v1/auth/change-password" with:
      """
      { "currentPassword": "${dsp.password}", "newPassword": "brand-new-pass" }
      """
    Then the response status is 200

  Scenario: A salesman can change their own password, and needs the current one to do so
    Given the run's salesman as "me"
    When salesman calls "POST /api/v1/auth/change-password" with:
      """
      { "currentPassword": "not-my-password", "newPassword": "brand-new-pass" }
      """
    Then the response status is 401
    When salesman calls "POST /api/v1/auth/change-password" with:
      """
      { "currentPassword": "${me.password}", "newPassword": "brand-new-pass" }
      """
    Then the response status is 200

  Scenario Outline: Every kind of user can sign out
    When <role> calls "POST /api/v1/auth/logout"
    Then the response status is 200

    Examples:
      | role       |
      | admin      |
      | superadmin |
      | dispatcher |
      | salesman   |
