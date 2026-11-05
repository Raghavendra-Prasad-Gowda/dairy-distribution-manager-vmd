@api @brands @superadmin
Feature: Brand setup
  Only superadmins create, rename, deactivate and archive brands; admins may adjust deposit settings.
  Every scenario works on its own throwaway brand, which is archived afterwards (archived brands are
  hidden from every list).

  Background:
    Given a throwaway brand "brand"

  Scenario: A new brand is listed for admins
    When admin calls "GET /api/v1/brands"
    Then the call succeeds
    And the JSON list "data" contains an item whose "id" is "${brand.id}"

  Scenario: A superadmin creates a brand and the name must stay unique
    Given the scenario works with an identifier "name"
    When superadmin calls "POST /api/v1/brands" with:
      """
      { "name": "${name}" }
      """
    Then the response status is 201
    And I remember the response data as "created"
    And afterwards superadmin cleans up with "PUT /api/v1/brands/${created.id}" with:
      """
      { "isArchived": true }
      """
    And the JSON field "data.name" equals "${name}"
    When superadmin calls "POST /api/v1/brands" with:
      """
      { "name": "${name}" }
      """
    Then the response status is 400
    And the error code is "DUPLICATE"

  Scenario: A brand needs a name
    When superadmin calls "POST /api/v1/brands" with:
      """
      { }
      """
    Then the response status is 400
    And the error code is "VALIDATION_ERROR"

  Scenario Outline: Admins cannot change what only superadmins may change
    When admin calls "PUT /api/v1/brands/${brand.id}" with:
      """
      <body>
      """
    Then the response status is 403

    Examples:
      | body                      |
      | { "name": "Renamed" }     |
      | { "isActive": false }     |
      | { "isArchived": true }    |

  Scenario: A superadmin renames a brand
    Given the scenario works with an identifier "newName"
    When superadmin calls "PUT /api/v1/brands/${brand.id}" with:
      """
      { "name": "${newName}" }
      """
    Then the response status is 200
    And the JSON field "data.name" equals "${newName}"
    When admin calls "GET /api/v1/brands"
    Then the JSON list "data" contains an item whose "name" is "${newName}"

  Scenario: Admins can switch deposits on and set the per-litre rate
    When admin calls "PUT /api/v1/brands/${brand.id}" with:
      """
      { "depositEnabled": true, "depositPerLitre": 1.5 }
      """
    Then the response status is 200
    And the JSON field "data.depositEnabled" equals "true"
    And the JSON amount "data.depositPerLitre" equals "1.5"

  Scenario: A negative deposit rate is refused
    When admin calls "PUT /api/v1/brands/${brand.id}" with:
      """
      { "depositPerLitre": -1 }
      """
    Then the response status is 400

  Scenario: A deactivated brand drops out of the default list but admins can still see it on request
    When superadmin calls "PUT /api/v1/brands/${brand.id}" with:
      """
      { "isActive": false }
      """
    Then the response status is 200
    When admin calls "GET /api/v1/brands"
    Then the JSON list "data" has no item whose "id" is "${brand.id}"
    When admin calls "GET /api/v1/brands?includeInactive=true"
    Then the JSON list "data" contains an item whose "id" is "${brand.id}"

  Scenario: Archiving hides a brand everywhere and cannot be undone
    When superadmin calls "PUT /api/v1/brands/${brand.id}" with:
      """
      { "isArchived": true }
      """
    Then the response status is 200
    And the JSON field "data.isArchived" equals "true"
    And the JSON field "data.isActive" equals "false"
    When admin calls "GET /api/v1/brands?includeInactive=true"
    Then the JSON list "data" has no item whose "id" is "${brand.id}"
    When superadmin calls "PUT /api/v1/brands/${brand.id}" with:
      """
      { "isArchived": false }
      """
    Then the response status is 400
    And the error message contains "cannot be restored"

  Scenario Outline: Brand ids are validated
    When superadmin calls "PUT /api/v1/brands/<id>" with:
      """
      { "depositEnabled": true }
      """
    Then the response status is <status>

    Examples:
      | id         | status |
      | abc        | 400    |
      | 0          | 400    |
      | 2147483647 | 404    |

  Scenario: Salesmen cannot list brands
    When salesman calls "GET /api/v1/brands"
    Then the response status is 403

  Scenario: Brands can be reordered
    Given a throwaway brand "second"
    When superadmin calls "PATCH /api/v1/brands/reorder" with:
      """
      [ { "id": ${brand.id}, "displayOrder": 9002 }, { "id": ${second.id}, "displayOrder": 9001 } ]
      """
    Then the response status is 200
    When admin calls "GET /api/v1/brands"
    Then the JSON list "data" is ordered by "id" as "${second.id}, ${brand.id}"

  Scenario Outline: Invalid reorder payloads are refused
    When admin calls "PATCH /api/v1/brands/reorder" with:
      """
      <payload>
      """
    Then the response status is 400

    Examples:
      | payload                  |
      | { "id": 1 }              |
      | [ { "id": 1 } ]          |

  Scenario: Copying products into another brand copies categories and products once
    Given a throwaway brand "target"
    And a throwaway category "category" in brand "brand"
    And a throwaway product "product" in brand "brand" with:
      """
      { "category": "${category.name}" }
      """
    When admin calls "POST /api/v1/brands/${target.id}/copy-products" with:
      """
      { "sourceBrandId": ${brand.id} }
      """
    Then the response status is 200
    And the JSON field "data.copiedProducts" equals "1"
    And the JSON field "data.copiedCategories" equals "1"
    When admin calls "GET /api/v1/products?brandId=${target.id}"
    Then the JSON list "data" contains an item whose "name" is "${product.name}"
    When admin calls "POST /api/v1/brands/${target.id}/copy-products" with:
      """
      { "sourceBrandId": ${brand.id} }
      """
    Then the response status is 200
    And the JSON field "data.copiedProducts" equals "0"
    And the JSON field "data.copiedCategories" equals "0"

  Scenario Outline: Copy-products rejects bad requests
    When admin calls "POST /api/v1/brands/<target>/copy-products" with:
      """
      <body>
      """
    Then the response status is <status>

    Examples:
      | target     | body                              | status |
      | abc        | { "sourceBrandId": 1 }            | 400    |
      | 1          | { }                               | 400    |
      | 1          | { "sourceBrandId": 1 }            | 400    |
      | 2147483647 | { "sourceBrandId": 1 }            | 404    |
      | 1          | { "sourceBrandId": 2147483647 }   | 404    |

  Scenario: Salesmen cannot copy products
    When salesman calls "POST /api/v1/brands/${brand.id}/copy-products" with:
      """
      { "sourceBrandId": 1 }
      """
    Then the response status is 403

  Scenario: Copying from a brand that has no products copies nothing
    Given a throwaway brand "empty"
    When admin calls "POST /api/v1/brands/${brand.id}/copy-products" with:
      """
      { "sourceBrandId": ${empty.id} }
      """
    Then the response status is 200
    And the JSON field "data.copiedProducts" equals "0"
    And the JSON field "data.copiedCategories" equals "0"

  Scenario: Copying products also carries over each salesperson's access and price for them
    Given a throwaway brand "target"
    And a throwaway product "milk" in brand "brand"
    And the run's salesman as "me"
    And admin calls "POST /api/v1/salespeople/${me.id}/products/bulk" with:
      """
      { "products": [ { "productId": ${milk.id}, "isEnabled": true } ] }
      """
    And admin sets the price of "milk" for "me" to 37
    When admin calls "POST /api/v1/brands/${target.id}/copy-products" with:
      """
      { "sourceBrandId": ${brand.id} }
      """
    Then the response status is 200
    And the JSON field "data.copiedProducts" equals "1"
    And the JSON field "data.copiedSalespersonAssignments" equals "1"
    And the JSON field "data.copiedSalespersonPrices" equals "1"
    And the JSON field "data.fromBrand" equals "${brand.name}"
    And the JSON field "data.toBrand" equals "${target.name}"
    When admin calls "GET /api/v1/products?brandId=${target.id}"
    Then I remember the item of "data" whose "name" is "${milk.name}" as "copy"
    When admin calls "GET /api/v1/salespeople/${me.id}/prices"
    Then the JSON field "data.find { it.productId == ${copy.id} }.isEnabled" equals "true"
    And the JSON amount "data.find { it.productId == ${copy.id} }.sellingPrice" equals "37"
