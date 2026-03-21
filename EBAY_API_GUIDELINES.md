# eBay API Guidelines

This document serves as the complete reference for eBay API interactions in this application, which creates draft eBay listings via direct REST API calls.

## 1. OAuth Token Refresh

**Endpoint:** `POST https://api.ebay.com/identity/v1/oauth2/token`

**HTTP Method:** `POST`

**Required Headers:**
- `Content-Type`: `application/x-www-form-urlencoded`
- `Authorization`: `Basic <B64-encoded-oauth-credentials>` (where `<B64-encoded-oauth-credentials>` is Base64 encoded `<client_id>:<client_secret>`)

**Request Body Schema:**
- `grant_type` (Required, String): Must be `refresh_token`
- `refresh_token` (Required, String): The long-lived refresh token
- `scope` (Optional, String): URL-encoded string of space-separated scopes

**Sample Request Body:**
```text
grant_type=refresh_token&refresh_token=v^1.1#i^1#p^3#...&scope=https://api.ebay.com/oauth/api_scope/sell.account%20https://api.ebay.com/oauth/api_scope/sell.inventory
```

**Response Shape (Relevant Fields):**
```json
{
  "access_token": "v^1.1#i...",
  "expires_in": 7200,
  "token_type": "User Access Token"
}
```

---

## 2. getCategorySuggestions

**Endpoint:** `GET https://api.ebay.com/commerce/taxonomy/v1/category_tree/{category_tree_id}/get_category_suggestions`

**HTTP Method:** `GET`

**URI Parameters:**
- `category_tree_id` (Required, String): e.g. `0` for US
- `q` (Required, String): The search query keyword(s)

**Required Headers:**
- `Authorization`: `Bearer <user_access_token>`

**Request Body Schema:** None

**Sample Request:**
```text
GET https://api.ebay.com/commerce/taxonomy/v1/category_tree/0/get_category_suggestions?q=iphone
```

**Response Shape (Relevant Fields):**
```json
{
  "categorySuggestions": [
    {
      "category": {
        "categoryId": "9355",
        "categoryName": "Cell Phones & Smartphones"
      },
      "categoryTreeNodeLevel": 2,
      "categoryTreeNodeAncestors": [
        {
          "categoryId": "15032",
          "categoryName": "Cell Phones & Accessories"
        }
      ]
    }
  ]
}
```

---

## 3. getItemAspectsForCategory

**Endpoint:** `GET https://api.ebay.com/commerce/taxonomy/v1/category_tree/{category_tree_id}/get_item_aspects_for_category`

**HTTP Method:** `GET`

**URI Parameters:**
- `category_tree_id` (Required, String): e.g. `0` for US
- `category_id` (Required, String): The leaf category ID

**Required Headers:**
- `Authorization`: `Bearer <user_access_token>`

**Request Body Schema:** None

**Sample Request:**
```text
GET https://api.ebay.com/commerce/taxonomy/v1/category_tree/0/get_item_aspects_for_category?category_id=9355
```

**Response Shape (Relevant Fields):**
```json
{
  "aspects": [
    {
      "localizedAspectName": "Brand",
      "aspectConstraint": {
        "aspectDataType": "STRING",
        "aspectMode": "FREE_TEXT",
        "aspectRequired": true,
        "itemToAspectCardinality": "SINGLE",
        "aspectMaxLength": 65,
        "expectedRequiredByDate": "2021-09-09T00:00:00.000Z"
      },
      "aspectValues": [
        {
          "localizedValue": "Apple",
          "valueConstraints": [
            {
              "applicableForLocalizedAspectName": "Model",
              "applicableForLocalizedAspectValues": ["iPhone 12", "iPhone 13"]
            }
          ]
        }
      ]
    }
  ]
}
```



## 4. createInventoryLocation
Creates a new inventory location (e.g., a warehouse or store) where you hold inventory. This must be set up before creating an offer.

- **Endpoint**: `POST https://api.ebay.com/sell/inventory/v1/location/{merchantLocationKey}`
- **Method**: `POST`
- **URI Parameters**:
  - `merchantLocationKey` (string, required): A unique, seller-defined identifier for the inventory location (e.g., `primary_warehouse`).
- **Headers**:
  - `Authorization: Bearer <user_access_token>`
  - `Content-Type: application/json`
- **Request Body Shape**:
  ```json
  {
    "location": {
      "address": {
        "addressLine1": "string (Required)",
        "addressLine2": "string (Optional)",
        "city": "string (Required)",
        "stateOrProvince": "string (Required)",
        "postalCode": "string (Required)",
        "country": "string (Required - e.g., 'US')"
      }
    },
    "locationTypes": [
      "string (Required - e.g., 'WAREHOUSE' or 'STORE')"
    ],
    "merchantLocationStatus": "string (Optional - e.g., 'ENABLED' or 'DISABLED')",
    "name": "string (Optional - location name)"
  }
  ```
- **Response Shape**: 
  - `204 No Content` on success (no response body).

---

## 5. getFulfillmentPolicies
Retrieves the seller's fulfillment (shipping) policies for a specific marketplace. You need a policy ID to create an offer.

- **Endpoint**: `GET https://api.ebay.com/sell/account/v1/fulfillment_policy?marketplace_id={marketplace_id}`
- **Method**: `GET`
- **URI Parameters**:
  - `marketplace_id` (string, required): e.g., `EBAY_US`.
- **Headers**:
  - `Authorization: Bearer <user_access_token>`
- **Response Shape** (relevant fields):
  ```json
  {
    "fulfillmentPolicies": [
      {
        "fulfillmentPolicyId": "string",
        "name": "string",
        "description": "string",
        "handlingTime": {
          "unit": "string",
          "value": 1
        },
        "shippingOptions": [ ... ]
      }
    ]
  }
  ```

---

## 6. getReturnPolicies
Retrieves the seller's return policies for a specific marketplace.

- **Endpoint**: `GET https://api.ebay.com/sell/account/v1/return_policy?marketplace_id={marketplace_id}`
- **Method**: `GET`
- **URI Parameters**:
  - `marketplace_id` (string, required): e.g., `EBAY_US`.
- **Headers**:
  - `Authorization: Bearer <user_access_token>`
- **Response Shape** (relevant fields):
  ```json
  {
    "returnPolicies": [
      {
        "returnPolicyId": "string",
        "name": "string",
        "returnsAccepted": true,
        "returnPeriod": {
          "unit": "string",
          "value": 30
        }
      }
    ]
  }
  ```

---

## 7. getPaymentPolicies
Retrieves the seller's payment policies for a specific marketplace.

- **Endpoint**: `GET https://api.ebay.com/sell/account/v1/payment_policy?marketplace_id={marketplace_id}`
- **Method**: `GET`
- **URI Parameters**:
  - `marketplace_id` (string, required): e.g., `EBAY_US`.
- **Headers**:
  - `Authorization: Bearer <user_access_token>`
- **Response Shape** (relevant fields):
  ```json
  {
    "paymentPolicies": [
      {
        "paymentPolicyId": "string",
        "name": "string",
        "paymentMethods": [ ... ]
      }
    ]
  }
  ```

---

## 8. bulkCreateOrReplaceInventoryItem
Creates or updates up to 25 inventory item records in a single request. An inventory item represents the product itself (title, description, aspects, inventory quantity) but is not yet available for sale on eBay (that requires an offer).

- **Endpoint**: `POST https://api.ebay.com/sell/inventory/v1/bulk_create_or_replace_inventory_item`
- **Method**: `POST`
- **Headers**:
  - `Authorization: Bearer <user_access_token>`
  - `Content-Language: en-US`
  - `Content-Type: application/json`
- **Request Body Shape**:
  ```json
  {
    "requests": [
      {
        "sku": "string (Required)",
        "locale": "string (Required - e.g., 'en_US')",
        "product": {
          "title": "string (Required)",
          "description": "string (Optional - product description)",
          "aspects": {
             "Brand": [ "Apple" ],
             "Model": [ "iPhone 13" ]
          },
          "imageUrls": [
            "string (URL to image)"
          ]
        },
        "condition": "string (Required - e.g., 'NEW', 'USED_EXCELLENT')",
        "conditionDescription": "string (Optional - used for non-new items)",
        "availability": {
          "shipToLocationAvailability": {
            "quantity": 10
          }
        }
      }
    ]
  }
  ```
- **Response Shape**:
  ```json
  {
    "responses": [
      {
        "sku": "string",
        "statusCode": 200,
        "errors": [ ... ],
        "warnings": [ ... ]
      }
    ]
  }
  ```

---

## 9. bulkCreateOffer
Creates up to 25 offers in a single request. An offer takes an existing inventory item (by SKU) and pairs it with pricing, business policies, and a marketplace so it can be sold. 
*Note: Created offers are initially "unpublished". You must call a separate publish endpoint, or publish them individually.*

- **Endpoint**: `POST https://api.ebay.com/sell/inventory/v1/bulk_create_offer`
- **Method**: `POST`
- **Headers**:
  - `Authorization: Bearer <user_access_token>`
  - `Content-Language: en-US`
  - `Content-Type: application/json`
- **Request Body Shape**:
  ```json
  {
    "requests": [
      {
        "sku": "string (Required)",
        "marketplaceId": "string (Required - e.g., 'EBAY_US')",
        "format": "string (Required - e.g., 'FIXED_PRICE')",
        "categoryId": "string (Required - category ID for listing)",
        "availableQuantity": 10,
        "listingStartDate": "string (Optional - UTC timestamp e.g. '2026-12-01T20:34:00.000Z' for scheduled listings)",
        "pricingSummary": {
          "price": {
            "value": "string (Required - e.g., '19.99')",
            "currency": "string (Required - e.g., 'USD')"
          }
        },
        "listingPolicies": {
          "fulfillmentPolicyId": "string (Required)",
          "paymentPolicyId": "string (Required)",
          "returnPolicyId": "string (Required)"
        },
        "merchantLocationKey": "string (Required - ties inventory to the offer)"
      }
    ]
  }
  ```
- **Response Shape**:
  ```json
  {
    "responses": [
      {
        "sku": "string",
        "offerId": "string (Required for publishing)",
        "statusCode": 200,
        "errors": [ ... ],
        "warnings": [ ... ]
      }
    ]
  }
  ```

---

## 10. createOffer
Creates a single offer for an inventory item. Use this as a fallback if you need to create a single offer synchronously instead of a batch.

- **Endpoint**: `POST https://api.ebay.com/sell/inventory/v1/offer`
- **Method**: `POST`
- **Headers**:
  - `Authorization: Bearer <user_access_token>`
  - `Content-Language: en-US`
  - `Content-Type: application/json`
- **Request Body Shape**: Same as an individual object within the `requests` array for `bulkCreateOffer`.
- **Response Shape**:
  ```json
  {
    "offerId": "string",
    "warnings": [ ... ]
  }
  ```

---

# Call Order & Architecture

The eBay Sell API enforces a strict hierarchy and architectural flow for creating functional listings from scratch:

1. **Authentication:** Obtain your OAuth token (Refresh Flow) using your credentials and user consent. Include standard headers `Authorization`, `Content-Type`, and `Content-Language`.
2. **Setup Merchant Architecture:**
   - Call **createInventoryLocation** to establish the physical location of the goods. Only needs to be done once per location (`merchantLocationKey`).
   - Call **getFulfillmentPolicies**, **getPaymentPolicies**, and **getReturnPolicies** to fetch your Account Business Policy IDs. All offers require these 3 policy IDs.
3. **Draft the Inventory Item (The Global Product Record):**
   - Call **bulkCreateOrReplaceInventoryItem**. This creates a generic SKU record in eBay's system. The item has details (title, aspects, images, condition, base quantity) but is disconnected from any specific price or marketplace.
   - Use **getCategorySuggestions** and **getItemAspectsForCategory** beforehand to construct valid item aspects and identify the correct Category ID.
4. **Create the Offer (The Localized Listing Record):**
   - Call **bulkCreateOffer** (or **createOffer**). This links a specific `sku` to a specific `marketplaceId`. This action attaches pricing (`pricingSummary`), quantities (`availableQuantity`), the category (`categoryId`), and policies (`listingPolicies`).
   - You must provide the `merchantLocationKey` established in Step 2.
   - **Important:** Creating an offer creates an "Unpublished" listing (essentially a draft).
5. **Publish the Offer:**
   - Note: While not detailed in the specific document requests, publishing requires taking the generated `offerId` from step 4 and executing a publish action to go live on the eBay marketplace.

---

# Error Handling Contract

When interacting with eBay's APIs, parsing errors consistently is critical to robust error handling, especially for bulk endpoints. 

### Singular Endpoints
Standard single-request endpoints generally return HTTP status codes matching standard conventions (200 OK, 201 Created, 204 No Content, 400 Bad Request, 401 Unauthorized, 500 Internal Server error). The body of error responses looks like this:
```json
{
  "errors": [
    {
      "errorId": 2004,
      "domain": "API_INVENTORY",
      "category": "REQUEST",
      "message": "Invalid SKU provided.",
      "longMessage": "The SKU provided contains invalid characters or exceeds the max length.",
      "parameters": [
        { "name": "sku", "value": "INVALID_SKU_$$$" }
      ]
    }
  ]
}
```

### Bulk Endpoints
For bulk endpoints (`bulkCreateOrReplaceInventoryItem`, `bulkCreateOffer`), **the HTTP status code will often be 200 OK even if every single item in the batch failed.** You must inspect the `responses` array individually:
- Each item within the `responses` array contains a `statusCode` field.
- If `statusCode` is `200` or `201`, that specific item succeeded.
- If `statusCode` is `400` or higher, that specific item failed, and an `errors` array will be populated in that same response object.
- **Contract Rule:** Do not rely on the global HTTP status code to verify batch success. Map over the `responses` array, assert `statusCode == 200/201` for each item, and extract `errors` if present.

---

## 11. Best Offer / bestOfferTerms Schema

When enabling the Best Offer feature on eBay, the `bestOfferTerms` object is nested inside the `listingPolicies` container within the `bulkCreateOffer` (and `createOffer`) payloads.

**Important:** This object should *only* be included in the payload when Best Offers are explicitly enabled for the listing. If Best Offer is not enabled, omit the `bestOfferTerms` object entirely.

- **Nesting Location**: `requests[].listingPolicies.bestOfferTerms`
- **Supported Endpoints**: Identically supported by both `/bulk_create_offer` and single `/offer`.
- **Marketplace Constraints**: The payload structure is identical for EBAY_CA and EBAY_US, though the chosen leaf category must support Best Offers.

**Exact Validated Payload Structure:**

```json
"listingPolicies": {
  "fulfillmentPolicyId": "...",
  "paymentPolicyId": "...",
  "returnPolicyId": "...",
  "bestOfferTerms": {
    "bestOfferEnabled": true,
    "autoAcceptPrice": {
      "value": "42.00",
      "currency": "CAD"
    }
  }
}
```

**Validation Rules:**
- `bestOfferEnabled` *(boolean, required if object is present)*: Must be set to `true` to enable the feature. 
- `autoAcceptPrice` *(Amount object, optional)*: If provided, the numeric `value` **must always be strictly lower** than the listing's current 'Buy It Now' price (located at `pricingSummary.price`).

**Source Documentation References:**
- [bulkCreateOffer Method Documentation](https://developer.ebay.com/api-docs/sell/inventory/resources/offer/methods/bulkCreateOffer)
- [slr:BestOffer Type Documentation](https://developer.ebay.com/api-docs/sell/inventory/types/slr:BestOffer)

"autoDeclinePrice is permanently excluded from this application and must never appear in any payload under any circumstance. All offers reach the seller for manual review."

"Not all eBay categories support Best Offers. If eBay returns an error indicating Best Offer is not supported for a specific listing at submission time, the system catches it, marks that listing as bestOfferEligible: false, sets acceptOffers to false, sets autoAcceptPriceCAD to null, and retries that listing without bestOfferTerms. The batch continues regardless."

## 12. publishOffer
Converts an unpublished offer into an active eBay listing.

- **Endpoint**: `POST https://api.ebay.com/sell/inventory/v1/offer/{offerId}/publish`
- **Method**: `POST`
- **URI Parameters**:
  - `offerId` (string, required): The unique identifier of the offer to publish (obtained from `bulkCreateOffer` or `createOffer`).
- **Headers**:
  - `Authorization: Bearer <user_access_token>`
  - `Content-Language: en-US`
- **Request Body Shape**: None.
- **Response Shape**:
  ```json
  {
    "listingId": "string (The newly created active eBay listing item ID)",
    "warnings": [ ... ]
  }
  ```

---

## 13. getOffer
Retrieves the details of a single customized offer.

- **Endpoint**: `GET https://api.ebay.com/sell/inventory/v1/offer/{offerId}`
- **Method**: `GET`
- **URI Parameters**:
  - `offerId` (string, required): The precise offer ID you wish to retrieve.
- **Headers**:
  - `Authorization: Bearer <user_access_token>`
- **Response Shape** (relevant fields):
  ```json
  {
    "sku": "string",
    "marketplaceId": "string",
    "format": "string",
    "categoryId": "string",
    "availableQuantity": 10,
    "pricingSummary": {
      "price": { "value": "19.99", "currency": "CAD" }
    },
    "listingPolicies": {
      "fulfillmentPolicyId": "...",
      "paymentPolicyId": "...",
      "returnPolicyId": "...",
      "bestOfferTerms": { ... }
    },
    "listing": {
      "listingId": "string",
      "listingStatus": "string (e.g. 'ACTIVE', 'ENDED', 'OUT_OF_STOCK')"
    }
  }
  ```

---

## 14. getOffers
Retrieves all offers associated with a specific inventory item SKU. Useful because one SKU can have multiple offers (e.g., across different eBay marketplaces).

- **Endpoint**: `GET https://api.ebay.com/sell/inventory/v1/offer?sku={sku}&marketplace_id={marketplace_id}&limit={limit}&offset={offset}`
- **Method**: `GET`
- **URI Parameters**:
  - `sku` (string, required): The SKU to retrieve offers for.
  - `marketplace_id` (string, optional): Filter offers down to a specific marketplace (e.g., EBAY_US).
  - `format` (string, optional): Filter by `FIXED_PRICE` or `AUCTION`.
  - `limit` (string, optional): Max number of items to return.
  - `offset` (string, optional): Pagination offset.
- **Headers**:
  - `Authorization: Bearer <user_access_token>`
- **Response Shape**:
  ```json
  {
    "href": "string",
    "limit": 25,
    "next": "string (URL to next page)",
    "offers": [
      {
        "offerId": "string",
        "sku": "string",
        "marketplaceId": "string",
        "format": "string",
        "categoryId": "string",
        "pricingSummary": { ... },
        "listing": {
          "listingId": "string",
          "listingStatus": "string"
        }
      }
    ]
  }
  ```



## 15. createOrReplaceInventoryItem
Revises (or creates) an individual inventory item record. This is the singular equivalent to `bulkCreateOrReplaceInventoryItem`. Useful for updating quantities, product aspects, condition, or images for a specific SKU.

- **Endpoint**: `PUT https://api.ebay.com/sell/inventory/v1/inventory_item/{sku}`
- **Method**: `PUT`
- **URI Parameters**:
  - `sku` (string, required): The seller-defined SKU of the inventory item to create or properly replace/update.
- **Headers**:
  - `Authorization: Bearer <user_access_token>`
  - `Content-Language: en-US`
  - `Content-Type: application/json`
- **Request Body Shape**: (Similar to objects in the `bulkCreate` array)
  ```json
  {
    "product": {
      "title": "string",
      "description": "string",
      "aspects": { "Brand": ["Apple"] },
      "imageUrls": [ "string" ]
    },
    "condition": "string",
    "availability": {
      "shipToLocationAvailability": {
        "quantity": 10
      }
    }
  }
  ```
- **Response Shape**: 
  - On Success: `204 No Content`
  - On warnings/partial success:
  ```json
  {
    "warnings": [ ... ]
  }
  ```

---

## 16. updateOffer
Revises an existing offer. Use this to update the pricing, available quantity (local to the offer), or listing policies of an already created (and potentially published) offer. If the offer is published, updating the offer actively updates the live eBay listing.

- **Endpoint**: `PUT https://api.ebay.com/sell/inventory/v1/offer/{offerId}`
- **Method**: `PUT`
- **URI Parameters**:
  - `offerId` (string, required): The eBay-generated ID of the offer you want to update.
- **Headers**:
  - `Authorization: Bearer <user_access_token>`
  - `Content-Language: en-US`
  - `Content-Type: application/json`
- **Request Body Shape**:
  ```json
  {
    "availableQuantity": 15,
    "categoryId": "string",
    "format": "string (e.g. 'FIXED_PRICE')",
    "listingStartDate": "string (Optional - UTC timestamp for scheduled listings)",
    "listingPolicies": {
      "fulfillmentPolicyId": "...",
      "paymentPolicyId": "...",
      "returnPolicyId": "..."
    },
    "merchantLocationKey": "string",
    "pricingSummary": {
      "price": { "value": "18.99", "currency": "CAD" }
    }
  }
  ```
- **Response Shape**:
  ```json
  {
    "offerId": "string",
    "warnings": [ ... ]
  }
  ```

---

## 17. getCategoryTree
Retrieves the complete category tree for a specified marketplace. Since full trees are massive, caching the response locally is highly recommended.

- **Endpoint**: `GET https://api.ebay.com/commerce/taxonomy/v1/category_tree/{category_tree_id}`
- **Method**: `GET`
- **URI Parameters**:
  - `category_tree_id` (string, required): Identifier for the category tree (e.g., '0' for the US marketplace, '2' for Canada).
- **Headers**:
  - `Authorization: Bearer <user_access_token>` (Client Credentials grant is supported here)
  - `Accept-Encoding: gzip` (Highly recommended to reduce payload size)
- **Response Shape**:
  ```json
  {
    "categoryTreeId": "string",
    "categoryTreeVersion": "string",
    "applicableMarketplaceIds": [ "EBAY_US" ],
    "rootCategoryNode": {
      "category": {
        "categoryId": "string",
        "categoryName": "string"
      },
      "categoryTreeNodeLevel": 1,
      "childCategoryTreeNodes": [
        {
           "category": { "categoryId": "...", "categoryName": "..." },
           "childCategoryTreeNodes": [ ... ]
        }
      ]
    }
  }
  ```



## 18. getCategorySubtree
Retrieves the category subtree for a specific category within a given category tree. This is more efficient than downloading the entire tree if you only need the local branch of a known category.

- **Endpoint**: `GET https://api.ebay.com/commerce/taxonomy/v1/category_tree/{category_tree_id}/get_category_subtree?category_id={category_id}`
- **Method**: `GET`
- **URI Parameters**:
  - `category_tree_id` (string, required): Identifier for the category tree (e.g., '0' for US).
  - `category_id` (string, required): The root of the subtree to fetch.
- **Headers**:
  - `Authorization: Bearer <user_access_token>`
  - `Accept-Encoding: gzip` (Optional but highly recommended)
- **Response Shape**:
  ```json
  {
    "categorySubtreeNode": {
      "category": {
        "categoryId": "string",
        "categoryName": "string"
      },
      "categoryTreeNodeLevel": 2,
      "childCategoryTreeNodes": [
        {
          "category": { "categoryId": "...", "categoryName": "..." },
           "leafCategoryTreeNode": true,
           "parentCategoryTreeNodeHref": "string"
        }
      ]
    }
  }
  ```

---

## 19. search (Product Catalog)
Searches the eBay Catalog for products. Essential for finding the exact `epid` to associate an inventory item with an eBay catalog product. You can search by keywords (`q`), UPC, GTIN, or MPN.

- **Endpoint**: `GET https://api.ebay.com/commerce/catalog/v1/product_summary/search`
- **Method**: `GET`
- **URI Parameters**:
  - `q` (string): Keywords to search for.
  - `gtin` (string): Global Trade Item Number (UPC, ISBN, EAN).
  - `mpn` (string): Manufacturer Part Number.
  - `category_ids` (string): Restrict search to specific categories.
  - `limit` (string): Max items to return.
- **Headers**:
  - `Authorization: Bearer <user_access_token>`
  - `X-EBAY-C-MARKETPLACE-ID: EBAY_US` (Required to know which marketplace catalog to search)
- **Response Shape**:
  ```json
  {
    "total": 100,
    "productSummaries": [
      {
        "epid": "string (the eBay catalog product ID)",
        "title": "string",
        "brand": "string",
        "upc": ["string"],
        "isbn": ["string"],
        "mpn": ["string"],
        "image": { "imageUrl": "string" },
        "productWebUrl": "string"
      }
    ]
  }
  ```

---

## 20. getProduct (Catalog API)
Retrieves detailed information about a single eBay catalog product using its `epid`.

- **Endpoint**: `GET https://api.ebay.com/commerce/catalog/v1/product/{epid}`
- **Method**: `GET`
- **URI Parameters**:
  - `epid` (string, required): The eBay Product ID.
- **Headers**:
  - `Authorization: Bearer <user_access_token>`
  - `X-EBAY-C-MARKETPLACE-ID: EBAY_US`
- **Response Shape**:
  ```json
  {
    "epid": "string",
    "title": "string",
    "brand": "string",
    "upc": ["string"],
    "version": "string",
    "productWebUrl": "string"
  }
  ```



## 21. search (Marketplace Listings)
Searches the live eBay marketplace for active listings. Using the Buy API's browse endpoints allows you to find competitor prices, look up items by charity, or discover sold listings.

- **Endpoint**: `GET https://api.ebay.com/buy/browse/v1/item_summary/search?q={keyword}&category_ids={category_ids}&limit={limit}`
- **Method**: `GET`
- **URI Parameters**:
  - `q` (string): Keywords.
  - `gtin` (string): Global Trade Item Number.
  - `charity_ids` (string): Search by charity EIN prefix.
  - `limit` (string): Number of items to return.
- **Headers**:
  - `Authorization: Bearer <user_access_token>`
  - `X-EBAY-C-MARKETPLACE-ID: EBAY_US` (Required)
- **Response Shape**:
  ```json
  {
    "href": "string",
    "total": 100,
    "itemSummaries": [
      {
        "itemId": "string",
        "title": "string",
        "price": { "value": "19.99", "currency": "CAD" },
        "condition": "string",
        "buyingOptions": ["FIXED_PRICE"],
        "itemWebUrl": "string"
      }
    ]
  }
  ```

---

## 22. getItem
Retrieves full details of a specific, active eBay listing anywhere on the platform (unlike `getOffer`, which only retrieves *your* offers). Use this for looking up competitor listing details.

- **Endpoint**: `GET https://api.ebay.com/buy/browse/v1/item/{item_id}`
- **Method**: `GET`
- **URI Parameters**:
  - `item_id` (string, required): The RESTful eBay Item ID (format: `v1|123456789012|0`). Note that legacy item IDs must be prefixed/suffixed.
- **Headers**:
  - `Authorization: Bearer <user_access_token>`
  - `X-EBAY-C-MARKETPLACE-ID: EBAY_US` (Required)
- **Response Shape**:
  ```json
  {
    "itemId": "string",
    "title": "string",
    "shortDescription": "string",
    "price": { "value": "19.99", "currency": "CAD" },
    "categoryPath": "string",
    "condition": "string",
    "buyingOptions": ["FIXED_PRICE"],
    "seller": {
      "username": "string",
      "feedbackPercentage": "99.0",
      "feedbackScore": 1000
    },
    "itemWebUrl": "string"
  }
  ```



## 23. getDefaultCategoryTreeId
Retrieves the default category tree ID for a specific eBay marketplace. This ID is required before calling `getCategoryTree` or `getCategorySubtree` since category trees are marketplace-specific.

- **Endpoint**: `GET https://api.ebay.com/commerce/taxonomy/v1/get_default_category_tree_id?marketplace_id={marketplace_id}`
- **Method**: `GET`
- **URI Parameters**:
  - `marketplace_id` (string, required): The marketplace identifier (e.g., 'EBAY_US', 'EBAY_CA').
- **Headers**:
  - `Authorization: Bearer <user_access_token>` (Client Credentials grant supported)
- **Response Shape**:
  ```json
  {
    "categoryTreeId": "string",
    "categoryTreeVersion": "string"
  }
  ```



---

## 24. Researching Sold & Completed Listings
The standard Buy Browse API only supports searching for active listings. To search for sold or completed listings, eBay requires the use of the **Marketplace Insights API**.

- **Important Restriction**: The Marketplace Insights API is a restricted API. Access is not granted automatically. You must log into the eBay Developer Portal, navigate to your application, and submit a formal request for access explaining your use case for historical pricing/sold data.
- **Endpoint (Once Approved)**: `GET https://api.ebay.com/buy/marketplace_insights/v1_beta/item_sales/search?q={keyword}`
- **Functionality**: Returns sales history and sold prices for items ending within the last 90 days.

