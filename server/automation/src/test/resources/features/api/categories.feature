@api @categories
Feature: Category setup
  Categories group a brand's products and decide the order they appear in on every screen.
  Scenarios add and remove their own categories under the existing Nandini brand.

  Background:
    Given the existing brand "Nandini" as "brand"

  Scenario: A category is created, listed for its brand and deleted
    Given the scenario works with an identifier "name"
    When admin calls "POST /api/v1/categories" with:
      """
      { "brandId": ${brand.id}, "name": "${name}" }
      """
    Then the response status is 201
    And I remember the response data as "category"
    And afterwards admin cleans up with "DELETE /api/v1/categories/${category.id}"
    When admin calls "GET /api/v1/categories?brandId=${brand.id}"
    Then the call succeeds
    And the JSON list "data" contains an item whose "name" is "${name}"
    When admin calls "DELETE /api/v1/categories/${category.id}"
    Then the response status is 200
    When admin calls "GET /api/v1/categories?brandId=${brand.id}"
    Then the JSON list "data" has no item whose "name" is "${name}"
    When admin calls "DELETE /api/v1/categories/${category.id}"
    Then the response status is 404

  Scenario: A category name is unique within its brand
    Given a throwaway category "category" in brand "brand"
    When admin calls "POST /api/v1/categories" with:
      """
      { "brandId": ${brand.id}, "name": "${category.name}" }
      """
    Then the response status is 400
    And the error code is "DUPLICATE"

  Scenario Outline: Creating a category needs a brand and a name
    When admin calls "POST /api/v1/categories" with:
      """
      <body>
      """
    Then the response status is 400
    And the error code is "VALIDATION_ERROR"

    Examples:
      | body                          |
      | { "name": "E2E-no-brand" }    |
      | { "brandId": 1 }              |
      | { "brandId": 1, "name": "" }  |

  Scenario: Renaming a category persists
    Given a throwaway category "category" in brand "brand"
    And the scenario works with an identifier "newName"
    When admin calls "PUT /api/v1/categories/${category.id}" with:
      """
      { "name": "${newName}" }
      """
    Then the response status is 200
    And the JSON field "data.name" equals "${newName}"
    When admin calls "GET /api/v1/categories?brandId=${brand.id}"
    Then the JSON list "data" contains an item whose "name" is "${newName}"
    And the JSON list "data" has no item whose "name" is "${category.name}"

  Scenario: The deposit flag can be changed without renaming
    Given a throwaway category "category" in brand "brand"
    When admin calls "PUT /api/v1/categories/${category.id}" with:
      """
      { "depositEnabled": true }
      """
    Then the response status is 200
    And the JSON field "data.depositEnabled" equals "true"
    And the JSON field "data.name" equals "${category.name}"

  Scenario: Name and deposit flag can be changed together
    Given a throwaway category "category" in brand "brand"
    And the scenario works with an identifier "newName"
    When admin calls "PUT /api/v1/categories/${category.id}" with:
      """
      { "name": "${newName}", "depositEnabled": true }
      """
    Then the response status is 200
    And the JSON field "data.name" equals "${newName}"
    And the JSON field "data.depositEnabled" equals "true"

  Scenario Outline: Invalid category updates are refused
    Given a throwaway category "category" in brand "brand"
    When admin calls "PUT /api/v1/categories/${category.id}" with:
      """
      <body>
      """
    Then the response status is 400

    Examples:
      | body             |
      | { "name": "" }   |
      | { }              |

  Scenario Outline: Category ids are validated
    When admin calls "<method> /api/v1/categories/<id>" with:
      """
      { "name": "E2E-x" }
      """
    Then the response status is <status>

    Examples:
      | method | id         | status |
      | PUT    | abc        | 400    |
      | PUT    | 2147483647 | 404    |
      | DELETE | abc        | 400    |
      | DELETE | 2147483647 | 404    |

  Scenario: Categories are listed in display order
    Given a throwaway category "first" in brand "brand"
    And a throwaway category "second" in brand "brand"
    When admin calls "PATCH /api/v1/categories/reorder" with:
      """
      [ { "id": ${first.id}, "displayOrder": 9002 }, { "id": ${second.id}, "displayOrder": 9001 } ]
      """
    Then the response status is 200
    When admin calls "GET /api/v1/categories?brandId=${brand.id}"
    Then the JSON list "data" is ordered by "name" as "${second.name}, ${first.name}"

  Scenario Outline: Invalid reorder payloads are refused
    When admin calls "PATCH /api/v1/categories/reorder" with:
      """
      <payload>
      """
    Then the response status is 400

    Examples:
      | payload                  |
      | { "id": 1 }              |
      | [ { "id": 1 } ]          |

  @superadmin
  Scenario: Renaming a category renames it on the brand's products too
    Given a throwaway brand "own"
    And a throwaway category "category" in brand "own"
    And a throwaway product "product" in brand "own" with:
      """
      { "category": "${category.name}" }
      """
    And the scenario works with an identifier "newName"
    When admin calls "PUT /api/v1/categories/${category.id}" with:
      """
      { "name": "${newName}" }
      """
    Then the response status is 200
    When admin calls "GET /api/v1/products?brandId=${own.id}"
    Then the JSON field "data.find { it.id == ${product.id} }.category" equals "${newName}"
