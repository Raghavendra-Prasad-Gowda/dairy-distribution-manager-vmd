@api @auth @superadmin
Feature: Authentication
  Sign-in is rate-limited to 20 attempts an hour per address, and every attempt counts, so this
  feature signs in only as often as it must. Accounts are throwaway users, never the E2E accounts.

  Scenario: An admin signs in, changes their password and must use the new one
    Given a throwaway admin user "user"
    When anonymous calls "POST /api/v1/auth/login" with:
      """
      { "username": "${user.username}", "password": "${user.password}" }
      """
    Then the response status is 200
    And the JSON field "data.role" equals "admin"
    And the JSON field "data.accessToken" is present
    And I remember the JSON field "data.accessToken" as "session"
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
