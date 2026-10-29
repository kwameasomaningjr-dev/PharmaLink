# Customer mobile API contract baseline

The Flutter app uses the existing `/v1` API. Successful responses use:

```json
{
  "success": true,
  "data": {},
  "meta": {}
}
```

Errors use:

```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "User-safe message",
    "details": {},
    "request_id": "req_..."
  }
}
```

## Customer-facing routes currently available

| Capability | Method and route | Auth |
|---|---|---|
| Register | `POST /v1/auth/register` | Public |
| Login | `POST /v1/auth/login` | Public |
| Current profile | `GET /v1/auth/me` | Bearer |
| Update profile | `PATCH /v1/auth/profile` | Bearer |
| Medicine search | `GET /v1/medicines/search` | Optional bearer |
| Medicine list/search | `GET /v1/medicines` | Public |
| Medicine detail | `GET /v1/medicines/:id` | Public |
| Verified pharmacies | `GET /v1/pharmacies` | Public |
| Pharmacy detail | `GET /v1/pharmacies/:id` | Public |
| Pharmacy availability | `GET /v1/pharmacies/:id/availability` | Public |
| Create order | `POST /v1/orders` | Bearer |
| Customer orders | `GET /v1/orders` | Bearer |
| Order detail | `GET /v1/orders/:id` | Bearer |
| Cancel order | `POST /v1/orders/:id/cancel` | Bearer |
| Notifications | `GET /v1/notifications` | Bearer |
| Mark notification read | `PATCH /v1/notifications/:id/read` | Bearer |
| Mark all read | `PATCH /v1/notifications/read-all` | Bearer |
| Notification preferences | `GET/PATCH /v1/notifications/preferences` | Customer |
| Upload prescription | `POST /v1/prescriptions` | Bearer |
| Prescription detail | `GET /v1/prescriptions/:id` | Bearer |
| Prescription file | `GET /v1/prescriptions/:id/file` | Bearer |
| Start payment | `POST /v1/payments/orders/:orderId/payments` | Customer |
| Payment detail | `GET /v1/payments/:id` | Bearer |
| Verify payment | `GET /v1/payments/verify/:reference` | Bearer |

## Contract constraints

- Login and registration return a bearer token in `data.token`.
- The current backend issues a seven-day JWT and does not expose refresh-token
  rotation. Mobile session refresh must not be invented in the client.
- Prescription uploads accept one PDF, JPEG, or PNG file up to 5 MB.
- Order submission should support an `Idempotency-Key` header once the backend
  contract formally accepts and persists it for order creation.
- Payment initiation is provider-dependent and must display the returned status;
  the client must not assume success from the initiation response.
- Prescription and order resources must remain authorized by the backend; the
  client must not infer ownership from locally cached identifiers.

## API gaps to resolve before dependent features

1. Define refresh/revocation behavior for mobile sessions, or explicitly accept
   re-login after JWT expiry.
2. Add structured order status history for a reliable customer timeline.
3. Add push-token registration and revocation endpoints.
4. Confirm idempotency persistence for order creation, not only payment creation.
5. Add customer address persistence if delivery addresses should be reusable.
6. Document upload response fields and safe prescription status metadata.
