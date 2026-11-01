@api @admin-users @superadmin
Feature: Admin user management
  Only superadmins manage who can sign in as admin, dispatcher or superadmin. Throwaway users are
  deleted at the end of each scenario.

  Scenario: A superadmin creates an admin, who then shows up in the list without a password
    Given the scenario works with an identifier "name"
    When superadmin calls "POST /api/v1/admin-users" with:
      """
      { "username": "e2e-${name}", "password": "secret123", "role": "admin" }
      """
    Then the response status is 201
    And I remember the response data as "user"
    And afterwards superadmin cleans up with "DELETE /api/v1/admin-users/${user.id}"
    And the JSON field "data.role" equals "admin"
    And the JSON field "data.passwordHash" is absent
    When superadmin calls "GET /api/v1/admin-users"
    Then the JSON list "data" contains an item whose "id" is "${user.id}"
    And the JSON field "data.find { it.id == ${user.id} }.passwordHash" is absent

  Scenario: The role defaults to admin
    Given the scenario works with an identifier "name"
    When superadmin calls "POST /api/v1/admin-users" with:
      """
      { "username": "e2e-${name}", "password": "secret123" }
      """
    Then the response status is 201
    And I remember the response data as "user"
    And afterwards superadmin cleans up with "DELETE /api/v1/admin-users/${user.id}"
    And the JSON field "data.role" equals "admin"

  Scenario: A username can only be used once
    Given a throwaway admin user "user"
    When superadmin calls "POST /api/v1/admin-users" with:
      """
      { "username": "${user.username}", "password": "secret123", "role": "admin" }
      """
    Then the response status is 409
    And the error message contains "already taken"

  Scenario Outline: Invalid admin users are refused
    When superadmin calls "POST /api/v1/admin-users" with:
      """
      <body>
      """
    Then the response status is 400
    And the error code is "VALIDATION_ERROR"

    Examples:
      | body                                                                  |
      | { "password": "secret123" }                                           |
      | { "username": "e2e-ok" }                                              |
      | { "username": "ab", "password": "secret123" }                         |
      | { "username": "e2e-ok", "password": "123" }                           |
      | { "username": "e2e-ok", "password": "secret123", "role": "owner" }    |

  Scenario: Role, status and password can be changed
    Given a throwaway admin user "user"
    When superadmin calls "PUT /api/v1/admin-users/${user.id}" with:
      """
      { "role": "dispatcher", "isActive": false, "password": "another-secret" }
      """
    Then the response status is 200
    And the JSON field "data.role" equals "dispatcher"
    And the JSON field "data.isActive" equals "false"

  Scenario: A username cannot be changed to one that is taken
    Given a throwaway admin user "first"
    And a throwaway admin user "second"
    When superadmin calls "PUT /api/v1/admin-users/${second.id}" with:
      """
      { "username": "${first.username}" }
      """
    Then the response status is 409

  Scenario: Superadmins cannot lock themselves out
    Given the superadmin's own account as "self"
    When superadmin calls "PUT /api/v1/admin-users/${self.id}" with:
      """
      { "isActive": false }
      """
    Then the response status is 400
    And the error message contains "cannot deactivate your own"
    When superadmin calls "PUT /api/v1/admin-users/${self.id}" with:
      """
      { "role": "admin" }
      """
    Then the response status is 400
    And the error message contains "cannot change your own role"
    When superadmin calls "DELETE /api/v1/admin-users/${self.id}"
    Then the response status is 400
    And the error message contains "cannot delete your own"

  Scenario: An admin user is deleted once
    Given a throwaway admin user "user"
    When superadmin calls "DELETE /api/v1/admin-users/${user.id}"
    Then the response status is 200
    When superadmin calls "DELETE /api/v1/admin-users/${user.id}"
    Then the response status is 404

  Scenario Outline: Admin user ids are validated
    When superadmin calls "<method> /api/v1/admin-users/<id>" with:
      """
      { "isActive": true }
      """
    Then the response status is <status>

    Examples:
      | method | id         | status |
      | PUT    | abc        | 400    |
      | PUT    | 2147483647 | 404    |
      | DELETE | abc        | 400    |
      | DELETE | 2147483647 | 404    |

  Scenario: A superadmin can require another account to use two-step sign-in
    Given a throwaway admin user "user"
    When superadmin calls "PUT /api/v1/admin-users/${user.id}/mfa-required" with:
      """
      { "required": true }
      """
    Then the response status is 200
    When superadmin calls "PUT /api/v1/admin-users/${user.id}/mfa-required" with:
      """
      { "required": false }
      """
    Then the response status is 200

  Scenario: Two-step sign-in cannot be required of a dispatcher or of yourself
    Given a throwaway admin user "dispatcher" with role "dispatcher"
    And the superadmin's own account as "self"
    When superadmin calls "PUT /api/v1/admin-users/${dispatcher.id}/mfa-required" with:
      """
      { "required": true }
      """
    Then the response status is 400
    And the error message contains "admin and super admin"
    When superadmin calls "PUT /api/v1/admin-users/${self.id}/mfa-required" with:
      """
      { "required": true }
      """
    Then the response status is 400

  Scenario: A superadmin can see their own two-step sign-in status
    When superadmin calls "GET /api/v1/admin-users/mfa/status"
    Then the call succeeds

  Scenario: Two-step sign-in is for superadmins only
    Given a throwaway admin user "user"
    When admin calls "GET /api/v1/admin-users/mfa/status"
    Then the response status is 403
