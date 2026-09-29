# Commerce and frontend pilot boundaries

## Payments

The payment API is provider-neutral. `POST /v1/payments/orders/:orderId/payments`
requires an `Idempotency-Key` header and creates an `INITIATED`/`PENDING` record
without claiming that money was collected. The default adapter is deliberately
`unavailable`; it does not produce provider references or successful payments.

Provider implementations must verify signed webhooks before changing a payment
to `SUCCESS`, `FAILED`, or a refund state. Refund requests remain unavailable
until a real provider adapter is configured. This keeps the pilot honest and
allows a provider to be selected later without changing order code.

Payment creation reserves the idempotency key before calling the provider, so
concurrent retries cannot create two provider attempts. Webhooks require the
raw request payload, a provider reference, a known status, and a valid state
transition; duplicate provider events are ignored.

## Notifications

Order and prescription workflows enqueue notifications as `QUEUED`. A provider
adapter must return a provider-confirmed message ID before a notification is
marked `SENT`. The default provider is unavailable, so dispatch records
`FAILED` with diagnostic text instead of fabricating delivery.

Notification queue keys are unique and duplicate enqueue requests return the
existing notification ID.

## Inventory integrations

CSV import is supported and preserves partial results. The parser handles
quoted fields, validates quantities/prices, and records sync history. POS sync
is adapter-based and unavailable until a real provider is configured; the
application no longer generates demo POS stock in a production path.

## Frontend packaging

The active UI source is `public/app.jsx`, compiled into the self-contained
`public/app.js` browser bundle by `npm run build:frontend`. The HTML entrypoint
does not load React, ReactDOM, Babel, or fonts from a CDN, so the application can
load offline after the server starts. The customer experience has separate
client routes for `/`, `/medicines`, `/pharmacies`, `/prescriptions`, and
`/how-it-works`. The Medicines route uses a Drugnelly-inspired catalog layout
with category filters, grouped medicine cards, Rx labels, prices, and nearby
pharmacy availability. The source uses a root loading fallback and a React
error boundary for visible initialization and render failures.

## Security gates

Helmet security headers and API rate limiting are enabled. `JWT_SECRET` must be
a unique value of at least 32 characters in production, and `CORS_ORIGIN` must
explicitly list trusted frontend origins. Prescription files are limited to
5 MB PDF/JPEG/PNG uploads, validated by file signature, and stored outside the
public directory under opaque names.

The default `UPLOAD_DIR=./uploads` is suitable for a single controlled pilot.
Before a multi-instance production launch, move it to encrypted private object
storage with retention/deletion policies and backups.

Run `npm run build` before deployment. This compiles the frontend bundle and
then type-checks the backend.
