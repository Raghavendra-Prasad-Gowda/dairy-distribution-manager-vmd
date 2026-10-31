@ui
Feature: Sign in

  Scenario: Admin can sign in and reach the dashboard
    Given I open the login page
    When I sign in as the admin
    Then I see the dashboard
