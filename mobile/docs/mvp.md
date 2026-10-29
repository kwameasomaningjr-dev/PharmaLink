# Customer mobile MVP

## Primary journey

1. Customer opens the app and searches for a medicine.
2. The app shows verified pharmacies, availability state, freshness, distance,
   price, and pickup/delivery support.
3. Customer selects a pharmacy, reviews the basket, and chooses pickup or delivery.
4. Customer submits the order and sees the server-confirmed pending state.
5. If required, the customer uploads a prescription associated with the order.
6. Customer receives status updates and can review order history.

## Screens

| Screen | Required behavior |
|---|---|
| Search home | Search by generic, brand, alias, or strength; show recent query only if locally safe |
| Search results | Show loading, empty, unavailable, uncertain, and retry states |
| Medicine detail | Show prescription requirement and available pharmacy options |
| Pharmacy detail | Show verified identity, hours, fulfillment options, distance, and availability |
| Cart/review | Show selected items, quantities, server prices, delivery fee, and total |
| Fulfillment | Require an address for delivery and clearly distinguish pickup |
| Order detail | Show server status, response window, timestamps, and safe next actions |
| Order history | Show customer-owned orders only |
| Prescription upload | Accept PDF/JPEG/PNG up to the backend limit with progress and retry |
| Notifications | Show read state and deep-link only to authorized customer resources |
| Profile/settings | Show account information, notification preference, and logout |

## Safety and failure behavior

- Server-provided price, availability, prescription, payment, and order states are
  authoritative.
- The app must never claim that a medicine is available when the API reports an
  uncertain or stale state.
- A failed order submission must be retryable without creating duplicates.
- A payment initiation response must be displayed as pending until verified.
- Prescription files must not be written to ordinary logs or exposed in analytics.
- Network failures must preserve unsent form state where safe and explain the retry
  action.
- Location denial must fall back to manual pharmacy browsing rather than blocking
  search.
- Customer-only resources must be rejected by the backend even if a customer edits
  local identifiers or deep-link parameters.

## Out of scope

- Pharmacy staff dashboards.
- Platform operations.
- Loyalty and rewards.
- Chat and telehealth.
- Saved payment credentials.
- Offline order submission.
